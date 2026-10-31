import { StyleSheet, Text, View } from 'react-native';

// Muted tones that read on the app's dark background; one is picked per person.
const AVATAR_COLORS = ['#2563EB', '#7C3AED', '#DB2777', '#059669', '#D97706', '#0891B2'];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** "Brandon Bittner" → "BB", "Grandma" → "G"; `fallback`'s first letter if no name. */
export function initialsFromName(name: string | null | undefined, fallback = '?'): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return (fallback[0] ?? '?').toUpperCase();
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/**
 * A person's avatar: their initials on a colour picked from `seed` (their user
 * id, or email for someone without an account yet), so it's stable per person.
 * TODO: show the person's uploaded profile photo once profile photos are supported.
 */
export default function Avatar({
  name,
  seed,
  fallback,
  size,
}: {
  name: string | null | undefined;
  seed: string;
  /** Used for the initial when there's no name, e.g. an email address. */
  fallback?: string;
  size: number;
}) {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(seed) },
      ]}
    >
      <Text style={[styles.initials, { fontSize: Math.round(size * 0.4) }]}>
        {initialsFromName(name, fallback)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#FFFFFF', fontWeight: '600' },
});
