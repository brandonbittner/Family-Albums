/**
 * Extracts dominant colors from a local JPEG file using pure JS (Expo Go compatible).
 * Uses median-cut quantization on a sampled subset of pixels.
 */

import * as FileSystem from 'expo-file-system/legacy';
import jpeg from 'jpeg-js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RGB {
  r: number;
  g: number;
  b: number;
}

// ── Median-cut quantizer ──────────────────────────────────────────────────────

function componentRange(pixels: RGB[], channel: keyof RGB): number {
  let min = 255,
    max = 0;
  for (const p of pixels) {
    if (p[channel] < min) min = p[channel];
    if (p[channel] > max) max = p[channel];
  }
  return max - min;
}

function splitBucket(pixels: RGB[]): [RGB[], RGB[]] {
  const rRange = componentRange(pixels, 'r');
  const gRange = componentRange(pixels, 'g');
  const bRange = componentRange(pixels, 'b');
  const axis: keyof RGB = rRange >= gRange && rRange >= bRange ? 'r' : gRange >= bRange ? 'g' : 'b';
  const sorted = [...pixels].sort((a, b) => a[axis] - b[axis]);
  const mid = Math.floor(sorted.length / 2);
  return [sorted.slice(0, mid), sorted.slice(mid)];
}

function bucketMean(pixels: RGB[]): RGB {
  const sum = pixels.reduce((acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }), {
    r: 0,
    g: 0,
    b: 0,
  });
  const n = pixels.length;
  return { r: Math.round(sum.r / n), g: Math.round(sum.g / n), b: Math.round(sum.b / n) };
}

function medianCut(pixels: RGB[], depth: number): RGB[] {
  if (depth === 0 || pixels.length === 0) return pixels.length ? [bucketMean(pixels)] : [];
  const [a, b] = splitBucket(pixels);
  return [...medianCut(a, depth - 1), ...medianCut(b, depth - 1)];
}

// ── Color filtering ───────────────────────────────────────────────────────────

function saturation({ r, g, b }: RGB): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}

function luminance({ r, g, b }: RGB): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function toHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Reads a local JPEG URI, decodes it, samples pixels, and returns `count`
 * dominant colors as hex strings sorted by saturation (richest first).
 * Near-black, near-white, and desaturated colors are filtered out.
 */
export async function extractDominantColors(localUri: string, count: number): Promise<string[]> {
  // Read the local JPEG file as base64
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Decode base64 → Uint8Array → JPEG → RGBA pixels
  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const { data, width, height } = jpeg.decode(binary.buffer as ArrayBuffer, {
    useTArray: true,
    formatAsRGBA: true,
  });

  // Sample ~400 evenly-spaced pixels (stride across the image)
  const totalPixels = width * height;
  const step = Math.max(1, Math.floor(totalPixels / 400));
  const samples: RGB[] = [];
  for (let i = 0; i < totalPixels; i += step) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const px = { r, g, b };
    // Skip near-black, near-white, and very grey pixels
    if (luminance(px) < 0.08 || luminance(px) > 0.92 || saturation(px) < 0.15) continue;
    samples.push(px);
  }

  if (samples.length < 4) return [];

  // Median-cut: depth=3 → 2^3=8 buckets, then take `count` richest
  const depth = 3;
  const palette = medianCut(samples, depth);

  return palette
    .sort((a, b) => saturation(b) - saturation(a))
    .slice(0, count)
    .map(toHex);
}
