import * as FileSystem from 'expo-file-system/legacy';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Variant = 'original' | 'display' | 'thumb' | 'poster';

export type ContentType = 'image/jpeg' | 'image/png' | 'video/mp4' | 'video/quicktime';

/** One file to upload — a local URI plus the metadata that gets signed. */
export interface ArtifactFile {
  variant: Variant;
  localUri: string;
  contentType: ContentType;
}

/** One item to retrieve a signed view URL for. */
export interface ArtifactItem {
  artifactId: string;
  variant: Variant;
  contentType: ContentType;
}

/** A signed URL and when it should be evicted from the cache. */
interface CachedUrl {
  url: string;
  expiresAt: number; // ms since epoch
}

// ── URL cache ─────────────────────────────────────────────────────────────────
// View URLs are signed for 1 hour. We evict 5 minutes early so callers never
// receive a URL that expires mid-use (e.g. while an image is loading).

const VIEW_TTL_MS = 60 * 60 * 1000;
const EVICT_BUFFER_MS = 5 * 60 * 1000;

const urlCache = new Map<string, CachedUrl>();

function cacheKey(artifactId: string, variant: Variant): string {
  return `${artifactId}/${variant}`;
}

function getCached(artifactId: string, variant: Variant): string | null {
  const entry = urlCache.get(cacheKey(artifactId, variant));
  if (!entry || Date.now() + EVICT_BUFFER_MS >= entry.expiresAt) {
    urlCache.delete(cacheKey(artifactId, variant));
    return null;
  }
  return entry.url;
}

function setCache(artifactId: string, variant: Variant, url: string): void {
  urlCache.set(cacheKey(artifactId, variant), {
    url,
    expiresAt: Date.now() + VIEW_TTL_MS,
  });
}

// ── Upload ────────────────────────────────────────────────────────────────────

/**
 * Requests presigned PUT URLs from the edge function, then streams each local
 * file directly to R2 via expo-file-system (no full-file memory load).
 *
 * Throws with the failing variant name if any upload fails.
 */
export async function uploadArtifact(artifactId: string, files: ArtifactFile[]): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{
    files: { variant: string; uploadUrl: string }[];
  }>('r2-sign', {
    body: {
      action: 'upload',
      artifactId,
      files: files.map(({ variant, contentType }) => ({ variant, contentType })),
    },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.text().catch(() => '(no body)');
      throw new Error(`r2-sign upload failed (HTTP ${error.context.status}): ${body}`);
    }
    throw new Error(`Failed to get upload URLs: ${error.message}`);
  }
  if (!data?.files?.length) throw new Error('Edge function returned no upload URLs');

  await Promise.all(
    files.map(async (file) => {
      const signed = data.files.find((f) => f.variant === file.variant);
      if (!signed) {
        throw new Error(`No upload URL returned for variant "${file.variant}"`);
      }

      const result = await FileSystem.uploadAsync(signed.uploadUrl, file.localUri, {
        httpMethod: 'PUT',
        // Must match the Content-Type that was signed — R2 will reject mismatches.
        headers: { 'Content-Type': file.contentType },
      });

      if (result.status < 200 || result.status >= 300) {
        throw new Error(
          `Upload failed for variant "${file.variant}": HTTP ${result.status} — ${result.body}`,
        );
      }
    }),
  );
}

// ── View ──────────────────────────────────────────────────────────────────────

/**
 * Returns signed GET URLs for a batch of artifacts, using cached URLs where
 * available. One edge function call covers the entire uncached portion.
 */
export async function getArtifactUrls(
  items: ArtifactItem[],
): Promise<{ artifactId: string; variant: Variant; url: string }[]> {
  const uncached = items.filter(({ artifactId, variant }) => !getCached(artifactId, variant));

  if (uncached.length > 0) {
    const { data, error } = await supabase.functions.invoke<{
      items: { artifactId: string; variant: string; url: string }[];
    }>('r2-sign', {
      body: { action: 'view', items: uncached },
    });

    if (error) {
      if (error instanceof FunctionsHttpError) {
        const body = await error.context.text().catch(() => '(no body)');
        throw new Error(`r2-sign view failed (HTTP ${error.context.status}): ${body}`);
      }
      throw new Error(`Failed to get view URLs: ${error.message}`);
    }
    if (!data?.items?.length) throw new Error('Edge function returned no view URLs');

    for (const { artifactId, variant, url } of data.items) {
      setCache(artifactId, variant as Variant, url);
    }
  }

  return items.map(({ artifactId, variant }) => ({
    artifactId,
    variant,
    url: getCached(artifactId, variant)!,
  }));
}

/** Convenience wrapper for a single artifact URL. */
export async function getArtifactUrl(
  artifactId: string,
  variant: Variant,
  contentType: ContentType,
): Promise<string> {
  const results = await getArtifactUrls([{ artifactId, variant, contentType }]);
  return results[0].url;
}
