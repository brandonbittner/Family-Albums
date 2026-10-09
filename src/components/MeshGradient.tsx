/**
 * MeshGradient — stacked radial gradients rendered with react-native-svg.
 *
 * Technique: a base <Rect> sets the background color, then 6–7 <Rect>s each
 * filled with a <RadialGradient> (color → transparent) are layered on top.
 * Their positions and radii come from a seeded PRNG so the same seed always
 * produces the same look — pass an album ID and each album gets its own gradient.
 * Film grain is added via an SVG <FeTurbulence> filter.
 */

import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, {
  Defs,
  FeColorMatrix,
  FeTurbulence,
  Filter,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

// ── Default palette ───────────────────────────────────────────────────────────
// Warm, nostalgic tones: amber, terracotta, dusty violet, rose, gold.
// Edit this one array to retheme every gradient in the app.
export const ALBUM_COLORS = ['#C8895A', '#B85C4A', '#7A5B9A', '#C06880', '#D4A84A'];
export const ALBUM_BASE = '#12080F';

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toSeed(s: number | string): number {
  if (typeof s === 'number') return s >>> 0;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// ── Layer geometry (proportional, 0–1) ───────────────────────────────────────
interface Layer {
  cxR: number; // cx as fraction of width
  cyR: number; // cy as fraction of height
  rR: number; // radius as fraction of max(width, height)
  color: string;
  opacity: number;
}

function buildLayers(colors: string[], seed: number | string): Layer[] {
  const rand = mulberry32(toSeed(seed));
  const layers: Layer[] = [];

  // Repeat first two colors so they dominate the blend
  const palette = [colors[0], colors[0], colors[1] ?? colors[0], ...colors.slice(1)];

  for (let i = 0; i < 6; i++) {
    layers.push({
      cxR: 0.05 + rand() * 0.9,
      cyR: 0.05 + rand() * 0.9,
      rR: 0.38 + rand() * 0.37, // 38–75 % of the largest dimension
      color: palette[i % palette.length],
      opacity: 0.5 + rand() * 0.4,
    });
  }

  // One near-white soft highlight (smaller, offset toward the top)
  layers.push({
    cxR: 0.15 + rand() * 0.7,
    cyR: rand() * 0.45,
    rR: 0.12 + rand() * 0.18,
    color: '#FFFFFF',
    opacity: 0.12 + rand() * 0.18,
  });

  return layers;
}

// ── Component ─────────────────────────────────────────────────────────────────
interface MeshGradientProps {
  colors?: string[];
  base?: string;
  seed?: number | string;
  grain?: number; // opacity of the film-grain overlay; 0 disables it
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export default function MeshGradient({
  colors = ALBUM_COLORS,
  base = ALBUM_BASE,
  seed = 0,
  grain = 0.14,
  style,
  children,
}: MeshGradientProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Rebuild layers only when seed or palette changes, not on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layers = useMemo(() => buildLayers(colors, seed), [JSON.stringify(colors), seed]);

  return (
    <View
      style={[styles.root, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize({ w: width, h: height });
      }}
    >
      {size.w > 0 && (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
          <Defs>
            {layers.map((l, i) => (
              <RadialGradient
                key={i}
                id={`mg${i}`}
                cx={l.cxR * size.w}
                cy={l.cyR * size.h}
                r={l.rR * Math.max(size.w, size.h)}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={l.color} stopOpacity={l.opacity} />
                <Stop offset="1" stopColor={l.color} stopOpacity={0} />
              </RadialGradient>
            ))}
            {grain > 0 && (
              <Filter id="grain" x="0%" y="0%" width="100%" height="100%">
                <FeTurbulence
                  type="fractalNoise"
                  baseFrequency="0.72"
                  numOctaves="4"
                  stitchTiles="stitch"
                />
                <FeColorMatrix type="saturate" values="0" />
              </Filter>
            )}
          </Defs>

          {/* Base fill */}
          <Rect width={size.w} height={size.h} fill={base} />

          {/* Gradient blobs */}
          {layers.map((_, i) => (
            <Rect key={i} width={size.w} height={size.h} fill={`url(#mg${i})`} />
          ))}

          {/* Film grain */}
          {grain > 0 && (
            <Rect width={size.w} height={size.h} filter="url(#grain)" opacity={grain} />
          )}
        </Svg>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
});
