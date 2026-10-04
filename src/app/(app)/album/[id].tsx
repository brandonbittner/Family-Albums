import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Upload } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

type Album = Database['public']['Tables']['albums']['Row'];

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('albums')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) setAlbum(data);
        setLoading(false);
      });
  }, [id]);

  return (
    <View className="flex-1 bg-zinc-900" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-4 h-14">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={22} color="#a1a1aa" />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color="#a1a1aa" className="mt-12" />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 100,
          }}
        >
          {/* Title & description */}
          <Text className="text-white text-2xl font-bold">{album?.title}</Text>
          {album?.description ? (
            <Text className="text-zinc-400 text-base mt-1.5">{album.description}</Text>
          ) : null}

          <View className="mt-6">
            {/* TODO: fetch and display artifacts for this album */}
            {/* TODO: replace empty state with 2-column artifact grid once artifact schema is ready */}
            <View className="items-center mt-16">
              <Text className="text-zinc-500 text-base">No photos yet</Text>
              <Text className="text-zinc-600 text-sm mt-1">Tap the button below to add some</Text>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Upload FAB */}
      <Pressable
        className="absolute right-5 bg-blue-600 rounded-full w-14 h-14 items-center justify-center active:opacity-80"
        style={{ bottom: insets.bottom + 24 }}
        // TODO: open photo picker and upload artifacts to this album
        onPress={() => {}}
      >
        <Upload size={22} color="white" />
      </Pressable>
    </View>
  );
}
