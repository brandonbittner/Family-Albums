import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getArtifactUrls } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

type Album = Database['public']['Tables']['albums']['Row'];

// ── Palettes ─────────────────────────────────────────────────────────────────

const PALETTES = [
  { spine: '#3D0C11', cover: '#6B1A22', text: '#F5E6C8', accent: '#C9956B' },
  { spine: '#0A2E1A', cover: '#1A4D2E', text: '#E8F5E9', accent: '#82C18A' },
  { spine: '#0A1128', cover: '#1A2C5E', text: '#E8EAF6', accent: '#90A4C9' },
  { spine: '#2D1B0E', cover: '#5C3317', text: '#FFF3E0', accent: '#D4A96A' },
  { spine: '#1A2030', cover: '#2D3A54', text: '#ECEFF1', accent: '#7B9AB4' },
  { spine: '#2A0A2E', cover: '#4A1558', text: '#F3E5F5', accent: '#C389D4' },
  { spine: '#2E1A0A', cover: '#5C3517', text: '#FFF8E1', accent: '#C8874A' },
  { spine: '#0A2A2E', cover: '#1A4D54', text: '#E0F7FA', accent: '#6AB8C0' },
  { spine: '#1E1E0A', cover: '#3D3A0E', text: '#FFFDE7', accent: '#D4C46A' },
  { spine: '#200A0A', cover: '#4D1515', text: '#FFF0F0', accent: '#C46A6A' },
  { spine: '#0A0A2E', cover: '#15154D', text: '#F0F0FF', accent: '#6A6AC4' },
  { spine: '#0A1E1A', cover: '#143D35', text: '#E0FFF9', accent: '#6AC4B0' },
] as const;

type Palette = {
  readonly spine: string;
  readonly cover: string;
  readonly text: string;
  readonly accent: string;
};

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getPalette(id: string): Palette {
  return PALETTES[hashId(id) % PALETTES.length];
}

// ── Cover building blocks ─────────────────────────────────────────────────────

const PHOTO_GAP = 2;

function PhotoPanel({ url, flex = 1 }: { url: string; flex?: number }) {
  return (
    <View style={{ flex, overflow: 'hidden' }}>
      <Image
        source={{ uri: url }}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        transition={300}
      />
    </View>
  );
}

function TitleBand({ title, p }: { title: string; p: Palette }) {
  return (
    <View
      style={{
        backgroundColor: p.cover,
        paddingVertical: 7,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: p.accent + '66',
      }}
    >
      <Text
        style={{
          color: p.accent,
          fontSize: 8,
          fontWeight: '900',
          textAlign: 'center',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          lineHeight: 11,
        }}
        numberOfLines={2}
      >
        {title}
      </Text>
    </View>
  );
}

// ── Cover face — layout switches on photo count ───────────────────────────────

function CoverFace({ album, p, photoUrls }: { album: Album; p: Palette; photoUrls: string[] }) {
  const n = photoUrls.length;

  // 0 photos — decorative solid cover
  if (n === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: p.cover, padding: 12 }}>
        <View style={{ height: 1.5, backgroundColor: p.accent, opacity: 0.7 }} />
        <View style={{ height: 1, backgroundColor: p.accent, marginTop: 3, opacity: 0.35 }} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text
            style={{
              color: p.text,
              fontSize: 10,
              fontWeight: '800',
              textAlign: 'center',
              letterSpacing: 0.8,
              lineHeight: 15,
              textTransform: 'uppercase',
            }}
            numberOfLines={6}
          >
            {album.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 4 }}>
            <View style={{ height: 1, width: 18, backgroundColor: p.accent, opacity: 0.6 }} />
            <View
              style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: p.accent,
                opacity: 0.8,
              }}
            />
            <View style={{ height: 1, width: 18, backgroundColor: p.accent, opacity: 0.6 }} />
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: p.accent, marginBottom: 3, opacity: 0.35 }} />
        <View style={{ height: 1.5, backgroundColor: p.accent, opacity: 0.7 }} />
      </View>
    );
  }

  // 1 photo — full bleed + bottom title band
  if (n === 1) {
    return (
      <View style={{ flex: 1 }}>
        <PhotoPanel url={photoUrls[0]} flex={1} />
        <TitleBand title={album.title} p={p} />
      </View>
    );
  }

  // 2 photos — side-by-side top + title band
  if (n === 2) {
    return (
      <View style={{ flex: 1, backgroundColor: p.cover, gap: PHOTO_GAP }}>
        <View style={{ flex: 6, flexDirection: 'row', gap: PHOTO_GAP }}>
          <PhotoPanel url={photoUrls[0]} />
          <PhotoPanel url={photoUrls[1]} />
        </View>
        <TitleBand title={album.title} p={p} />
        <View style={{ flex: 2 }} />
      </View>
    );
  }

  // 3 photos — [photo|photo] / title / full-width photo
  if (n === 3) {
    return (
      <View style={{ flex: 1, backgroundColor: p.cover, gap: PHOTO_GAP }}>
        <View style={{ flex: 4, flexDirection: 'row', gap: PHOTO_GAP }}>
          <PhotoPanel url={photoUrls[0]} />
          <PhotoPanel url={photoUrls[1]} />
        </View>
        <TitleBand title={album.title} p={p} />
        <PhotoPanel url={photoUrls[2]} flex={5} />
      </View>
    );
  }

  // 4 photos — Lisboa-style asymmetric collage
  return (
    <View style={{ flex: 1, backgroundColor: p.cover, gap: PHOTO_GAP }}>
      <View style={{ flex: 5, flexDirection: 'row', gap: PHOTO_GAP }}>
        <PhotoPanel url={photoUrls[0]} flex={2} />
        <PhotoPanel url={photoUrls[1]} flex={1} />
      </View>
      <TitleBand title={album.title} p={p} />
      <View style={{ flex: 5, flexDirection: 'row', gap: PHOTO_GAP }}>
        <PhotoPanel url={photoUrls[2]} flex={1} />
        <PhotoPanel url={photoUrls[3]} flex={2} />
      </View>
    </View>
  );
}

