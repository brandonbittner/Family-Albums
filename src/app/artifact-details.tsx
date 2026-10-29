import { Image } from 'expo-image';
import { router, useNavigation } from 'expo-router';
import { Check, SquarePlay, X } from 'lucide-react-native';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  LinearTransition,
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import GlassIconButton from '@/components/GlassIconButton';
import LocationField from '@/components/LocationField';
import PartialDateField from '@/components/PartialDateField';
import { finishDetailsSession, getDetailsSession } from '@/lib/artifact-details-session';
import type { ArtifactDetails, SelectedArtifact } from '@/lib/upload-artifacts';

const CARD_WIDTH_RATIO = 0.85;
const CARD_GAP = 14;
const NEIGHBOUR_SCALE = 0.92;
const CARD_PADDING = 14;
// Cards never get taller than this × their width, leaving room above and below
// so they read as floating; with the keyboard up they shrink to fit instead.
const CARD_MAX_ASPECT = 1.95;
const CAPTION_MAX_LENGTH = 500;
const FLY_UP_DURATION = 200;
const SLIDE_IN_DURATION = 320;
const SLIDE_IN_EASING = Easing.inOut(Easing.cubic);

// Timed rather than a spring, so the next card settles into the centre without overshooting.
const cardLayout = LinearTransition.duration(SLIDE_IN_DURATION).easing(SLIDE_IN_EASING);

const DetailsCard = memo(function DetailsCard({
  item,
  index,
  isActive,
  cardWidth,
  cardHeight,
  interval,
  scrollX,
  flyDistance,
  onChange,
  onSaved,
  onFocusCard,
}: {
  item: SelectedArtifact;
  index: number;
  isActive: boolean;
  cardWidth: number;
  cardHeight: number;
  interval: number;
  scrollX: SharedValue<number>;
  flyDistance: number;
  onChange: (key: string, patch: Partial<ArtifactDetails>) => void;
  onSaved: (key: string) => void;
  onFocusCard: (index: number) => void;
}) {
  const { details } = item;
  const flyY = useSharedValue(0);
  // When an earlier card is saved this card's index drops by one at once, but it
  // slides into place over SLIDE_IN_DURATION. Easing the index the same way keeps
  // its scale and opacity growing with the slide instead of jumping to full size.
  const position = useSharedValue(index);
  useEffect(() => {
    position.value = withTiming(index, { duration: SLIDE_IN_DURATION, easing: SLIDE_IN_EASING });
  }, [index, position]);
  const [saving, setSaving] = useState(false);

  // Neighbours sit slightly smaller and dimmer so the centred card reads as active.
  const neighbourShift = ((1 - NEIGHBOUR_SCALE) * cardWidth) / 2;
  const cardStyle = useAnimatedStyle(() => {
    const p = position.value;
    const input = [(p - 1) * interval, p * interval, (p + 1) * interval];
    return {
      opacity: interpolate(scrollX.value, input, [0.55, 1, 0.55], 'clamp'),
      transform: [
        { translateY: flyY.value },
        // Shrinking around the centre would pull a neighbour's inner edge away
        // from the active card — shift it back so the gap stays at CARD_GAP.
        {
          translateX: interpolate(
            scrollX.value,
            input,
            [-neighbourShift, 0, neighbourShift],
            'clamp',
          ),
        },
        {
          scale: interpolate(scrollX.value, input, [NEIGHBOUR_SCALE, 1, NEIGHBOUR_SCALE], 'clamp'),
        },
        { rotate: `${interpolate(flyY.value, [-flyDistance, 0], [-6, 0])}deg` },
      ],
    };
  });

  const handleSave = () => {
    if (saving) return;
    setSaving(true);
    Keyboard.dismiss();
    const key = item.key;
    flyY.value = withTiming(
      -flyDistance,
      { duration: FLY_UP_DURATION, easing: Easing.bezier(0.3, 0, 0.8, 0.4) },
      (finished) => {
        if (finished) scheduleOnRN(onSaved, key);
      },
    );
  };

  return (
    <Animated.View layout={cardLayout} style={{ width: cardWidth, height: cardHeight }}>
      <Animated.View style={[styles.cardShadow, cardStyle]}>
        <View style={styles.card}>
          <View style={styles.preview}>
            {item.previewUri ? (
              <Image
                source={{ uri: item.previewUri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={200}
              />
            ) : null}
            {item.asset.type === 'video' && (
              <View style={{ position: 'absolute', left: 10, bottom: 10 }}>
                <SquarePlay size={20} color="#FFFFFF" />
              </View>
            )}
          </View>

          <View style={styles.cardBody}>
            <TextInput
              value={details.caption}
              onChangeText={(caption) => onChange(item.key, { caption })}
              placeholder="Write a caption…"
              placeholderTextColor="#525252"
              multiline
              maxLength={CAPTION_MAX_LENGTH}
              editable={!saving}
              style={[styles.field, styles.fieldText, { minHeight: 104, maxHeight: 140 }]}
            />
            <PartialDateField
              value={details.date}
              onChange={(date) => onChange(item.key, { date })}
              metadataDate={item.metadataDate}
              disabled={saving}
              style={[styles.field, styles.row]}
            />
            <LocationField
              value={details.location}
              onChange={(location) => onChange(item.key, { location })}
              metadataCoords={item.metadataCoords}
              disabled={saving}
              style={[styles.field, styles.row]}
            />

            <Pressable
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
              style={{ marginTop: 4 }}
            >
              {({ pressed }) => (
                <View style={[styles.saveBtn, pressed && { backgroundColor: '#2563EB' }]}>
                  <Check size={18} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>Save</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Peeking cards aren't editable — tapping one brings it to the centre. */}
          {!isActive && (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => onFocusCard(index)}
              accessibilityRole="button"
              accessibilityLabel={`Go to artifact ${index + 1}`}
            />
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
});

export default function ArtifactDetailsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { width, height: windowHeight } = useWindowDimensions();

  const [session] = useState(() => getDetailsSession());
  // Cards still waiting to be saved. Saved cards leave this list.
  const [pending, setPending] = useState<SelectedArtifact[]>(() => session?.artifacts ?? []);
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

  const finish = useCallback((result: SelectedArtifact[] | null) => {
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
              <DetailsCard
                key={item.key}
                item={item}
                index={i}
                isActive={i === index}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
                interval={interval}
                scrollX={scrollX}
                flyDistance={windowHeight}
                onChange={handleChange}
                onSaved={handleSaved}
                onFocusCard={scrollToCard}
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
  // Shadow lives on the outer view — the inner card's overflow:hidden would clip it.
  cardShadow: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: '#1E1E1E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 16,
  },
  card: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  // Full-bleed across the top of the card; takes whatever height the fields
  // leave, so the card fits any screen and shrinks when the keyboard is up.
  preview: {
    flex: 1,
    minHeight: 80,
    backgroundColor: '#0F0F0F',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  cardBody: { padding: CARD_PADDING, gap: 10 },
  field: {
    backgroundColor: '#141414',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  fieldText: { color: '#F5F5F5', fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
  },
});
