import { StyleSheet, Text, View } from 'react-native';

import { initialsFor, useAuth } from '@/hooks/use-auth';

// Muted tones that read on the app's dark background; one is picked per user.
const AVATAR_COLORS = ['#2563EB', '#7C3AED', '#DB2777', '#059669', '#D97706', '#0891B2'];

function colorFor(id: string | undefined): string {
  if (!id) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/**
 * The signed-in user's avatar: their initials on a colour picked from their id.
 * TODO: show the user's uploaded profile photo once profile photos are supported.
 */
export default function UserAvatar({ size }: { size: number }) {
  const { user, profile } = useAuth();
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(user?.id) },
      ]}
      accessibilityLabel={profile?.display_name ?? user?.email ?? 'Your profile'}
    >
      <Text style={[styles.initials, { fontSize: Math.round(size * 0.4) }]}>
        {initialsFor(profile, user?.email)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#FFFFFF', fontWeight: '600' },
});
