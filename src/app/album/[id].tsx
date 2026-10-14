import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import AlbumBookCover from '@/components/AlbumBookCover';
import GlassIconButton from '@/components/GlassIconButton';
import MeshGradient, { ALBUM_COLORS } from '@/components/MeshGradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { setArtifactList } from '@/lib/artifact-store';
import {
  ArrowDownUp,
  ArrowLeft,
  Check,
  ImageIcon,
  LayoutGrid,
  List,
  MoreVertical,
  Pencil,
  Plus,
  SquarePlay,
  Trash2,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/use-auth';
import { getArtifactUrls, type Variant } from '@/lib/storage';
import { pickArtifacts, uploadAssetsToAlbum } from '@/lib/upload-artifacts';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

type Album = Database['public']['Tables']['albums']['Row'];
type ArtifactRow = Database['public']['Tables']['artifacts']['Row'];
type GridItem = ArtifactRow & { url: string | null };

type SortOrder = 'oldest' | 'newest';
const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

type ViewMode = 'grid' | 'list';
const VIEW_TOGGLE_SEGMENT = 36;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { user } = useAuth();

  const [album, setAlbum] = useState<Album | null>(null);
  const [albumLoading, setAlbumLoading] = useState(true);
  const [artifacts, setArtifacts] = useState<GridItem[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  // TODO: persist the user's preferred sort order per album
  const [sortOrder, setSortOrder] = useState<SortOrder>('oldest');
  const [sortMenuAnchor, setSortMenuAnchor] = useState<{ top: number; right: number } | null>(null);
  const sortTriggerRef = useRef<View>(null);
  // TODO: persist the user's preferred view mode
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const viewToggleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(viewToggleAnim, {
      toValue: viewMode === 'list' ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [viewMode, viewToggleAnim]);

  // Grid order only — the cover image and gradient keep using `artifacts[0]`.
  const sortedArtifacts = useMemo(() => {
    const dir = sortOrder === 'oldest' ? 1 : -1;
    return [...artifacts].sort(
      (a, b) => dir * (Date.parse(a.created_at) - Date.parse(b.created_at)),
    );
  }, [artifacts, sortOrder]);

  const openSortMenu = () => {
    sortTriggerRef.current?.measureInWindow((x, y, width, height) => {
      setSortMenuAnchor({ top: y + height + 6, right: windowWidth - (x + width) });
    });
  };

  // Fetch album metadata once
  useEffect(() => {
    supabase
      .from('albums')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) setAlbum(data);
        setAlbumLoading(false);
      });
  }, [id]);

  // Fetch artifacts (and their signed URLs) every time the screen focuses
  const fetchArtifacts = useCallback(async () => {
    setArtifactsLoading(true);

    const { data } = await supabase
      .from('album_artifacts')
      .select('position, artifacts(*)')
      .eq('album_id', id)
      .order('position', { ascending: true });

    if (!data) {
      setArtifactsLoading(false);
      return;
    }

    // RLS already filters removed/deleted rows; keep only ready artifacts
    const rows = data
      .map((row) => row.artifacts as ArtifactRow | null)
      .filter((a): a is ArtifactRow => a !== null && a.status === 'ready');

    // Batch-fetch signed view URLs
    const urlMap: Record<string, string> = {};
    if (rows.length > 0) {
      try {
        const signed = await getArtifactUrls(
          rows.map((a) => ({
            artifactId: a.id,
            variant: 'thumb' as Variant,
            contentType: 'image/jpeg' as const,
          })),
        );
        for (const { artifactId, url } of signed) {
          urlMap[artifactId] = url;
        }
      } catch (e) {
        console.error('[AlbumScreen] getArtifactUrls failed:', e);
      }
    }

    setArtifacts(rows.map((a) => ({ ...a, url: urlMap[a.id] ?? null })));
    setArtifactsLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void fetchArtifacts();
    }, [fetchArtifacts]),
  );

  const openArtifact = (item: GridItem) => {
    setArtifactList(
      sortedArtifacts.map((a) => ({
        id: a.id,
        media_type: a.media_type ?? 'photo',
        original_content_type: a.original_content_type ?? '',
      })),
      sortedArtifacts.findIndex((a) => a.id === item.id),
    );
    router.push({
      pathname: '/album/artifact',
      params: {
        artifactId: item.id,
        mediaType: item.media_type,
        contentType: item.original_content_type,
      },
    });
  };

  const handleUpload = async () => {
    if (!user) return;

    const assets = await pickArtifacts();
    if (assets.length === 0) return;

    setUploadProgress({ current: 0, total: assets.length });
    const { failed } = await uploadAssetsToAlbum({
      albumId: id,
      userId: user.id,
      assets,
      onProgress: (current, total) => setUploadProgress({ current, total }),
    });

    setUploadProgress(null);
    if (failed > 0) {
      Alert.alert('Upload finished', `${assets.length - failed} succeeded, ${failed} failed.`);
    }
    fetchArtifacts();
  };

  const handleOpenEdit = () => {
    setEditTitle(album?.title ?? '');
    setEditDescription(album?.description ?? '');
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    await supabase
      .from('albums')
      .update({ title: editTitle.trim(), description: editDescription.trim() || null })
      .eq('id', id);
    setAlbum((prev) =>
      prev
        ? { ...prev, title: editTitle.trim(), description: editDescription.trim() || null }
        : prev,
    );
    setEditModalOpen(false);
  };

  // TODO: add a "Recently Deleted" section on the albums screen where soft-deleted albums can be
  //       recovered within a grace period (e.g. 30 days) before permanent deletion.
  // TODO: replace this single delete action with two options — "Delete for Everyone" (removes the
  //       album for all members) vs "Remove for Me" (hides it only from the current user's view,
  //       leaving it intact for other members). Distinction matters once shared albums are live.
  const handleDeleteAlbum = () => {
    setMenuOpen(false);
    Alert.alert(
      'Delete Album',
      'This will permanently delete the album. Photos will not be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase
              .from('albums')
              .update({ deleted_at: new Date().toISOString() })
              .eq('id', id);
            router.back();
          },
        },
      ],
    );
  };

  const uploading = uploadProgress !== null;

  // ── Layout constants ────────────────────────────────────────────────────────
  const COVER_WIDTH = 225;
  const COVER_HEIGHT = Math.round(COVER_WIDTH * 1.3);
  // Space reserved above the book for the button row (8 top offset + 44 button + 16 gap)
  const BUTTON_AREA = 68;
  // Shelf line sits 75% of the way down the book cover; BUTTON_AREA pushes book below buttons
  const SHELF_HEIGHT = Math.round(COVER_HEIGHT * 0.75) + BUTTON_AREA;
  const COVER_MARGIN_TOP = -Math.round(COVER_HEIGHT * 0.75);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* ── Shelf header ── */}
        <View style={{ height: insets.top + SHELF_HEIGHT }}>
          <MeshGradient
            seed={id}
            colors={artifacts[0]?.dominant_colors ?? ALBUM_COLORS}
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
          {/* Back button */}
          <GlassIconButton
            style={{ position: 'absolute', top: insets.top + 8, left: 16 }}
            onPress={() => router.back()}
            accessibilityLabel="Back"
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </GlassIconButton>

          {/* Stats row — centered in nav bar */}
          {!artifactsLoading && (
            <View
              style={{
                position: 'absolute',
                top: insets.top + 8,
                left: 0,
                right: 0,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 16,
                pointerEvents: 'none',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ImageIcon size={18} color="rgba(255,255,255,0.35)" />
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 18, fontWeight: '500' }}>
                  {artifacts.filter((a) => a.media_type === 'photo').length}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <SquarePlay size={18} color="rgba(255,255,255,0.35)" />
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: '500' }}>
                  {artifacts.filter((a) => a.media_type === 'video').length}
                </Text>
              </View>
            </View>
          )}

          {/* Edit (pencil) button */}
          <GlassIconButton
            style={{ position: 'absolute', top: insets.top + 8, right: 68 }}
            onPress={handleOpenEdit}
            accessibilityLabel="Edit album"
          >
            <Pencil size={18} color="#FFFFFF" />
          </GlassIconButton>

          {/* Menu (3-dot) button */}
          <GlassIconButton
            style={{ position: 'absolute', top: insets.top + 8, right: 16 }}
            onPress={() => setMenuOpen(true)}
            accessibilityLabel="Album options"
          >
            <MoreVertical size={20} color="#FFFFFF" />
          </GlassIconButton>
        </View>

        {/* ── Book cover (overlaps shelf) ── */}
        <View style={{ alignItems: 'center', marginTop: COVER_MARGIN_TOP }}>
          <AlbumBookCover width={COVER_WIDTH} title={album?.title} imageUri={artifacts[0]?.url} />
        </View>

        {/* ── Title & description ── */}
        <View
          style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28 }}
        >
          {albumLoading ? (
            <ActivityIndicator color="#A3A3A3" />
          ) : (
            <>
              <Text
                style={{ color: '#F5F5F5', fontSize: 32, fontWeight: '700', textAlign: 'center' }}
              >
                {album?.title}
              </Text>
              {album?.description ? (
                <Text style={{ color: '#A3A3A3', fontSize: 16, textAlign: 'center', marginTop: 6 }}>
                  {album.description}
                </Text>
              ) : null}
            </>
          )}
        </View>

        {/* ── Toolbar: view toggle + sort ── */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: 18,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              padding: 3,
              borderRadius: 6,
              backgroundColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 3,
                left: 3,
                bottom: 3,
                width: VIEW_TOGGLE_SEGMENT,
                borderRadius: 4,
                backgroundColor: 'rgba(255,255,255,0.16)',
                transform: [
                  {
                    translateX: viewToggleAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, VIEW_TOGGLE_SEGMENT],
                    }),
                  },
                ],
              }}
            />
            {(
              [
                { mode: 'grid', Icon: LayoutGrid, label: 'Grid view' },
                { mode: 'list', Icon: List, label: 'List view' },
              ] as const
            ).map(({ mode, Icon, label }) => (
              <Pressable
                key={mode}
                onPress={() => setViewMode(mode)}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: viewMode === mode }}
              >
                <View
                  style={{
                    width: VIEW_TOGGLE_SEGMENT,
                    height: 26,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={16} color={viewMode === mode ? '#F5F5F5' : '#737373'} />
                </View>
              </Pressable>
            ))}
          </View>

          <Pressable ref={sortTriggerRef} onPress={openSortMenu} hitSlop={8}>
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 6,
                  backgroundColor: pressed ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)',
                }}
              >
                <ArrowDownUp size={16} color="#A3A3A3" />
                <Text style={{ color: '#A3A3A3', fontSize: 16, fontWeight: '500' }}>
                  {SORT_OPTIONS.find((o) => o.value === sortOrder)?.label}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* ── Artifacts (grid or list) ── */}
        {artifactsLoading ? (
          <ActivityIndicator color="#A3A3A3" style={{ marginTop: 60 }} />
        ) : viewMode === 'list' ? (
          // TODO: virtualize list for large albums
          <View style={{ paddingHorizontal: 12 }}>
            {/* TODO: enhance upload artifacts UI in album list view */}
            <Pressable
              disabled={uploading}
              onPress={handleUpload}
              style={{
                height: 64,
                borderRadius: 4,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: '#171717',
                marginBottom: 8,
              }}
            >
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderWidth: 1.5,
                  borderColor: '#333333',
                  borderStyle: 'dashed',
                  borderRadius: 4,
                }}
              />
              {uploading ? (
                <ActivityIndicator color="#A3A3A3" />
              ) : (
                <>
                  <Plus size={20} color="#A3A3A3" />
                  <Text style={{ color: '#A3A3A3', fontSize: 14, fontWeight: '500' }}>
                    Upload Artifacts
                  </Text>
                </>
              )}
            </Pressable>
            {sortedArtifacts.map((item, index) => {
              const isVideo = item.media_type === 'video';
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.7}
                  onPress={() => openArtifact(item)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 8,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: 'rgba(255,255,255,0.06)',
                  }}
                >
                  <View
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 4,
                      overflow: 'hidden',
                      backgroundColor: '#1C1C1E',
                    }}
                  >
                    {item.url ? (
                      <Image
                        source={{ uri: item.url }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                        transition={200}
                      />
                    ) : null}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {isVideo ? (
                        <SquarePlay size={14} color="#A3A3A3" />
                      ) : (
                        <ImageIcon size={14} color="#A3A3A3" />
                      )}
                      <Text style={{ color: '#F5F5F5', fontSize: 15, fontWeight: '500' }}>
                        {isVideo ? 'Video' : 'Photo'}
                        {isVideo && item.duration_seconds != null
                          ? ` · ${formatDuration(item.duration_seconds)}`
                          : ''}
                      </Text>
                    </View>
                    {/* TODO: show uploader's display name (join profiles on uploaded_by) */}
                    <Text style={{ color: '#A3A3A3', fontSize: 13 }} numberOfLines={1}>
                      Uploaded {formatDate(item.created_at)}
                      {item.taken_at ? ` · Taken ${formatDate(item.taken_at)}` : ''}
                    </Text>
                    <Text style={{ color: '#737373', fontSize: 13 }} numberOfLines={1}>
                      {item.width} × {item.height} · {formatBytes(item.file_size_bytes)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          // TODO: virtualize grid for large albums
          (() => {
            const allItems: (GridItem | 'upload')[] = ['upload', ...sortedArtifacts];
            return (
              <View style={{ gap: 6 }}>
                {Array.from({ length: Math.ceil(allItems.length / 3) }, (_, row) => {
                  const rowItems = allItems.slice(row * 3, row * 3 + 3);
                  const padded: (GridItem | 'upload' | null)[] = [
                    ...rowItems,
                    ...Array<null>(3 - rowItems.length).fill(null),
                  ];
                  return (
                    <View key={row} style={{ flexDirection: 'row', gap: 6 }}>
                      {padded.map((item, col) => {
                        if (item === 'upload') {
                          return (
                            <Pressable
                              key="upload"
                              disabled={uploading}
                              onPress={handleUpload}
                              style={{
                                flex: 1,
                                aspectRatio: 1,
                                borderRadius: 4,
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                backgroundColor: '#171717',
                              }}
                            >
                              <View
                                pointerEvents="none"
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  borderWidth: 1.5,
                                  borderColor: '#333333',
                                  borderStyle: 'dashed',
                                  borderRadius: 4,
                                }}
                              />
                              {uploading ? (
                                <ActivityIndicator color="#A3A3A3" />
                              ) : (
                                <>
                                  <Plus size={22} color="#A3A3A3" />
                                  <Text
                                    style={{
                                      color: '#A3A3A3',
                                      fontSize: 14,
                                      fontWeight: '500',
                                    }}
                                  >
                                    Upload Artifacts
                                  </Text>
                                </>
                              )}
                            </Pressable>
                          );
                        }
                        if (item) {
                          return (
                            <TouchableOpacity
                              key={item.id}
                              activeOpacity={0.8}
                              style={{
                                flex: 1,
                                aspectRatio: 1,
                                backgroundColor: '#1C1C1E',
                                borderRadius: 4,
                                overflow: 'hidden',
                              }}
                              onPress={() => openArtifact(item)}
                            >
                              {item.url ? (
                                <Image
                                  source={{ uri: item.url }}
                                  style={{ width: '100%', height: '100%' }}
                                  contentFit="cover"
                                  transition={200}
                                />
                              ) : null}
                            </TouchableOpacity>
                          );
                        }
                        return <View key={`empty-${col}`} style={{ flex: 1, aspectRatio: 1 }} />;
                      })}
                    </View>
                  );
                })}
              </View>
            );
          })()
        )}
      </ScrollView>

      {/* Dropdown menu */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        {/* Dim overlay */}
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={() => setMenuOpen(false)}
        />
        {/* Menu card — anchored top-right, slides over the overlay */}
        <View
          style={{
            position: 'absolute',
            top: insets.top + 64,
            right: 16,
            width: 220,
            borderRadius: 16,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.5,
            shadowRadius: 24,
            elevation: 24,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <BlurView
            intensity={60}
            tint="systemUltraThinMaterialDark"
            style={{ overflow: 'hidden' }}
          >
            <View style={{ backgroundColor: 'rgba(28,28,30,0.7)' }}>
              {/* Delete action */}
              <Pressable onPress={handleDeleteAlbum}>
                {({ pressed }) => (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      backgroundColor: pressed ? 'rgba(239,68,68,0.08)' : 'transparent',
                    }}
                  >
                    <Trash2 size={20} color="#EF4444" />
                    <Text style={{ color: '#EF4444', fontSize: 16, marginLeft: 14 }}>
                      Delete Album
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          </BlurView>
        </View>
      </Modal>

      {/* Sort dropdown — anchored below the sort trigger */}
      <Modal
        visible={sortMenuAnchor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenuAnchor(null)}
      >
        <Pressable style={{ flex: 1 }} onPress={() => setSortMenuAnchor(null)} />
        {sortMenuAnchor && (
          <View
            style={{
              position: 'absolute',
              top: sortMenuAnchor.top,
              right: sortMenuAnchor.right,
              width: 160,
              borderRadius: 14,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.5,
              shadowRadius: 24,
              elevation: 24,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <BlurView intensity={60} tint="systemUltraThinMaterialDark">
              <View style={{ backgroundColor: 'rgba(28,28,30,0.7)' }}>
                {SORT_OPTIONS.map((option) => {
                  const selected = option.value === sortOrder;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => {
                        setSortOrder(option.value);
                        setSortMenuAnchor(null);
                      }}
                    >
                      {({ pressed }) => (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingVertical: 12,
                            paddingHorizontal: 16,
                            backgroundColor: pressed ? 'rgba(255,255,255,0.06)' : 'transparent',
                          }}
                        >
                          <Text
                            style={{
                              color: selected ? '#F5F5F5' : '#A3A3A3',
                              fontSize: 16,
                              fontWeight: selected ? '600' : '400',
                            }}
                          >
                            {option.label}
                          </Text>
                          {selected && <Check size={18} color="#F5F5F5" />}
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </BlurView>
          </View>
        )}
      </Modal>

      {/* Edit album modal */}
      {/* TODO: enhance modal UI — keyboard-aware scroll, character limits, inline validation, cover photo picker */}
      <Modal
        visible={editModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            padding: 24,
          }}
          onPress={() => setEditModalOpen(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <BlurView
              intensity={60}
              tint="systemUltraThinMaterialDark"
              style={{
                borderRadius: 20,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <View style={{ backgroundColor: 'rgba(20,20,20,0.7)', padding: 24, gap: 16 }}>
                <Text style={{ color: '#F5F5F5', fontSize: 18, fontWeight: '600' }}>
                  Edit Album
                </Text>

                <View style={{ gap: 8 }}>
                  <Text style={{ color: '#A3A3A3', fontSize: 13, fontWeight: '500' }}>Title</Text>
                  <TextInput
                    value={editTitle}
                    onChangeText={setEditTitle}
                    placeholder="Album title"
                    placeholderTextColor="#525252"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.06)',
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.08)',
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      color: '#F5F5F5',
                      fontSize: 16,
                    }}
                  />
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={{ color: '#A3A3A3', fontSize: 13, fontWeight: '500' }}>
                    Description
                  </Text>
                  <TextInput
                    value={editDescription}
                    onChangeText={setEditDescription}
                    placeholder="Add a description…"
                    placeholderTextColor="#525252"
                    multiline
                    numberOfLines={3}
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.06)',
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.08)',
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      color: '#F5F5F5',
                      fontSize: 16,
                      minHeight: 80,
                      textAlignVertical: 'top',
                    }}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <Pressable
                    onPress={() => setEditModalOpen(false)}
                    style={({ pressed }) => ({
                      flex: 1,
                      paddingVertical: 13,
                      borderRadius: 12,
                      alignItems: 'center',
                      backgroundColor: pressed
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(255,255,255,0.05)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.08)',
                    })}
                  >
                    <Text style={{ color: '#A3A3A3', fontSize: 16, fontWeight: '500' }}>
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSaveEdit}
                    style={({ pressed }) => ({
                      flex: 1,
                      paddingVertical: 13,
                      borderRadius: 12,
                      alignItems: 'center',
                      backgroundColor: pressed ? '#2563EB' : '#3B82F6',
                    })}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>Save</Text>
                  </Pressable>
                </View>
              </View>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Upload progress */}
      {uploading && uploadProgress && (
        <View style={[styles.progressBar, { paddingBottom: insets.bottom + 16 }]}>
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  shelfLine: { height: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#141414',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  progressTrack: { height: 4, backgroundColor: '#2A2A2A', borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: '#3B82F6', borderRadius: 2 },
});