// ── Book cover shell (spine + shadow) ────────────────────────────────────────

function BookCover({ album, photoUrls }: { album: Album; photoUrls: string[] }) {
  const p = getPalette(album.id);

  return (
    <View
      style={{
        flex: 1,
        borderRadius: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
        elevation: 8,
      }}
    >
      <View style={{ flex: 1, flexDirection: 'row', borderRadius: 5, overflow: 'hidden' }}>
        {/* Spine */}
        <View
          style={{
            width: 12,
            backgroundColor: p.spine,
            borderRightWidth: 1,
            borderRightColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: 2,
              top: 0,
              bottom: 0,
              width: 1.5,
              backgroundColor: 'rgba(255,255,255,0.15)',
            }}
          />
        </View>
        {/* Cover face */}
        <CoverFace album={album} p={p} photoUrls={photoUrls} />
      </View>
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
      <Text style={{ color: '#0F172A', fontSize: 20, fontWeight: '700', marginBottom: 6 }}>
        Create Your First Album
      </Text>
      <Text style={{ color: '#64748B', fontSize: 14, textAlign: 'center', marginBottom: 28 }}>
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

const COLUMN_COUNT = 3;
const COLUMN_GAP = 14;
const H_PADDING = 16; // wall strip width
const CONTENT_PADDING = 28; // gap between wall and books
const ITEM_WIDTH =
  (Dimensions.get('window').width - CONTENT_PADDING * 2 - COLUMN_GAP * (COLUMN_COUNT - 1)) /
  COLUMN_COUNT;
const ITEM_HEIGHT = ITEM_WIDTH * 1.5;
const ROW_SECTION_HEIGHT = 24 + ITEM_HEIGHT + 19; // paddingTop + books + shelf
const MIN_ROWS = Math.ceil(Dimensions.get('window').height / ROW_SECTION_HEIGHT) + 2;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function TopShelf() {
  return (
    <View
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 10,
        marginTop: 16,
        marginBottom: 0,
        marginHorizontal: -CONTENT_PADDING,
      }}
    >
      <View
        style={{
          height: 18,
          backgroundColor: '#F8FAFC',
          borderBottomWidth: 1,
          borderBottomColor: '#E2E8F0',
        }}
      />
    </View>
  );
}

function Bookshelf() {
  return (
    <View
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 10,
        marginBottom: 0,
        marginHorizontal: -CONTENT_PADDING,
      }}
    >
      <View
        style={{
          height: 18,
          backgroundColor: '#F8FAFC',
          borderTopWidth: 1,
          borderTopColor: '#FFFFFF',
        }}
      />
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
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {/* Left wall */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: H_PADDING,
          backgroundColor: '#F8FAFC',
          zIndex: 1,
        }}
      />
      {/* Right wall */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: H_PADDING,
          backgroundColor: '#F8FAFC',
          zIndex: 1,
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: '#F8FAFC' }}
        contentContainerStyle={{
          paddingTop: insets.top + 16,
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
            marginBottom: 24,
          }}
        >
          <View>
            <Text
              style={{ fontSize: 26, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 }}
            >
              My Albums
            </Text>
            {albums.length > 0 && (
              <Text style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
                {albums.length} {albums.length === 1 ? 'album' : 'albums'}
              </Text>
            )}
          </View>
          {albums.length > 0 && (
            <Pressable
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: '#3B82F6',
                borderRadius: 20,
                paddingVertical: 8,
                paddingHorizontal: 14,
                opacity: pressed ? 0.8 : 1,
              })}
              onPress={() => router.push('/(app)/create-album')}
            >
              <Plus size={15} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 13 }}>New</Text>
            </Pressable>
          )}
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

              const shelfSection = (content: React.ReactNode, key: React.Key) => (
                <View key={key}>
                  <View
                    style={{
                      marginHorizontal: -CONTENT_PADDING,
                      paddingHorizontal: CONTENT_PADDING,
                      paddingTop: 24,
                      paddingBottom: 0,
                      backgroundColor: '#E2E8F0',
                    }}
                  >
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
                                  aspectRatio: 2 / 3,
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
                    ),
                  )}
                  {Array.from({ length: emptyCount }).map((_, i) =>
                    shelfSection(<View style={{ height: ITEM_HEIGHT }} />, `empty-${i}`),
                  )}
                </>
              );
            })()}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
