import { BlurView } from 'expo-blur';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { LinearGradient } from 'expo-linear-gradient';
import MeshGradient, { ALBUM_COLORS } from '@/components/MeshGradient';
import { extractDominantColors } from '@/lib/color-extract';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, MoreVertical, Plus, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/use-auth';
import { getArtifactUrls, uploadArtifact, type ContentType, type Variant } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

type Album = Database['public']['Tables']['albums']['Row'];
type ArtifactRow = Database['public']['Tables']['artifacts']['Row'];
type GridItem = ArtifactRow & { url: string | null };

function toContentType(raw: string): ContentType {
  switch (raw) {
    case 'image/png':
      return 'image/png';
    case 'video/mp4':
      return 'video/mp4';
    case 'video/quicktime':
      return 'video/quicktime';
    default:
      return 'image/jpeg';
  }
}

function parseExifDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const iso = raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

// Returns resize options for the new chained ImageManipulator API.
// Pass one dimension so the other auto-calculates (preserves aspect ratio).
function thumbResize(w: number, h: number): { width?: number; height?: number } | null {
  const short = Math.min(w, h);
  if (short <= 400) return null;
  return w <= h ? { width: 400 } : { height: 400 };
}

function displayResize(w: number, h: number): { width?: number; height?: number } | null {
  const long = Math.max(w, h);
  if (long <= 2048) return null;
  return w >= h ? { width: 2048 } : { height: 2048 };
}

async function resizeToJpeg(
  uri: string,
  resize: { width?: number; height?: number } | null,
  compress: number,
): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (resize) ctx.resize(resize);
  const ref = await ctx.renderAsync();
  const result = await ref.saveAsync({ format: SaveFormat.JPEG, compress });
  return result.uri;
}

