import { Plus } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// TODO: fetch albums from Supabase for the current user
const PLACEHOLDER_ALBUMS = [
  { id: '1', name: 'Summer 2026', count: 24 },
  { id: '2', name: 'Christmas 2025', count: 18 },
  { id: '3', name: 'Bailey', count: 42 },
  { id: '4', name: 'Vacation', count: 31 },
  { id: '5', name: 'Birthday Party', count: 15 },
];

export default function AlbumsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      className="flex-1 bg-zinc-900"
      contentContainerStyle={{
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 100,
        paddingHorizontal: 16,
      }}
    >
      <Text className="text-white text-2xl font-bold mb-5">Albums</Text>

      {/* Create album */}
      <Pressable
        className="flex-row items-center justify-center gap-2 bg-zinc-800 border border-zinc-700 rounded-2xl py-3.5 mb-6 active:opacity-70"
        // TODO: open create album modal or navigate to create screen
        onPress={() => {}}
      >
        <Plus size={18} color="#a1a1aa" />
        <Text className="text-zinc-300 font-medium">New Album</Text>
      </Pressable>

      {/* Albums grid */}
      <View className="flex-row flex-wrap gap-3">
        {PLACEHOLDER_ALBUMS.map((album) => (
          <Pressable
            key={album.id}
            className="overflow-hidden rounded-2xl active:opacity-70"
            style={{ width: '48.5%' }}
            // TODO: navigate to album detail screen
            onPress={() => {}}
          >
            {/* TODO: display album cover photo from R2 */}
            <View className="w-full bg-zinc-800 rounded-2xl" style={{ aspectRatio: 1 }}>
              <View className="flex-1 bg-zinc-700 rounded-t-2xl" />
              <View className="px-3 py-2.5">
                <Text className="text-white font-semibold text-sm" numberOfLines={1}>
                  {album.name}
                </Text>
                <Text className="text-zinc-500 text-xs mt-0.5">{album.count} photos</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
