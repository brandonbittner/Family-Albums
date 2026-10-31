import { View } from 'react-native';

import Avatar from '@/components/Avatar';
import { useAuth } from '@/hooks/use-auth';

/** The signed-in user's avatar. */
export default function UserAvatar({ size }: { size: number }) {
  const { user, profile } = useAuth();
  return (
    <View accessibilityLabel={profile?.display_name ?? user?.email ?? 'Your profile'}>
      <Avatar
        name={profile?.display_name}
        seed={user?.id ?? ''}
        fallback={user?.email}
        size={size}
      />
    </View>
  );
}
