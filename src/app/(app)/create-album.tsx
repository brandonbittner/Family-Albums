import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowLeft, Plus, SquarePlay, X } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AlbumBookCover from '@/components/AlbumBookCover';
import GlassIconButton from '@/components/GlassIconButton';
import MeshGradient, { ALBUM_COLORS } from '@/components/MeshGradient';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import {
  extractVideoFrame,
  pickArtifacts,
  uploadAssetsToAlbum,
  type PickedAsset,
} from '@/lib/upload-artifacts';

type SelectedArtifact = {
  key: string;
  asset: PickedAsset;
  /** Local image to render — the asset itself for photos, an extracted frame for videos. */
  previewUri: string | null;
};

// ── Layout constants (mirrors the album detail header) ──────────────────────
const COVER_WIDTH = 190;
const COVER_HEIGHT = Math.round(COVER_WIDTH * 1.3);
const BUTTON_AREA = 68;
const SHELF_HEIGHT = Math.round(COVER_HEIGHT * 0.75) + BUTTON_AREA;
const COVER_MARGIN_TOP = -Math.round(COVER_HEIGHT * 0.75);
const H_PADDING = 20;
const GRID_GAP = 6;
const GRID_COLUMNS = 4;

export default function CreateAlbumScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { user } = useAuth();

  // The album id is generated up front so the header gradient matches the
  // one the album will show once created.
  const [draftId, setDraftId] = useState(() => Crypto.randomUUID());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<SelectedArtifact[]>([]);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(
    null,
  );

  const canSubmit = title.trim().length > 0 && !submitting && !picking;
  const tileSize = (windowWidth - H_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

  const resetForm = () => {
    setDraftId(Crypto.randomUUID());
    setTitle('');
    setDescription('');
    setSelected([]);
  };

  const handleAddArtifacts = async () => {
    setPicking(true);
    try {
      const assets = await pickArtifacts();
      const picked = await Promise.all(
        assets.map(async (asset): Promise<SelectedArtifact> => {
          let previewUri: string | null = asset.uri;
          if (asset.type === 'video') {
            previewUri = await extractVideoFrame(asset.uri, asset.duration ?? 0)
              .then((frame) => frame.uri)
              .catch(() => null);
          }
          return { key: asset.assetId ?? asset.uri, asset, previewUri };
        }),
      );
      setSelected((prev) => {
        const existing = new Set(prev.map((s) => s.key));
        return [...prev, ...picked.filter((p) => !existing.has(p.key))];
      });
    } finally {
      setPicking(false);
    }
  };

  const handleRemove = (key: string) => {
    setSelected((prev) => prev.filter((s) => s.key !== key));
  };

  const handleCreate = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);

    const albumId = draftId;
    const { error } = await supabase.from('albums').insert({
      id: albumId,
      owner_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
    });
    if (error) {
      setSubmitting(false);
      Alert.alert('Error', error.message);
      return;
    }

    let failed = 0;
    const total = selected.length;
    if (total > 0) {
      setUploadProgress({ current: 0, total });
      ({ failed } = await uploadAssetsToAlbum({
        albumId,
        userId: user.id,
        assets: selected.map((s) => s.asset),
        onProgress: (current, count) => setUploadProgress({ current, total: count }),
      }));
      setUploadProgress(null);
    }

    setSubmitting(false);
    // This screen lives in the tab navigator and stays mounted — clear it for next time.
    resetForm();
    router.back();
    router.push({ pathname: '/album/[id]', params: { id: albumId } });

    if (failed > 0) {
      Alert.alert('Upload finished', `${total - failed} succeeded, ${failed} failed.`);
    }
  };

  const allTiles: (SelectedArtifact | 'add')[] = ['add', ...selected];

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {/* ── Shelf header ── */}
          <View style={{ height: insets.top + SHELF_HEIGHT }}>
            <MeshGradient
              seed={draftId}
              colors={ALBUM_COLORS}
              grain={0}
              style={StyleSheet.absoluteFill}
            />
            {/* Bottom shadow — makes content section appear elevated above gradient */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.15)']}
              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 30 }}
              pointerEvents="none"
            />
            {/* Shelf line */}
            <View
              style={[StyleSheet.absoluteFill, styles.shelfLine, { top: undefined, bottom: 0 }]}
            />
            <GlassIconButton
              style={{ position: 'absolute', top: insets.top + 8, left: 16 }}
              onPress={() => router.back()}
              disabled={submitting}
              accessibilityLabel="Back"
            >
              <ArrowLeft size={20} color="#FFFFFF" />
            </GlassIconButton>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: insets.top + 8,
                left: 0,
                right: 0,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 17, fontWeight: '600' }}>
                New Album
              </Text>
            </View>
          </View>

          {/* ── Live cover preview (overlaps shelf) ── */}
          <View style={{ alignItems: 'center', marginTop: COVER_MARGIN_TOP }}>
            <AlbumBookCover
              width={COVER_WIDTH}
              title={title.trim()}
              placeholder="Untitled Album"
              imageUri={selected[0]?.previewUri}
            />
          </View>

          {/* ── Fields ── */}
          <View style={{ paddingHorizontal: H_PADDING, paddingTop: 32, gap: 20 }}>
            <View style={{ gap: 8 }}>
              <Text style={styles.label}>
                Title <Text style={{ color: '#60A5FA' }}>*</Text>
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Summer 2026"
                placeholderTextColor="#525252"
                returnKeyType="next"
                editable={!submitting}
                style={styles.input}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Add a description…"
                placeholderTextColor="#525252"
                multiline
                numberOfLines={3}
                editable={!submitting}
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              />
            </View>

            {/* ── Artifacts ── */}
            <View style={{ gap: 8 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={styles.label}>Artifacts</Text>
                {selected.length > 0 && (
                  <Text style={{ color: '#737373', fontSize: 13 }}>{selected.length} selected</Text>
                )}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
                {allTiles.map((tile) => {
                  if (tile === 'add') {
                    return (
                      <Pressable
                        key="add"
                        disabled={picking || submitting}
                        onPress={handleAddArtifacts}
                        style={[styles.addTile, { width: tileSize, height: tileSize }]}
                      >
                        <View pointerEvents="none" style={styles.addTileBorder} />
                        {picking ? (
                          <ActivityIndicator color="#A3A3A3" />
                        ) : (
                          <>
                            <Plus size={20} color="#A3A3A3" />
                            <Text
                              style={{
                                color: '#A3A3A3',
                                fontSize: 12,
                                fontWeight: '500',
                                textAlign: 'center',
                              }}
                            >
                              Add Artifacts
                            </Text>
                          </>
                        )}
                      </Pressable>
                    );
                  }
                  return (
                    <View
                      key={tile.key}
                      style={[styles.thumb, { width: tileSize, height: tileSize }]}
                    >
                      {tile.previewUri ? (
                        <Image
                          source={{ uri: tile.previewUri }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                          transition={200}
                        />
                      ) : null}
                      {tile.asset.type === 'video' && (
                        <View style={{ position: 'absolute', left: 6, bottom: 6 }}>
                          <SquarePlay size={16} color="#FFFFFF" />
                        </View>
                      )}
                      {!submitting && (
                        <Pressable
                          onPress={() => handleRemove(tile.key)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Remove"
                          style={styles.removeBtn}
                        >
                          <X size={14} color="#FFFFFF" />
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </ScrollView>

        {/* ── Bottom action ── */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
          <LinearGradient
            colors={['rgba(10,10,10,0)', '#0A0A0A']}
            style={{ position: 'absolute', top: -24, left: 0, right: 0, height: 24 }}
            pointerEvents="none"
          />
          {uploadProgress ? (
            <View style={{ paddingVertical: 6 }}>
              <Text style={{ color: '#F5F5F5', fontSize: 13, fontWeight: '500', marginBottom: 8 }}>
                Uploading {uploadProgress.current} of {uploadProgress.total}…
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${(uploadProgress.current / uploadProgress.total) * 100}%` },
                  ]}
                />
              </View>
            </View>
          ) : (
            <Pressable onPress={handleCreate} disabled={!canSubmit}>
              {({ pressed }) => (
                <View
                  style={{
                    paddingVertical: 15,
                    borderRadius: 12,
                    alignItems: 'center',
                    backgroundColor: !canSubmit
                      ? 'rgba(255,255,255,0.06)'
                      : pressed
                        ? '#2563EB'
                        : '#3B82F6',
                  }}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text
                      style={{
                        color: canSubmit ? '#FFFFFF' : '#525252',
                        fontSize: 16,
                        fontWeight: '600',
                      }}
                    >
                      Create Album
                    </Text>
                  )}
                </View>
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  shelfLine: { height: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  label: { color: '#A3A3A3', fontSize: 15, fontWeight: '500' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F5F5F5',
    fontSize: 16,
  },
  addTile: {
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
    backgroundColor: '#171717',
  },
  addTileBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1.5,
    borderColor: '#333333',
    borderStyle: 'dashed',
    borderRadius: 4,
  },
  thumb: { borderRadius: 4, overflow: 'hidden', backgroundColor: '#1C1C1E' },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  bottomBar: { paddingHorizontal: H_PADDING, paddingTop: 8, backgroundColor: '#0A0A0A' },
  progressTrack: { height: 4, backgroundColor: '#2A2A2A', borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: '#3B82F6', borderRadius: 2 },
});
