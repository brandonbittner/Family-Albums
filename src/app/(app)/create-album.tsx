import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';

export default function CreateAlbumScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = title.trim().length > 0;

  const handleCreate = async () => {
    if (!canSubmit || !user) return;
    setLoading(true);
    const { error } = await supabase.from('albums').insert({
      owner_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
    });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    router.back();
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-neutral-800"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1" style={{ paddingTop: insets.top }}>
        {/* Header */}
        <View className="flex-row items-center px-4 h-14 border-b border-neutral-700">
          <Pressable onPress={() => router.back()} hitSlop={12} className="mr-3">
            <ArrowLeft size={22} color="#94A3B8" />
          </Pressable>
          <Text className="text-neutral-100 text-lg font-semibold">New Album</Text>
        </View>

        {/* Fields */}
        <View className="flex-1 px-4 pt-6">
          <Text className="text-neutral-400 text-xs font-semibold uppercase tracking-widest mb-2">
            Title <Text className="text-blue-400">*</Text>
          </Text>
          <TextInput
            className="bg-neutral-700 text-neutral-100 rounded-2xl px-4 py-3.5 text-base mb-6 border border-neutral-600"
            placeholder="e.g. Summer 2026"
            placeholderTextColor="#475569"
            value={title}
            onChangeText={setTitle}
            autoFocus
            returnKeyType="next"
            editable={!loading}
          />

          <Text className="text-neutral-400 text-xs font-semibold uppercase tracking-widest mb-2">
            Description
          </Text>
          <TextInput
            className="bg-neutral-700 text-neutral-100 rounded-2xl px-4 py-3.5 text-base border border-neutral-600"
            placeholder="Optional"
            placeholderTextColor="#475569"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            style={{ minHeight: 100 }}
            editable={!loading}
          />
        </View>

        {/* Create button */}
        <View className="px-4" style={{ paddingBottom: insets.bottom + 16 }}>
          <Pressable
            className="rounded-2xl py-4 items-center"
            style={{ backgroundColor: canSubmit && !loading ? '#3B82F6' : '#404040' }}
            onPress={handleCreate}
            disabled={!canSubmit || loading}
          >
            <Text
              className="font-semibold text-base"
              style={{ color: canSubmit && !loading ? 'white' : '#525252' }}
            >
              {loading ? 'Creating…' : 'Create Album'}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