// Extracts a still frame from the middle of a video for use as thumb/poster.
// durationMs comes from expo-image-picker's asset.duration (milliseconds).
async function extractVideoFrame(
  uri: string,
  durationMs: number,
): Promise<{ uri: string; width: number; height: number }> {
  const middleMs = Math.max(0, Math.round(durationMs / 2));
  return VideoThumbnails.getThumbnailAsync(uri, { time: middleMs, quality: 1 });
}

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [album, setAlbum] = useState<Album | null>(null);
  const [albumLoading, setAlbumLoading] = useState(true);
  const [artifacts, setArtifacts] = useState<GridItem[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [menuOpen, setMenuOpen] = useState(false);

  // Fetch album metadata once
  useEffect(() => {
    supabase
      .from('albums')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) setAlbum(data);
        setAlbumLoading(false);
      });
  }, [id]);

  // Fetch artifacts (and their signed URLs) every time the screen focuses
  const fetchArtifacts = useCallback(async () => {
    setArtifactsLoading(true);

    const { data } = await supabase
      .from('album_artifacts')
      .select('position, artifacts(*)')
      .eq('album_id', id)
      .order('position', { ascending: true });

    if (!data) {
      setArtifactsLoading(false);
      return;
    }

    // RLS already filters removed/deleted rows; keep only ready artifacts
    const rows = data
      .map((row) => row.artifacts as ArtifactRow | null)
      .filter((a): a is ArtifactRow => a !== null && a.status === 'ready');

    // Batch-fetch signed view URLs
    const urlMap: Record<string, string> = {};
    if (rows.length > 0) {
      try {
        const signed = await getArtifactUrls(
          rows.map((a) => ({
            artifactId: a.id,
            variant: 'thumb' as Variant,
            contentType: 'image/jpeg' as const,
          })),
        );
        for (const { artifactId, url } of signed) {
          urlMap[artifactId] = url;
        }
      } catch (e) {
        console.error('[AlbumScreen] getArtifactUrls failed:', e);
      }
    }

    setArtifacts(rows.map((a) => ({ ...a, url: urlMap[a.id] ?? null })));
    setArtifactsLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void fetchArtifacts();
    }, [fetchArtifacts]),
  );

  const handleUpload = async () => {
    if (!user) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 1,
      exif: true,
    });

    if (result.canceled || result.assets.length === 0) return;

    // Check if the album currently has no artifacts so we know whether the
    // first item in this batch will become the first-ordered image.
    // TODO: when users can select cover images, run color extraction only for
    //       the designated cover artifact instead of the first uploaded image.
    const { count: existingCount } = await supabase
      .from('album_artifacts')
      .select('*', { count: 'exact', head: true })
      .eq('album_id', id);
    const isFirstInAlbum = (existingCount ?? 0) === 0;

    setUploadProgress({ current: 0, total: result.assets.length });
    let failed = 0;

    for (let i = 0; i < result.assets.length; i++) {
      const asset = result.assets[i];
      const artifactId = Crypto.randomUUID();
      const contentType = toContentType(asset.mimeType ?? '');

      setUploadProgress({ current: i + 1, total: result.assets.length });

      const isVideo = asset.type === 'video';
      const { error: insertError } = await supabase.from('artifacts').insert({
        id: artifactId,
        uploaded_by: user.id,
        media_type: isVideo ? 'video' : 'photo',
        status: 'uploading',
        width: asset.width ?? 0,
        height: asset.height ?? 0,
        original_content_type: contentType,
        file_size_bytes: asset.fileSize ?? 0,
        taken_at: parseExifDate(asset.exif?.DateTimeOriginal ?? asset.exif?.DateTime),
      });

      if (insertError) {
        failed++;
        continue;
      }

      try {
        const w = asset.width ?? 0;
        const h = asset.height ?? 0;

        let uploadFiles: Parameters<typeof uploadArtifact>[1];
        if (isVideo) {
          const frame = await extractVideoFrame(asset.uri, asset.duration ?? 0);
          const [thumbUri, posterUri] = await Promise.all([
            resizeToJpeg(frame.uri, thumbResize(frame.width, frame.height), 0.8),
            resizeToJpeg(frame.uri, displayResize(frame.width, frame.height), 0.85),
          ]);
          uploadFiles = [
            { variant: 'original', localUri: asset.uri, contentType },
            { variant: 'thumb', localUri: thumbUri, contentType: 'image/jpeg' },
            { variant: 'poster', localUri: posterUri, contentType: 'image/jpeg' },
          ];
        } else {
          const [thumbUri, displayUri] = await Promise.all([
            resizeToJpeg(asset.uri, thumbResize(w, h), 0.8),
            resizeToJpeg(asset.uri, displayResize(w, h), 0.85),
          ]);
          uploadFiles = [
            { variant: 'original', localUri: asset.uri, contentType },
            { variant: 'thumb', localUri: thumbUri, contentType: 'image/jpeg' },
            { variant: 'display', localUri: displayUri, contentType: 'image/jpeg' },
          ];
        }

        await uploadArtifact(artifactId, uploadFiles);

        // Extract dominant colors from the local thumb for the first image in
        // the album — used to seed the mesh gradient on the album detail screen.
        const thumbUri = uploadFiles.find((f) => f.variant === 'thumb')?.localUri;
        const dominantColors =
          i === 0 && isFirstInAlbum && thumbUri
            ? await extractDominantColors(thumbUri, 5).catch(() => null)
            : null;

        await Promise.all([
          supabase
            .from('artifacts')
            .update({
              status: 'ready',
              ...(dominantColors ? { dominant_colors: dominantColors } : {}),
            })
            .eq('id', artifactId),
          supabase.from('album_artifacts').insert({
            album_id: id,
            artifact_id: artifactId,
            position: Date.now() + i,
            added_by: user.id,
          }),
        ]);
      } catch {
        await supabase.from('artifacts').update({ status: 'failed' }).eq('id', artifactId);
        failed++;
      }
    }

    setUploadProgress(null);
    if (failed > 0) {
      Alert.alert(
        'Upload finished',
        `${result.assets.length - failed} succeeded, ${failed} failed.`,
      );
    }
    fetchArtifacts();
  };

  // TODO: add a "Recently Deleted" section on the albums screen where soft-deleted albums can be
  //       recovered within a grace period (e.g. 30 days) before permanent deletion.
  // TODO: replace this single delete action with two options — "Delete for Everyone" (removes the
  //       album for all members) vs "Remove for Me" (hides it only from the current user's view,
  //       leaving it intact for other members). Distinction matters once shared albums are live.
  const handleDeleteAlbum = () => {
    setMenuOpen(false);
    Alert.alert(
      'Delete Album',
      'This will permanently delete the album. Photos will not be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase
              .from('albums')
              .update({ deleted_at: new Date().toISOString() })
              .eq('id', id);
            router.back();
          },
        },
      ],
    );
  };

  const uploading = uploadProgress !== null;

  // ── Layout constants ────────────────────────────────────────────────────────
  const COVER_WIDTH = 225;
  const COVER_HEIGHT = Math.round(COVER_WIDTH * 1.3);
  // Space reserved above the book for the button row (8 top offset + 44 button + 16 gap)
  const BUTTON_AREA = 68;
  // Shelf line sits 75% of the way down the book cover; BUTTON_AREA pushes book below buttons
  const SHELF_HEIGHT = Math.round(COVER_HEIGHT * 0.75) + BUTTON_AREA;
  const COVER_MARGIN_TOP = -Math.round(COVER_HEIGHT * 0.75);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* ── Shelf header ── */}
        <View style={{ height: insets.top + SHELF_HEIGHT }}>
          <MeshGradient
            seed={id}
            colors={artifacts[0]?.dominant_colors ?? ALBUM_COLORS}
            grain={0}
            style={StyleSheet.absoluteFill}
          />
          {/* Shelf line */}
          <View
            style={[StyleSheet.absoluteFill, styles.shelfLine, { top: undefined, bottom: 0 }]}
          />
          {/* Back button */}
          <Pressable
            style={{ position: 'absolute', top: insets.top + 8, left: 16 }}
            onPress={() => router.back()}
            hitSlop={8}
          >
            {/* Shadow lives here — overflow:hidden would clip it */}
            <View style={styles.navBtnShadow}>
              <View style={styles.navBtnClip}>
                <BlurView
                  intensity={40}
                  tint="systemUltraThinMaterialDark"
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View style={[StyleSheet.absoluteFill, styles.navBtnOverlay]} />
                  <ArrowLeft size={20} color="#FFFFFF" />
                </BlurView>
              </View>
            </View>
          </Pressable>

          {/* Menu (3-dot) button */}
          <Pressable
            style={{ position: 'absolute', top: insets.top + 8, right: 16 }}
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
          >
            <View style={styles.navBtnShadow}>
              <View style={styles.navBtnClip}>
                <BlurView
                  intensity={40}
                  tint="systemUltraThinMaterialDark"
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View style={[StyleSheet.absoluteFill, styles.navBtnOverlay]} />
                  <MoreVertical size={20} color="#FFFFFF" />
                </BlurView>
              </View>
            </View>
          </Pressable>
        </View>

        {/* ── Book cover (overlaps shelf) ── */}
        <View style={{ alignItems: 'center', marginTop: COVER_MARGIN_TOP }}>
          <View
            style={{
              width: COVER_WIDTH,
              height: COVER_HEIGHT,
              borderRadius: 2,
              overflow: 'hidden',
              backgroundColor: '#FFFFFF',
              shadowColor: '#000',
              shadowOffset: { width: 36, height: 20 },
              shadowOpacity: 0.8,
              shadowRadius: 32,
              elevation: 32,
            }}
          >
            <View
              style={{
                flex: 1,
                paddingTop: 12,
                paddingBottom: 12,
                paddingLeft: 24,
                paddingRight: 12,
              }}
            >
              {/* Title — TODO: font discovery for cover typography (try Playfair Display, Cormorant, etc.) */}
              <Text
                style={{
                  color: '#1A1A1A',
                  fontSize: 14,
                  fontWeight: '700',
                  lineHeight: 20,
                  marginBottom: 14,
                  marginTop: 6,
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  fontFamily: 'Georgia',
                  letterSpacing: 1,
                }}
                numberOfLines={4}
              >
                {album?.title}
              </Text>
              {/* Cover image */}
              <View
                style={{ flex: 1, borderRadius: 3, overflow: 'hidden', backgroundColor: '#E8E4DF' }}
              >
                {artifacts[0]?.url ? (
                  <Image
                    source={{ uri: artifacts[0].url }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                ) : null}
              </View>
            </View>
            {/* Spine */}
            <LinearGradient
              colors={[
                'rgba(0,0,0,0)',
                'rgba(0,0,0,0.22)',
                'rgba(0,0,0,0)',
                'rgba(255,255,255,0.13)',
                'rgba(255,255,255,0)',
              ]}
              locations={[0, 0.15, 0.3, 0.5, 0.75]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ position: 'absolute', top: 0, left: 5, bottom: 0, width: 26 }}
              pointerEvents="none"
            />
            {/* Bottom shadow */}
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.25)']}
              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 32 }}
              pointerEvents="none"
            />
          </View>
        </View>

        {/* ── Title & description ── */}
        <View
          style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28 }}
        >
          {albumLoading ? (
            <ActivityIndicator color="#A3A3A3" />
          ) : (
            <>
              <Text
                style={{ color: '#F5F5F5', fontSize: 32, fontWeight: '700', textAlign: 'center' }}
              >
                {album?.title}
              </Text>
              {album?.description ? (
                <Text style={{ color: '#A3A3A3', fontSize: 16, textAlign: 'center', marginTop: 6 }}>
                  {album.description}
                </Text>
              ) : null}
            </>
          )}
        </View>

        {/* ── Separator ── */}
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />

        {/* ── Image grid ── */}
        {artifactsLoading ? (
          <ActivityIndicator color="#A3A3A3" style={{ marginTop: 60 }} />
        ) : (
          // TODO: virtualize grid for large albums
          (() => {
            const allItems: (GridItem | 'upload')[] = ['upload', ...artifacts];
            return (
              <View style={{ gap: 6 }}>
                {Array.from({ length: Math.ceil(allItems.length / 3) }, (_, row) => {
                  const rowItems = allItems.slice(row * 3, row * 3 + 3);
                  const padded: (GridItem | 'upload' | null)[] = [
                    ...rowItems,
                    ...Array<null>(3 - rowItems.length).fill(null),
                  ];
                  return (
                    <View key={row} style={{ flexDirection: 'row', gap: 6 }}>
                      {padded.map((item, col) => {
                        if (item === 'upload') {
                          return (
                            <Pressable
                              key="upload"
                              disabled={uploading}
                              onPress={handleUpload}
                              style={{
                                flex: 1,
                                aspectRatio: 1,
                                borderRadius: 4,
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                              }}
                            >
                              <View
                                pointerEvents="none"
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  borderWidth: 1.5,
                                  borderColor: '#404040',
                                  borderStyle: 'dashed',
                                  borderRadius: 4,
                                }}
                              />
                              {uploading ? (
                                <ActivityIndicator color="#A3A3A3" />
                              ) : (
                                <>
                                  <Plus size={22} color="#A3A3A3" />
                                  <Text
                                    style={{
                                      color: '#A3A3A3',
                                      fontSize: 14,
                                      fontWeight: '500',
                                    }}
                                  >
                                    Upload Artifacts
                                  </Text>
                                </>
                              )}
                            </Pressable>
                          );
                        }
                        if (item) {
                          return (
                            <TouchableOpacity
                              key={item.id}
                              activeOpacity={0.8}
                              style={{
                                flex: 1,
                                aspectRatio: 1,
                                backgroundColor: '#1C1C1E',
                                borderRadius: 4,
                                overflow: 'hidden',
                              }}
                              onPress={() =>
                                router.push({
                                  pathname: '/album/artifact',
                                  params: {
                                    artifactId: item.id,
                                    mediaType: item.media_type,
                                    contentType: item.original_content_type,
                                  },
                                })
                              }
                            >
                              {item.url ? (
                                <Image
                                  source={{ uri: item.url }}
                                  style={{ width: '100%', height: '100%' }}
                                  contentFit="cover"
                                  transition={200}
                                />
                              ) : null}
                            </TouchableOpacity>
                          );
                        }
                        return <View key={`empty-${col}`} style={{ flex: 1, aspectRatio: 1 }} />;
                      })}
                    </View>
                  );
                })}
              </View>
            );
          })()
        )}
      </ScrollView>

      {/* Dropdown menu */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        {/* Dim overlay */}
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={() => setMenuOpen(false)}
        />
        {/* Menu card — anchored top-right, slides over the overlay */}
        <View
          style={{
            position: 'absolute',
            top: insets.top + 64,
            right: 16,
            width: 220,
            borderRadius: 16,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.5,
            shadowRadius: 24,
            elevation: 24,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <BlurView
            intensity={60}
            tint="systemUltraThinMaterialDark"
            style={{ overflow: 'hidden' }}
          >
            <View style={{ backgroundColor: 'rgba(28,28,30,0.7)' }}>
              {/* Delete action */}
              <Pressable onPress={handleDeleteAlbum}>
                {({ pressed }) => (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      backgroundColor: pressed ? 'rgba(239,68,68,0.08)' : 'transparent',
                    }}
                  >
                    <Trash2 size={20} color="#EF4444" />
                    <Text style={{ color: '#EF4444', fontSize: 16, marginLeft: 14 }}>
                      Delete Album
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          </BlurView>
        </View>
      </Modal>

      {/* Upload progress */}
      {uploading && uploadProgress && (
        <View style={[styles.progressBar, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={{ color: '#F5F5F5', fontSize: 13, fontWeight: '500', marginBottom: 8 }}>
            Uploading {uploadProgress.current} of {uploadProgress.total}…
          </Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${(uploadProgress.current / uploadProgress.total) * 100}%` },
              ]}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  shelfLine: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  navBtnShadow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  navBtnClip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  navBtnOverlay: { backgroundColor: 'rgba(255,255,255,0.14)' },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#141414',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  progressTrack: { height: 4, backgroundColor: '#2A2A2A', borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: '#3B82F6', borderRadius: 2 },
});
