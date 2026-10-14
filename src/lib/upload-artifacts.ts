import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { extractDominantColors } from './color-extract';
import { uploadArtifact, type ContentType } from './storage';
import { supabase } from './supabase';

export type PickedAsset = ImagePicker.ImagePickerAsset;

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
export async function extractVideoFrame(
  uri: string,
  durationMs: number,
): Promise<{ uri: string; width: number; height: number }> {
  const middleMs = Math.max(0, Math.round(durationMs / 2));
  return VideoThumbnails.getThumbnailAsync(uri, { time: middleMs, quality: 1 });
}

/** Opens the system library picker for photos and videos. Returns [] if cancelled. */
export async function pickArtifacts(): Promise<PickedAsset[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    quality: 1,
    exif: true,
  });
  return result.canceled ? [] : result.assets;
}

/**
 * Uploads picked assets and attaches them to an album, one at a time.
 * Each asset gets an `artifacts` row, its variants uploaded to storage, and an
 * `album_artifacts` link. Returns how many assets failed.
 */
export async function uploadAssetsToAlbum({
  albumId,
  userId,
  assets,
  onProgress,
}: {
  albumId: string;
  userId: string;
  assets: PickedAsset[];
  onProgress?: (current: number, total: number) => void;
}): Promise<{ failed: number }> {
  // Check if the album currently has no artifacts so we know whether the
  // first item in this batch will become the first-ordered image.
  // TODO: when users can select cover images, run color extraction only for
  //       the designated cover artifact instead of the first uploaded image.
  const { count: existingCount } = await supabase
    .from('album_artifacts')
    .select('*', { count: 'exact', head: true })
    .eq('album_id', albumId);
  const isFirstInAlbum = (existingCount ?? 0) === 0;

  let failed = 0;

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const artifactId = Crypto.randomUUID();
    const contentType = toContentType(asset.mimeType ?? '');

    onProgress?.(i + 1, assets.length);

    const isVideo = asset.type === 'video';
    const { error: insertError } = await supabase.from('artifacts').insert({
      id: artifactId,
      uploaded_by: userId,
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
          album_id: albumId,
          artifact_id: artifactId,
          position: Date.now() + i,
          added_by: userId,
        }),
      ]);
    } catch {
      await supabase.from('artifacts').update({ status: 'failed' }).eq('id', artifactId);
      failed++;
    }
  }

  return { failed };
}
