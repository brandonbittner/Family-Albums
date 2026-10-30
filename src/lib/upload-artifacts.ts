import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Alert } from 'react-native';

import { detailsToColumns, EMPTY_ARTIFACT_DETAILS, type DetailsItem } from './artifact-details';
import { extractDominantColors } from './color-extract';
import { exifCoordinates } from './photo-location';
import { uploadArtifact, type ContentType } from './storage';
import { supabase } from './supabase';

export type PickedAsset = ImagePicker.ImagePickerAsset;

/**
 * A picked asset ready for the details screen and upload. Its preview is the
 * asset itself for photos, or an extracted frame for videos.
 */
export type SelectedArtifact = DetailsItem & {
  asset: PickedAsset;
  /**
   * Set on the first upload attempt, so retrying a failed upload reuses the
   * same artifact row and storage folder instead of leaving a stray one behind.
   */
  artifactId?: string;
};

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

function exifTakenAt(asset: PickedAsset): string | null {
  return parseExifDate(asset.exif?.DateTimeOriginal ?? asset.exif?.DateTime);
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

/** Builds renderable selections for picked assets, extracting a still frame for videos. */
export async function toSelectedArtifacts(assets: PickedAsset[]): Promise<SelectedArtifact[]> {
  return Promise.all(
    assets.map(async (asset): Promise<SelectedArtifact> => {
      let previewUri: string | null = asset.uri;
      if (asset.type === 'video') {
        previewUri = await extractVideoFrame(asset.uri, asset.duration ?? 0)
          .then((frame) => frame.uri)
          .catch(() => null);
      }
      const takenAt = exifTakenAt(asset);
      return {
        key: asset.assetId ?? asset.uri,
        asset,
        previewUri,
        isVideo: asset.type === 'video',
        metadataDate: takenAt ? new Date(takenAt) : null,
        metadataCoords: exifCoordinates(asset.exif),
        details: EMPTY_ARTIFACT_DETAILS,
      };
    }),
  );
}

/**
 * Uploads picked artifacts and attaches them to an album, one at a time.
 * Returns the artifacts that failed, ready to pass back in to retry them.
 * Each asset gets an `artifacts` row, its variants uploaded to storage, and an
 * `album_artifacts` link. Returns how many assets failed.
 */
export async function uploadAssetsToAlbum({
  albumId,
  userId,
  artifacts,
  onProgress,
}: {
  albumId: string;
  userId: string;
  artifacts: SelectedArtifact[];
  onProgress?: (current: number, total: number) => void;
}): Promise<{ failed: SelectedArtifact[] }> {
  // Check if the album currently has no artifacts so we know whether the
  // first item in this batch will become the first-ordered image.
  // TODO: when users can select cover images, run color extraction only for
  //       the designated cover artifact instead of the first uploaded image.
  const { count: existingCount } = await supabase
    .from('album_artifacts')
    .select('*', { count: 'exact', head: true })
    .eq('album_id', albumId);
  const isFirstInAlbum = (existingCount ?? 0) === 0;

  const failed: SelectedArtifact[] = [];

  for (let i = 0; i < artifacts.length; i++) {
    const { asset, details, metadataCoords } = artifacts[i];
    const artifactId = artifacts[i].artifactId ?? Crypto.randomUUID();
    const fail = (stage: string, e: unknown) => {
      console.error(`[uploadAssetsToAlbum] ${stage} failed:`, e);
      failed.push({ ...artifacts[i], artifactId });
    };
    const contentType = toContentType(asset.mimeType ?? '');

    onProgress?.(i + 1, artifacts.length);

    const isVideo = asset.type === 'video';
    // Upsert so a retry of a partly-uploaded artifact reuses its row.
    const { error: insertError } = await supabase.from('artifacts').upsert({
      id: artifactId,
      uploaded_by: userId,
      media_type: isVideo ? 'video' : 'photo',
      status: 'uploading',
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      original_content_type: contentType,
      file_size_bytes: asset.fileSize ?? 0,
      taken_at: exifTakenAt(asset),
      metadata_lat: metadataCoords?.lat ?? null,
      metadata_lng: metadataCoords?.lng ?? null,
      ...detailsToColumns(details),
    });

    if (insertError) {
      fail('artifact insert', insertError);
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

      // Supabase returns errors rather than throwing, so check each one —
      // otherwise an artifact can report success but never appear in the album.
      const { error: readyError } = await supabase
        .from('artifacts')
        .update({
          status: 'ready',
          ...(dominantColors ? { dominant_colors: dominantColors } : {}),
        })
        .eq('id', artifactId);
      if (readyError) throw readyError;

      const { error: linkError } = await supabase.from('album_artifacts').upsert(
        {
          album_id: albumId,
          artifact_id: artifactId,
          position: Date.now() + i,
          added_by: userId,
        },
        { onConflict: 'album_id,artifact_id' },
      );
      if (linkError) throw linkError;
    } catch (e) {
      fail('upload', e);
      await supabase.from('artifacts').update({ status: 'failed' }).eq('id', artifactId);
    }
  }

  return { failed };
}

/**
 * Tells the user how many uploads failed and offers to retry them. Resolves
 * true if they chose Retry.
 */
export function askToRetryUploads(failedCount: number, attempted: number): Promise<boolean> {
  const allFailed = failedCount === attempted;
  return new Promise((resolve) => {
    Alert.alert(
      allFailed ? 'Upload failed' : 'Some uploads failed',
      allFailed
        ? `${attempted === 1 ? 'The artifact' : `All ${attempted} artifacts`} couldn't be uploaded.`
        : `${failedCount} of ${attempted} artifacts couldn't be uploaded.`,
      [
        { text: 'Not Now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Retry', onPress: () => resolve(true) },
      ],
      // Android: tapping outside the dialog dismisses it.
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
