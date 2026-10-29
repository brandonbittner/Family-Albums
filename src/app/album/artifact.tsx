import { BlurView } from 'expo-blur';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  ArrowLeft,
  Calendar,
  Download,
  Heart,
  Info,
  MapPin,
  MoreVertical,
  TagPlus,
  Trash2,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import type { ViewToken } from 'react-native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getArtifactList, type ArtifactEntry } from '@/lib/artifact-store';
import { supabase } from '@/lib/supabase';
import { getArtifactUrl, type ContentType, type Variant } from '@/lib/storage';

// Isolated so useVideoPlayer is always called inside a mounted component.
function VideoArtifact({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={{ flex: 1 }}
      nativeControls
      fullscreenOptions={{ enable: true }}
    />
  );
}

function ArtifactItem({
  artifact,
  width,
  isActive,
}: {
  artifact: ArtifactEntry;
  width: number;
  isActive: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const isVideo = artifact.media_type === 'video';

  useEffect(() => {
    const variant: Variant = isVideo ? 'original' : 'display';
    getArtifactUrl(artifact.id, variant, artifact.original_content_type as ContentType).then(
      setUrl,
    );
  }, [artifact.id, isVideo, artifact.original_content_type]);

  return (
    <View style={{ width, flex: 1, backgroundColor: 'black' }}>
      {url === null ? (
        <ActivityIndicator color="#a1a1aa" style={{ flex: 1 }} />
      ) : isVideo ? (
        isActive ? (
          <VideoArtifact url={url} />
        ) : (
          <View style={{ flex: 1 }} />
        )
      ) : (
        <Image source={{ uri: url }} style={{ flex: 1 }} contentFit="contain" />
      )}
    </View>
  );
}

function NavButton({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <View style={styles.navBtnShadow}>
        <View style={styles.navBtnClip}>
          <BlurView
            intensity={40}
            tint="systemUltraThinMaterialDark"
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={[StyleSheet.absoluteFill, styles.navBtnOverlay]} />
            {children}
          </BlurView>
        </View>
      </View>
    </Pressable>
  );
}

export default function ArtifactScreen() {
  const { artifactId, mediaType, contentType } = useLocalSearchParams<{
    artifactId: string;
    mediaType: string;
    contentType: string;
  }>();
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();

  const { artifacts, initialIndex } = getArtifactList();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [captionExpanded, setCaptionExpanded] = useState(false);

  // Each artifact starts with its caption collapsed.
  useEffect(() => {
    setCaptionExpanded(false);
  }, [activeIndex]);
  const [menuOpen, setMenuOpen] = useState(false);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const currentArtifact = artifacts[activeIndex];

  const handleDownload = async () => {
    setMenuOpen(false);
    if (!currentArtifact) return;

    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'Please allow access to your photo library to save artifacts.',
      );
      return;
    }

    try {
      const isVideo = currentArtifact.media_type === 'video';
      const variant: Variant = isVideo ? 'original' : 'display';
      const url = await getArtifactUrl(
        currentArtifact.id,
        variant,
        currentArtifact.original_content_type as ContentType,
      );
      if (!url) throw new Error('No URL');

      const ext = currentArtifact.original_content_type.split('/')[1] ?? 'jpg';
      const localUri = `${FileSystem.cacheDirectory}artifact_${currentArtifact.id}.${ext}`;
      const { uri } = await FileSystem.downloadAsync(url, localUri);
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved', 'Artifact saved to your photo library.');
    } catch {
      Alert.alert('Error', 'Failed to save artifact.');
    }
  };

  const handleDelete = () => {
    setMenuOpen(false);
    if (!currentArtifact) return;

    Alert.alert('Delete Artifact', 'This will permanently remove this artifact. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase
            .from('artifacts')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', currentArtifact.id);
          router.back();
        },
      },
    ]);
  };

  // Fallback single-item view for deep links / store miss
  if (artifacts.length === 0) {
    return (
      <SingleArtifactFallback
        artifactId={artifactId}
        mediaType={mediaType}
        contentType={contentType}
        insets={insets}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      <FlatList
        data={artifacts}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        initialNumToRender={1}
        windowSize={3}
        renderItem={({ item, index }) => (
          <ArtifactItem artifact={item} width={width} isActive={index === activeIndex} />
        )}
      />

      {/* Counter pill — centered in nav row */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 0,
          right: 0,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <View
          style={{
            borderRadius: 22,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.28)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.4,
            shadowRadius: 10,
          }}
        >
          <BlurView
            intensity={40}
            tint="systemUltraThinMaterialDark"
            style={{
              paddingHorizontal: 16,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={[StyleSheet.absoluteFill, styles.navBtnOverlay]} />
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>
              {activeIndex + 1} of {artifacts.length}
            </Text>
          </BlurView>
        </View>
      </View>

      {/* Back button */}
      <View style={{ position: 'absolute', top: insets.top + 8, left: 16 }}>
        <NavButton onPress={() => router.back()}>
          <ArrowLeft size={20} color="#FFFFFF" />
        </NavButton>
      </View>

      {/* 3-dot menu button */}
      <View style={{ position: 'absolute', top: insets.top + 8, right: 16 }}>
        <NavButton onPress={() => setMenuOpen(true)}>
          <MoreVertical size={20} color="#FFFFFF" />
        </NavButton>
      </View>

      {/* Dropdown menu */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={() => setMenuOpen(false)}
        />
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
              {/* Download */}
              <Pressable onPress={handleDownload}>
                {({ pressed }) => (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      backgroundColor: pressed ? 'rgba(255,255,255,0.06)' : 'transparent',
                      borderBottomWidth: 1,
                      borderBottomColor: 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <Download size={20} color="#F5F5F5" />
                    <Text style={{ color: '#F5F5F5', fontSize: 16, marginLeft: 14 }}>Download</Text>
                  </View>
                )}
              </Pressable>

              {/* Delete */}
              <Pressable onPress={handleDelete}>
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
                    <Text style={{ color: '#EF4444', fontSize: 16, marginLeft: 14 }}>Delete</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </BlurView>
        </View>
      </Modal>

      {/* ── Details: date & location, then caption ── */}
      {currentArtifact &&
      (currentArtifact.caption || currentArtifact.dateLabel || currentArtifact.locationName) ? (
        <>
          {/* Darkens the bottom of the photo so white text reads on bright images. */}
          <LinearGradient
            colors={['transparent', captionExpanded ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.65)']}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: captionExpanded ? windowHeight * 0.75 : 260,
            }}
            pointerEvents="none"
          />
          <Animated.View
            pointerEvents="box-none"
            layout={detailsLayout}
            style={{
              position: 'absolute',
              left: 24,
              right: 24,
              bottom: insets.bottom + BAR_BOTTOM_OFFSET + BAR_HEIGHT + 14,
              gap: 6,
            }}
          >
            {!!(currentArtifact.dateLabel || currentArtifact.locationName) && (
              <View style={styles.metaRow} pointerEvents="none">
                {!!currentArtifact.dateLabel && (
                  <View style={styles.metaItem}>
                    <Calendar size={15} color="rgba(255,255,255,0.75)" />
                    <Text style={styles.metaText}>{currentArtifact.dateLabel}</Text>
                  </View>
                )}
                {!!currentArtifact.locationName && (
                  <View style={[styles.metaItem, { flexShrink: 1 }]}>
                    <MapPin size={15} color="rgba(255,255,255,0.75)" />
                    <Text style={[styles.metaText, { flexShrink: 1 }]} numberOfLines={1}>
                      {currentArtifact.locationName}
                    </Text>
                  </View>
                )}
              </View>
            )}
            {currentArtifact.caption ? (
              <ExpandableCaption
                text={currentArtifact.caption}
                expanded={captionExpanded}
                onToggle={() => setCaptionExpanded((v) => !v)}
                maxExpandedHeight={windowHeight * 0.45}
              />
            ) : null}
          </Animated.View>
        </>
      ) : null}

      {/* ── Bottom action bar ── */}
      <BottomActionBar insets={insets} />
    </View>
  );
}

const CAPTION_COLLAPSED_LINES = 4;
const detailsLayout = LinearTransition.duration(220);

/**
 * Caption clipped to a few lines; when it's actually cut off, tapping it shows
 * the whole thing (scrollable if very long) and tapping again collapses it.
 */
function ExpandableCaption({
  text,
  expanded,
  onToggle,
  maxExpandedHeight,
}: {
  text: string;
  expanded: boolean;
  onToggle: () => void;
  maxExpandedHeight: number;
}) {
  const [truncatable, setTruncatable] = useState(false);

  return (
    <View>
      {/* Invisible full-length copy, measured to tell whether the visible one is cut off. */}
      <Text
        style={[styles.caption, styles.captionMeasure]}
        onTextLayout={(e) => setTruncatable(e.nativeEvent.lines.length > CAPTION_COLLAPSED_LINES)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {text}
      </Text>

      {expanded ? (
        <ScrollView style={{ maxHeight: maxExpandedHeight }} showsVerticalScrollIndicator={false}>
          <Pressable
            onPress={onToggle}
            accessibilityRole="button"
            accessibilityHint="Collapses the caption"
          >
            <Text style={styles.caption}>{text}</Text>
          </Pressable>
        </ScrollView>
      ) : (
        // Short captions ignore touches so swipes over them still page the viewer.
        <Pressable
          onPress={onToggle}
          disabled={!truncatable}
          pointerEvents={truncatable ? 'auto' : 'none'}
          accessibilityRole={truncatable ? 'button' : undefined}
          accessibilityHint={truncatable ? 'Shows the full caption' : undefined}
        >
          <Text style={styles.caption} numberOfLines={CAPTION_COLLAPSED_LINES}>
            {text}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const BAR_HEIGHT = 60;
// Gap between the bar and the bottom safe area.
const BAR_BOTTOM_OFFSET = 4;

function BottomActionBar({ insets }: { insets: ReturnType<typeof useSafeAreaInsets> }) {
  return (
    <View
      style={{
        position: 'absolute',
        bottom: insets.bottom + BAR_BOTTOM_OFFSET,
        left: 0,
        right: 0,
        alignItems: 'center',
        pointerEvents: 'box-none',
      }}
    >
      {/* Bar — sizes to its content */}
      <View
        style={{
          height: BAR_HEIGHT,
          borderRadius: 30,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.28)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.4,
          shadowRadius: 10,
          elevation: 10,
        }}
      >
        {/* Frosted background */}
        <BlurView
          intensity={40}
          tint="systemUltraThinMaterialDark"
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.10)' }]} />

        {/* Row — drives the bar's width */}
        <View style={{ flexDirection: 'row', height: BAR_HEIGHT }}>
          {/* ── Favorite ── */}
          {/* TODO: connect to favorites table — toggle liked state per user+artifact */}
          <Pressable
            onPress={() => {
              /* TODO: toggle favorite */
            }}
            style={{
              paddingHorizontal: 20,
              height: BAR_HEIGHT,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Heart size={22} color="#737373" />
          </Pressable>

          {/* Divider */}
          <View
            style={{ width: 1, height: BAR_HEIGHT, backgroundColor: 'rgba(255,255,255,0.15)' }}
          />

          {/* ── Tagged people ── */}
          {/* TODO: fetch tagged users for this artifact and render real avatars */}
          {/* TODO: tapping opens a people-tagging sheet */}
          <Pressable
            onPress={() => {
              /* TODO: open tag people sheet */
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: 180,
              height: BAR_HEIGHT,
              paddingHorizontal: 16,
            }}
          >
            {/* Avatar stack */}
            <View style={{ flexDirection: 'row' }}>
              <View style={barStyles.avatar}>
                <Image
                  source={require('../../../assets/images/avatar1.jpg')}
                  style={{ width: '100%', height: '100%', borderRadius: 18 }}
                  contentFit="cover"
                />
              </View>
              <View style={[barStyles.avatar, barStyles.avatarOverlap]}>
                <Image
                  source={require('../../../assets/images/avatar2.jpg')}
                  style={{ width: '100%', height: '100%', borderRadius: 18 }}
                  contentFit="cover"
                />
              </View>
            </View>

            {/* Tag button */}
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: 'rgba(0,0,0,0.35)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TagPlus size={20} color="#737373" />
            </View>
          </Pressable>

          {/* Divider */}
          <View
            style={{ width: 1, height: BAR_HEIGHT, backgroundColor: 'rgba(255,255,255,0.15)' }}
          />

          {/* ── Info ── */}
          {/* TODO: open a bottom sheet with artifact metadata (date taken, location, size, dimensions) */}
          <Pressable
            onPress={() => {
              /* TODO: show artifact info sheet */
            }}
            style={{
              paddingHorizontal: 20,
              height: BAR_HEIGHT,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Info size={22} color="#737373" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#737373',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  avatarOverlap: {
    marginLeft: -9,
  },
});

const styles = StyleSheet.create({
  captionMeasure: { position: 'absolute', left: 0, right: 0, opacity: 0 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 15,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  caption: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 24,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  navBtnShadow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  navBtnClip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  navBtnOverlay: { backgroundColor: 'rgba(255,255,255,0.14)' },
});

function SingleArtifactFallback({
  artifactId,
  mediaType,
  contentType,
  insets,
}: {
  artifactId: string;
  mediaType: string;
  contentType: string;
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const isVideo = mediaType === 'video';

  useEffect(() => {
    const variant: Variant = isVideo ? 'original' : 'display';
    getArtifactUrl(artifactId, variant, contentType as ContentType).then(setUrl);
  }, [artifactId, isVideo, contentType]);

  return (
    <View className="flex-1 bg-black">
      {url === null ? (
        <ActivityIndicator color="#a1a1aa" className="flex-1" />
      ) : isVideo ? (
        <VideoArtifact url={url} />
      ) : (
        <Image source={{ uri: url }} style={{ flex: 1 }} contentFit="contain" />
      )}

      <View style={{ position: 'absolute', top: insets.top + 8, left: 16 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <View style={styles.navBtnShadow}>
            <View style={styles.navBtnClip}>
              <BlurView
                intensity={40}
                tint="systemUltraThinMaterialDark"
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={[StyleSheet.absoluteFill, styles.navBtnOverlay]} />
                <ArrowLeft size={20} color="#FFFFFF" />
              </BlurView>
            </View>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
