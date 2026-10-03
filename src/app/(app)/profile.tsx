import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// TODO: build out Profile screen
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-zinc-900 items-center justify-center"
      style={{ paddingTop: insets.top }}
    >
      <Text className="text-white text-xl font-medium">Profile</Text>
    </View>
  );
}
