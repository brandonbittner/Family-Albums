import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { Plus, Search, X } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { getArtifactUrls } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

type Album = Database['public']['Tables']['albums']['Row'];

// ── Book cover ────────────────────────────────────────────────────────────────

function BookCover({ album }: { album: Album; photoUrls: string[] }) {
  return (
    <View
      style={{
        flex: 1,
        borderTopLeftRadius: 2,
        borderTopRightRadius: 2,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 4,
        elevation: 8,
        padding: 10,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          color: '#1A1A1A',
          fontSize: 13,
          fontWeight: '600',
          textAlign: 'center',
          lineHeight: 18,
        }}
        numberOfLines={4}
      >
        {album.title}
      </Text>
      {/* Spine: gap → dark crease → soft light catch → transparent */}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0.22)',
          'rgba(0,0,0,0)',
          'rgba(255,255,255,0.13)',
          'rgba(255,255,255,0)',
        ]}
        locations={[0, 0.15, 0.3, 0.5, 0.75]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', top: 0, left: 5, bottom: 0, width: 26 }}
        pointerEvents="none"
      />
      {/* Bottom shadow */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.25)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 32 }}
        pointerEvents="none"
      />
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={{ alignItems: 'center', marginTop: 60, paddingHorizontal: 32 }}>
      <View
        style={{
          width: 100,
          height: 100,
          borderRadius: 50,
          backgroundColor: '#3B82F6',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
          shadowColor: '#3B82F6',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        <View
          style={{
            width: 44,
            height: 56,
            backgroundColor: '#FFFFFF',
            borderRadius: 3,
            shadowColor: '#000',
            shadowOffset: { width: 2, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
          }}
        />
      </View>
      <Text style={{ color: '#F5F5F5', fontSize: 20, fontWeight: '700', marginBottom: 6 }}>
        Create Your First Album
      </Text>
      <Text style={{ color: '#A3A3A3', fontSize: 14, textAlign: 'center', marginBottom: 28 }}>
        Collect memories and moments in a beautiful album
      </Text>
      <Pressable
        style={({ pressed }) => ({
          backgroundColor: '#3B82F6',
          borderRadius: 28,
          paddingVertical: 14,
          paddingHorizontal: 40,
          opacity: pressed ? 0.85 : 1,
        })}
        onPress={() => router.push('/(app)/create-album')}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>New Album</Text>
      </Pressable>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

const WALL_GRADIENT = ['#1E1E1E', '#111111'] as const;

const COLUMN_COUNT = 3;
const COLUMN_GAP = 14;
const H_PADDING = 16; // wall strip width
const CONTENT_PADDING = 28; // gap between wall and books
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const ITEM_WIDTH =
  (SCREEN_WIDTH - CONTENT_PADDING * 2 - COLUMN_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT;
const ITEM_HEIGHT = ITEM_WIDTH * 1.3;
const ROW_SECTION_HEIGHT = 24 + ITEM_HEIGHT + 19; // paddingTop + books + shelf
const GRAIN_HEIGHT = Math.round(24 + ITEM_HEIGHT);
const MIN_ROWS = Math.ceil(Dimensions.get('window').height / ROW_SECTION_HEIGHT) + 2;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Wood grain texture ─────────────────────────────────────────────────────────

function sr(seed: number): number {
  const x = Math.sin(seed * 9301.0 + 49297.0) * 233280.0;
  return x - Math.floor(x);
}

// TODO: replace with proper wood grain SVG assets for better visual quality and performance
function WoodGrain({ seed }: { seed: number }) {
  const lines: React.ReactElement[] = [];
  let y = 2;
  let li = 0;
  while (y < GRAIN_HEIGHT - 2) {
    const b = seed * 1000 + li * 37;
    const amp = 1 + sr(b) * 3.5;
    const sw = 0.25 + sr(b + 1) * 0.8;
    const op = 0.03 + sr(b + 2) * 0.12;
    const segs = 10;
    const segW = SCREEN_WIDTH / segs;
    let d = `M 0 ${y.toFixed(2)}`;
    for (let s = 0; s < segs; s++) {
      const x1 = (s * segW + segW * 0.3).toFixed(2);
      const y1 = (y + (sr(b + s * 4 + 3) - 0.5) * amp * 2).toFixed(2);
      const x2 = (s * segW + segW * 0.7).toFixed(2);
      const y2 = (y + (sr(b + s * 4 + 4) - 0.5) * amp * 2).toFixed(2);
      const x3 = ((s + 1) * segW).toFixed(2);
      const y3 = (y + (sr(b + s * 4 + 5) - 0.5) * amp).toFixed(2);
      d += ` C ${x1} ${y1} ${x2} ${y2} ${x3} ${y3}`;
    }
    lines.push(
      <Path key={li} d={d} stroke="#8B8B8B" strokeWidth={sw} strokeOpacity={op} fill="none" />,
    );
    y += 2.5 + sr(b + 6) * 4.5 + sw;
    li++;
  }
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0 }}>
      <Svg width={SCREEN_WIDTH} height={GRAIN_HEIGHT}>
        {lines}
      </Svg>
    </View>
  );
}

function TopShelf() {
  return (
    <View style={{ marginTop: 2, marginBottom: 0, marginHorizontal: -CONTENT_PADDING }}>
      <View style={{ height: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.3)' }} />
    </View>
  );
}

function Bookshelf() {
  return (
    <View style={{ marginBottom: 0, marginHorizontal: -CONTENT_PADDING }}>
      <View style={{ height: 18, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }} />
    </View>
  );
}

export default function AlbumsScreen() {
  const insets = useSafeAreaInsets();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [coverUrls, setCoverUrls] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [scrollEnabled, setScrollEnabled] = useState(false);
  const containerHRef = useRef(0);

  const [searchActive, setSearchActive] = useState(false);
  const [searchText, setSearchText] = useState('');
  const searchWidth = useRef(new Animated.Value(44)).current;
  const avatarOpacity = useRef(new Animated.Value(1)).current;
  const searchInputRef = useRef<TextInput>(null);

  const openSearch = () => {
    setSearchActive(true);
    Animated.parallel([
      Animated.timing(searchWidth, {
        toValue: SCREEN_WIDTH - 40,
        duration: 250,
        useNativeDriver: false,
      }),
      Animated.timing(avatarOpacity, { toValue: 0, duration: 150, useNativeDriver: false }),
    ]).start(() => searchInputRef.current?.focus());
  };

  const closeSearch = () => {
    searchInputRef.current?.blur();
    setSearchText('');
    Animated.parallel([
      Animated.timing(searchWidth, { toValue: 44, duration: 200, useNativeDriver: false }),
      Animated.timing(avatarOpacity, { toValue: 1, duration: 200, useNativeDriver: false }),
    ]).start(() => setSearchActive(false));
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);

      async function fetchAll() {
        // 1. Fetch albums
        const { data: albumData, error } = await supabase
          .from('albums')
          .select('*')
          .order('created_at', { ascending: false });

        if (!active) return;
        if (error || !albumData) {
          setLoading(false);
          return;
        }

        setAlbums(albumData);
        setLoading(false);

        if (albumData.length === 0) return;

        // 2. Fetch the first few ready artifact IDs per album
        const albumIds = albumData.map((a) => a.id);
        const { data: aaData } = await supabase
          .from('album_artifacts')
          .select('album_id, artifacts(id, status)')
          .in('album_id', albumIds)
          .order('position', { ascending: true });

        if (!active || !aaData) return;

        const thumbIdsByAlbum: Record<string, string[]> = {};
        for (const row of aaData) {
          const art = row.artifacts as { id: string; status: string } | null;
          if (!art || art.status !== 'ready') continue;
          if (!thumbIdsByAlbum[row.album_id]) thumbIdsByAlbum[row.album_id] = [];
          if (thumbIdsByAlbum[row.album_id].length < 4) {
            thumbIdsByAlbum[row.album_id].push(art.id);
          }
        }

        const allItems = Object.values(thumbIdsByAlbum)
          .flat()
          .map((id) => ({
            artifactId: id,
            variant: 'thumb' as const,
            contentType: 'image/jpeg' as const,
          }));

        if (allItems.length === 0) return;

        // 3. Batch-fetch signed thumb URLs
        try {
          const signed = await getArtifactUrls(allItems);
          if (!active) return;

          const urlMap: Record<string, string> = {};
          for (const { artifactId, url } of signed) urlMap[artifactId] = url;

          const result: Record<string, string[]> = {};
          for (const [albumId, ids] of Object.entries(thumbIdsByAlbum)) {
            result[albumId] = ids.map((id) => urlMap[id]).filter(Boolean) as string[];
          }
          setCoverUrls(result);
        } catch {
          // Cover photos best-effort; solid covers render as fallback
        }
      }

      void fetchAll();
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <LinearGradient colors={WALL_GRADIENT} style={{ flex: 1, minHeight: SCREEN_HEIGHT }}>
      {/* Left wall — same gradient masks any scrolling content bleed at edges */}
      <LinearGradient
        colors={WALL_GRADIENT}
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: H_PADDING, zIndex: 1 }}
      />
      {/* Right wall */}
      <LinearGradient
        colors={WALL_GRADIENT}
        pointerEvents="none"
        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: H_PADDING, zIndex: 1 }}
      />
      {/* Floating top nav */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + 2,
          left: 20,
          right: 20,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        {/* Search */}
        <Animated.View
          style={{
            width: searchWidth,
            height: 44,
            borderRadius: 22,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.15)',
          }}
        >
          <BlurView
            intensity={20}
            tint="systemUltraThinMaterialDark"
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 }}
          >
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.06)' }]}
            />
            <Pressable onPress={openSearch} hitSlop={8}>
              <Search size={18} color="#F5F5F5" />
            </Pressable>
            {searchActive && (
              <>
                <TextInput
                  ref={searchInputRef}
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Search albums…"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  style={{ flex: 1, color: '#F5F5F5', fontSize: 15, marginLeft: 8 }}
                  autoCorrect={false}
                />
                <Pressable onPress={closeSearch} hitSlop={8}>
                  <X size={18} color="#F5F5F5" />
                </Pressable>
              </>
            )}
          </BlurView>
        </Animated.View>

        {/* Profile avatar */}
        <Animated.View style={{ opacity: avatarOpacity }}>
          <Pressable style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                overflow: 'hidden',
                borderWidth: 1.5,
                borderColor: 'rgba(255,255,255,0.25)',
              }}
            >
              <Image
                // TODO: replace with real signed avatar URL from user profile
                source={require('../../../assets/images/avatar.jpeg')}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            </View>
          </Pressable>
        </Animated.View>
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: insets.top + 2 + 44 + 18,
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: 'rgba(255,255,255,0.08)',
          zIndex: 10,
        }}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 70,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: CONTENT_PADDING,
        }}
        scrollEnabled={scrollEnabled}
        onLayout={(e) => {
          containerHRef.current = e.nativeEvent.layout.height;
        }}
        onContentSizeChange={(_w, totalH) => {
          const realRows = Math.ceil(albums.length / COLUMN_COUNT);
          const emptyRows = Math.max(0, MIN_ROWS - realRows);
          const realH = totalH - emptyRows * ROW_SECTION_HEIGHT;
          setScrollEnabled(realH > containerHRef.current);
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
            marginTop: 16,
            marginHorizontal: -(CONTENT_PADDING - 20),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text
              style={{ fontSize: 26, fontWeight: '500', color: '#F5F5F5', letterSpacing: -0.5 }}
            >
              My Albums
            </Text>
            {albums.length > 0 && (
              <View
                style={{
                  borderRadius: 12,
                  minWidth: 24,
                  height: 24,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: 'rgba(96,165,250,0.4)',
                }}
              >
                <BlurView
                  intensity={20}
                  tint="systemUltraThinMaterialDark"
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 6,
                  }}
                >
                  <View
                    style={{
                      ...StyleSheet.absoluteFill,
                      backgroundColor: 'rgba(59,130,246,0.45)',
                    }}
                  />
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>
                    {albums.length}
                  </Text>
                </BlurView>
              </View>
            )}
          </View>
          <Pressable
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            onPress={() => router.push('/(app)/create-album')}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.15)',
              }}
            >
              <BlurView
                intensity={20}
                tint="systemUltraThinMaterialDark"
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <View
                  style={{
                    ...StyleSheet.absoluteFill,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                  }}
                />
                <Plus size={18} color="#F5F5F5" />
              </BlurView>
            </View>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color="#3B82F6" style={{ marginTop: 60 }} />
        ) : albums.length === 0 ? (
          <EmptyState />
        ) : (
          <View>
            <TopShelf />
            {(() => {
              const rows = chunkArray(albums, COLUMN_COUNT);
              const emptyCount = Math.max(0, MIN_ROWS - rows.length);

              const shelfSection = (content: React.ReactNode, key: React.Key, seedIdx: number) => (
                <View key={key}>
                  <View
                    style={{
                      marginHorizontal: -CONTENT_PADDING,
                      paddingHorizontal: CONTENT_PADDING,
                      paddingTop: 24,
                      paddingBottom: 0,
                      backgroundColor: '#0A0A0A',
                      overflow: 'hidden',
                    }}
                  >
                    <WoodGrain seed={seedIdx} />
                    <LinearGradient
                      colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']}
                      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40 }}
                      pointerEvents="none"
                    />
                    {content}
                  </View>
                  <Bookshelf />
                </View>
              );

              return (
                <>
                  {rows.map((row, rowIdx) =>
                    shelfSection(
                      <View style={{ flexDirection: 'row', gap: COLUMN_GAP }}>
                        {row.map((album) => (
                          <Pressable
                            key={album.id}
                            style={{ width: ITEM_WIDTH }}
                            onPress={() =>
                              router.push({
                                pathname: '/(app)/album/[id]',
                                params: { id: album.id },
                              })
                            }
                          >
                            {({ pressed }) => (
                              <View
                                style={{
                                  width: ITEM_WIDTH,
                                  height: ITEM_HEIGHT,
                                  transform: [{ scale: pressed ? 0.95 : 1 }],
                                  opacity: pressed ? 0.9 : 1,
                                }}
                              >
                                <BookCover album={album} photoUrls={coverUrls[album.id] ?? []} />
                              </View>
                            )}
                          </Pressable>
                        ))}
                        {Array.from({ length: COLUMN_COUNT - row.length }).map((_, i) => (
                          <View key={`spacer-${i}`} style={{ width: ITEM_WIDTH }} />
                        ))}
                      </View>,
                      rowIdx,
                      rowIdx,
                    ),
                  )}
                  {Array.from({ length: emptyCount }).map((_, i) =>
                    shelfSection(
                      <View style={{ height: ITEM_HEIGHT }} />,
                      `empty-${i}`,
                      rows.length + i,
                    ),
                  )}
                </>
              );
            })()}
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}
