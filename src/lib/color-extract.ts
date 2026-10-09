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

// ── Color filtering & selection ───────────────────────────────────────────────

function saturation({ r, g, b }: RGB): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}

function luminance({ r, g, b }: RGB): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function toHue({ r, g, b }: RGB): number {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn);
  if (max === min) return 0;
  const d = max - min;
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return h * 60; // 0–360
}

function hueDistance(a: RGB, b: RGB): number {
  const diff = Math.abs(toHue(a) - toHue(b));
  return Math.min(diff, 360 - diff); // circular
}

/**
 * Greedy farthest-point sampling: pick the most-saturated color first, then
 * always pick the candidate whose hue is maximally far from every already-
 * selected color. This spreads the palette across the hue wheel even when the
 * image is dominated by a single color family.
 */
function diversePalette(candidates: RGB[], count: number): RGB[] {
  if (candidates.length === 0) return [];
  const selected: RGB[] = [candidates[0]];
  const remaining = candidates.slice(1);

  while (selected.length < count && remaining.length > 0) {
    let bestIdx = 0,
      bestDist = -1;
    for (let i = 0; i < remaining.length; i++) {
      const minDist = Math.min(...selected.map((s) => hueDistance(remaining[i], s)));
      if (minDist > bestDist) {
        bestDist = minDist;
        bestIdx = i;
      }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  return selected;
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

  // Median-cut: depth=4 → 2^4=16 buckets for more candidate variety
  const palette = medianCut(samples, 4);

  // Sort by saturation so the richest colors are tried first, then use
  // farthest-point hue sampling to ensure the final selection spans the
  // color wheel rather than clustering around one dominant hue.
  const sorted = palette.sort((a, b) => saturation(b) - saturation(a));
  return diversePalette(sorted, count).map(toHex);
}
