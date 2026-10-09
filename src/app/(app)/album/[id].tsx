import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Upload } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
        await Promise.all([
          supabase.from('artifacts').update({ status: 'ready' }).eq('id', artifactId),
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

  const uploading = uploadProgress !== null;

  // ── Layout constants ────────────────────────────────────────────────────────
  const COVER_WIDTH = 160;
  const COVER_HEIGHT = Math.round(COVER_WIDTH * 1.3);
  const SHELF_HEIGHT = 80;
  // Pull the cover up so its top sits 16px below the safe area
  const COVER_MARGIN_TOP = -(SHELF_HEIGHT - 16);

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
          <LinearGradient colors={['#1E1E1E', '#111111']} style={StyleSheet.absoluteFill} />
          {/* Shelf line */}
          <View
            style={[StyleSheet.absoluteFill, styles.shelfLine, { top: undefined, bottom: 0 }]}
          />
          {/* Back button */}
          <Pressable
            style={{ position: 'absolute', top: insets.top + 8, left: 16 }}
            onPress={() => router.back()}
            hitSlop={12}
          >
            <ArrowLeft size={22} color="#A3A3A3" />
          </Pressable>
        </View>

        {/* ── Book cover (overlaps shelf) ── */}
        <View style={{ alignItems: 'center', marginTop: COVER_MARGIN_TOP }}>
          <View
            style={{
              width: COVER_WIDTH,
              height: COVER_HEIGHT,
              borderTopLeftRadius: 2,
              borderTopRightRadius: 2,
              overflow: 'hidden',
              backgroundColor: '#FFFFFF',
              shadowColor: '#000',
              shadowOffset: { width: 4, height: 8 },
              shadowOpacity: 0.5,
              shadowRadius: 12,
              elevation: 12,
            }}
          >
            <View style={{ flex: 1, padding: 12, justifyContent: 'center', alignItems: 'center' }}>
              <Text
                style={{
                  color: '#1A1A1A',
                  fontSize: 15,
                  fontWeight: '600',
                  textAlign: 'center',
                  lineHeight: 20,
                }}
                numberOfLines={5}
              >
                {album?.title}
              </Text>
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
                style={{ color: '#F5F5F5', fontSize: 22, fontWeight: '700', textAlign: 'center' }}
              >
                {album?.title}
              </Text>
              {album?.description ? (
                <Text style={{ color: '#A3A3A3', fontSize: 15, textAlign: 'center', marginTop: 6 }}>
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
        ) : artifacts.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Text style={{ color: '#6B7280', fontSize: 15 }}>No photos yet</Text>
            <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>
              Tap the button below to add some
            </Text>
          </View>
        ) : (
          // TODO: virtualize grid for large albums
          <View style={{ gap: 4 }}>
            {Array.from({ length: Math.ceil(artifacts.length / 3) }, (_, row) => {
              const rowItems = artifacts.slice(row * 3, row * 3 + 3);
              const padded = [...rowItems, ...Array<null>(3 - rowItems.length).fill(null)];
              return (
                <View key={row} style={{ flexDirection: 'row', gap: 4 }}>
                  {padded.map((item, col) =>
                    item ? (
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
                            pathname: '/(app)/album/artifact',
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
                    ) : (
                      <View key={`empty-${col}`} style={{ flex: 1, aspectRatio: 1 }} />
                    ),
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

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

      {/* Upload FAB */}
      {!uploading && (
        <Pressable style={[styles.fab, { bottom: insets.bottom + 24 }]} onPress={handleUpload}>
          <Upload size={22} color="white" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  shelfLine: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
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
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
