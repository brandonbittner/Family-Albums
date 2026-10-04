import { router, useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

type Album = Database['public']['Tables']['albums']['Row'];

export default function AlbumsScreen() {
  const insets = useSafeAreaInsets();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      supabase
        .from('albums')
        .select('*')
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (!active) return;
          if (!error && data) setAlbums(data);
          setLoading(false);
        });
      return () => {
        active = false;
      };
    }, []),
  );

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
        onPress={() => router.push('/(app)/create-album')}
      >
        <Plus size={18} color="#a1a1aa" />
        <Text className="text-zinc-300 font-medium">New Album</Text>
      </Pressable>

      {/* States */}
      {loading ? (
        <ActivityIndicator color="#a1a1aa" className="mt-8" />
      ) : albums.length === 0 ? (
        <View className="items-center mt-16">
          <Text className="text-zinc-500 text-base">No albums yet</Text>
          <Text className="text-zinc-600 text-sm mt-1">Tap "New Album" to create one</Text>
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-3">
          {albums.map((album) => (
            <Pressable
              key={album.id}
              className="overflow-hidden rounded-2xl active:opacity-70"
              style={{ width: '48.5%' }}
              // TODO: navigate to album detail screen
              onPress={() => {}}
            >
              <View className="w-full bg-zinc-800 rounded-2xl" style={{ aspectRatio: 1 }}>
                {/* TODO: display album cover photo from R2 */}
                <View className="flex-1 bg-zinc-700 rounded-t-2xl" />
                <View className="px-3 py-2.5">
                  <Text className="text-white font-semibold text-sm" numberOfLines={1}>
                    {album.title}
                  </Text>
                  {album.description ? (
                    <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
                      {album.description}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
