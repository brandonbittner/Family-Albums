import { router, useNavigation } from 'expo-router';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ArtifactDetailsCard, {
  CARD_GAP,
  CARD_MAX_ASPECT,
  CARD_WIDTH_RATIO,
} from '@/components/ArtifactDetailsCard';
import GlassIconButton from '@/components/GlassIconButton';
import { finishDetailsSession, getDetailsSession } from '@/lib/artifact-details-session';
import type { ArtifactDetails, DetailsItem } from '@/lib/artifact-details';

export default function ArtifactDetailsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { width, height: windowHeight } = useWindowDimensions();

  const [session] = useState(() => getDetailsSession());
  // Cards still waiting to be saved. Saved cards leave this list.
  const [pending, setPending] = useState<DetailsItem[]>(() => session?.artifacts ?? []);
  const [index, setIndex] = useState(0);
  const [carouselHeight, setCarouselHeight] = useState(0);
  const savedRef = useRef(new Map<string, ArtifactDetails>());
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const indexRef = useRef(index);
  indexRef.current = index;
  const finishedRef = useRef(false);
  const dirtyRef = useRef(false);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);

  const cardWidth = Math.round(width * CARD_WIDTH_RATIO);
  const sideInset = (width - cardWidth) / 2;
  const interval = cardWidth + CARD_GAP;
  const carouselPaddingTop = 8;
  const carouselPaddingBottom = insets.bottom + 16;
  const cardHeight = Math.max(
    0,
    Math.min(
      carouselHeight - carouselPaddingTop - carouselPaddingBottom,
      Math.round(cardWidth * CARD_MAX_ASPECT),
    ),
  );
  const total = session?.artifacts.length ?? 0;

  const finish = useCallback((result: DetailsItem[] | null) => {
    finishedRef.current = true;
    finishDetailsSession(result);
    router.back();
  }, []);

  // Every artifact is uploaded; only saved cards carry the user's details, the
  // rest keep their EXIF defaults.
  const finishWithSaved = useCallback(() => {
    const artifacts = session?.artifacts ?? [];
    finish(
      artifacts.map((a) => {
        const details = savedRef.current.get(a.key);
        return details ? { ...a, details } : a;
      }),
    );
  }, [session, finish]);

  // Leaving any other way (Android back, a stale session) counts as cancelling.
  useEffect(() => {
    if (!session || session.artifacts.length === 0) {
      finish(null);
      return;
    }
    return navigation.addListener('beforeRemove', () => {
      if (!finishedRef.current) finishDetailsSession(null);
    });
  }, [navigation, session, finish]);

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const scrollToCard = useCallback(
    (i: number) => {
      scrollRef.current?.scrollTo({ x: i * interval, animated: true });
      setIndex(i);
    },
    [scrollRef, interval],
  );

  const handleChange = useCallback((key: string, patch: Partial<ArtifactDetails>) => {
    dirtyRef.current = true;
    setPending((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, details: { ...item.details, ...patch } } : item,
      ),
    );
  }, []);

  const handleSaved = useCallback(
    (key: string) => {
      const items = pendingRef.current;
      const removedAt = items.findIndex((item) => item.key === key);
      if (removedAt === -1) return;
      dirtyRef.current = true;
      savedRef.current.set(key, items[removedAt].details);

      const remaining = items.filter((item) => item.key !== key);
      if (remaining.length === 0) {
        finishWithSaved();
        return;
      }
      // The next card slides into the gap; if this was the last card, the
      // previous one slides in from the left instead.
      if (removedAt >= remaining.length) scrollToCard(remaining.length - 1);
      setPending(remaining);
    },
    [finishWithSaved, scrollToCard],
  );

  const handleCancel = () => {
    if (!dirtyRef.current) {
      finish(null);
      return;
    }
    Alert.alert(
      'Discard upload?',
      'The selected artifacts and any details you added will be lost.',
      [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => finish(null) },
      ],
    );
  };

  if (!session) return null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <GlassIconButton onPress={handleCancel} accessibilityLabel="Cancel upload">
          <X size={20} color="#FFFFFF" />
        </GlassIconButton>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 17, fontWeight: '600' }}>
            Add Details
          </Text>
          {total > 1 && (
            <Text style={{ color: '#737373', fontSize: 13, marginTop: 2 }}>
              {total - pending.length} of {total} saved
            </Text>
          )}
        </View>
        <Pressable
          onPress={finishWithSaved}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityHint="Uploads everything without filling in the remaining cards"
          style={{ width: 44, alignItems: 'flex-end' }}
        >
          <Text style={{ color: '#A3A3A3', fontSize: 16, fontWeight: '500' }}>Skip</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Card carousel ── */}
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={interval}
          decelerationRate="fast"
          disableIntervalMomentum
          keyboardShouldPersistTaps="handled"
          onScroll={scrollHandler}
          onLayout={(e) => setCarouselHeight(e.nativeEvent.layout.height)}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / interval);
            setIndex(Math.min(Math.max(i, 0), pendingRef.current.length - 1));
          }}
          // Cards fly up past the header, so don't clip them to the carousel.
          style={{ flex: 1, overflow: 'visible' }}
          contentContainerStyle={{
            paddingHorizontal: sideInset,
            paddingTop: carouselPaddingTop,
            paddingBottom: carouselPaddingBottom,
            gap: CARD_GAP,
            alignItems: 'center',
          }}
        >
          {cardHeight > 0 &&
            pending.map((item, i) => (
              <ArtifactDetailsCard
                key={item.key}
                item={item}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
                flyDistance={windowHeight}
                onChange={handleChange}
                onSaved={handleSaved}
                carousel={{
                  index: i,
                  isActive: i === index,
                  interval,
                  scrollX,
                  onFocusCard: scrollToCard,
                }}
              />
            ))}
        </Animated.ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    zIndex: 1,
  },
});
