import { Image } from 'expo-image';
import { Check, SquarePlay } from 'lucide-react-native';
import { memo, useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  LinearTransition,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import LocationField from '@/components/LocationField';
import PartialDateField from '@/components/PartialDateField';
import type { ArtifactDetails, DetailsItem } from '@/lib/artifact-details';

export const CARD_WIDTH_RATIO = 0.85;
// Cards never get taller than this × their width, leaving room above and below
// so they read as floating; with the keyboard up they shrink to fit instead.
export const CARD_MAX_ASPECT = 1.95;
export const CARD_GAP = 14;
const NEIGHBOUR_SCALE = 0.92;
const CARD_PADDING = 14;
const CAPTION_MAX_LENGTH = 500;
const FLY_UP_DURATION = 200;
const SLIDE_IN_DURATION = 320;
const SLIDE_IN_EASING = Easing.inOut(Easing.cubic);

// Timed rather than a spring, so the next card settles into the centre without overshooting.
const cardLayout = LinearTransition.duration(SLIDE_IN_DURATION).easing(SLIDE_IN_EASING);

/** Where a card sits in a swipeable row of cards, for the peek/scale effect. */
export type CardCarouselProps = {
  index: number;
  isActive: boolean;
  /** Card width plus the gap between cards. */
  interval: number;
  scrollX: SharedValue<number>;
  onFocusCard: (index: number) => void;
};

/**
 * One artifact's details card — preview, caption, date, location and Save.
 * Saving flies the card up off screen, then calls `onSaved`. Used in the
 * upload carousel (pass `carousel`) and on its own when editing.
 */
const ArtifactDetailsCard = memo(function ArtifactDetailsCard({
  item,
  cardWidth,
  cardHeight,
  flyDistance,
  onChange,
  onSaved,
  carousel,
}: {
  item: DetailsItem;
  cardWidth: number;
  cardHeight: number;
  flyDistance: number;
  onChange: (key: string, patch: Partial<ArtifactDetails>) => void;
  onSaved: (key: string) => void;
  carousel?: CardCarouselProps;
}) {
  const { details } = item;
  const index = carousel?.index ?? 0;
  const isActive = carousel?.isActive ?? true;
  const interval = carousel?.interval ?? cardWidth;
  const standaloneScrollX = useSharedValue(0);
  const scrollX = carousel?.scrollX ?? standaloneScrollX;
  const flyY = useSharedValue(0);
  // When an earlier card is saved this card's index drops by one at once, but it
  // slides into place over SLIDE_IN_DURATION. Easing the index the same way keeps
  // its scale and opacity growing with the slide instead of jumping to full size.
  const position = useSharedValue(index);
  useEffect(() => {
    position.value = withTiming(index, { duration: SLIDE_IN_DURATION, easing: SLIDE_IN_EASING });
  }, [index, position]);
  const [saving, setSaving] = useState(false);

  // In a carousel, neighbours sit slightly smaller and dimmer so the centred card reads as active.
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
            {item.isVideo && (
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
              onPress={() => carousel?.onFocusCard(index)}
              accessibilityRole="button"
              accessibilityLabel={`Go to artifact ${index + 1}`}
            />
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
});

export default ArtifactDetailsCard;

const styles = StyleSheet.create({
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
