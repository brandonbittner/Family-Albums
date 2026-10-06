import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Upload } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
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
      } catch {
        // URLs are best-effort; images just won't load
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

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderItem = ({ item, index }: { item: GridItem; index: number }) => (
    <Pressable
      className="active:opacity-80"
      style={{
        flex: 1,
        marginLeft: index % 2 === 1 ? 2 : 0,
        marginRight: index % 2 === 0 ? 2 : 0,
        marginBottom: 4,
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
      <View style={{ width: '100%', aspectRatio: 1, backgroundColor: '#404040' }}>
        <Image
          source={item.url ? { uri: item.url } : undefined}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={200}
        />
      </View>
    </Pressable>
  );

  const ListHeader = () => (
    <View className="mb-5">
      {albumLoading ? (
        <ActivityIndicator color="#a1a1aa" />
      ) : (
        <>
          <Text className="text-neutral-100 text-2xl font-bold">{album?.title}</Text>
          {album?.description ? (
            <Text className="text-neutral-400 text-base mt-1.5">{album.description}</Text>
          ) : null}
        </>
      )}
    </View>
  );

  const ListEmpty = () =>
    artifactsLoading ? (
      <ActivityIndicator color="#a1a1aa" className="mt-12" />
    ) : (
      <View className="items-center mt-16">
        <Text className="text-neutral-500 text-base">No photos yet</Text>
        <Text className="text-neutral-500 text-sm mt-1">Tap the button below to add some</Text>
      </View>
    );

  return (
    <View className="flex-1 bg-neutral-800" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-4 h-14 border-b border-neutral-700">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={22} color="#A3A3A3" />
        </Pressable>
      </View>

      <FlatList
        data={artifacts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 100,
        }}
      />

      {/* Upload progress bar */}
      {uploading && uploadProgress && (
        <View
          className="absolute bottom-0 left-0 right-0 bg-neutral-800 border-t border-neutral-700 px-6 py-4"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <Text className="text-neutral-100 text-sm font-medium mb-2">
            Uploading {uploadProgress.current} of {uploadProgress.total}…
          </Text>
          <View className="bg-neutral-600 rounded-full h-1.5">
            <View
              className="bg-blue-500 rounded-full h-1.5"
              style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
            />
          </View>
        </View>
      )}

      {/* Upload FAB */}
      {!uploading && (
        <Pressable
          className="absolute right-5 bg-blue-600 rounded-full w-14 h-14 items-center justify-center active:opacity-80"
          style={{ bottom: insets.bottom + 24 }}
          onPress={handleUpload}
        >
          <Upload size={22} color="white" />
        </Pressable>
      )}
    </View>
  );
}
