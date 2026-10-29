import { BlurView } from 'expo-blur';
import { X } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { Easing, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ArtifactDetailsCard, {
  CARD_MAX_ASPECT,
  CARD_WIDTH_RATIO,
} from '@/components/ArtifactDetailsCard';
import GlassIconButton from '@/components/GlassIconButton';
import type { ArtifactDetails, DetailsItem } from '@/lib/artifact-details';

const NAV_ROW_HEIGHT = 60;
const cardEntering = SlideInDown.duration(320).easing(Easing.out(Easing.cubic));

/**
 * The upload details card, floated over whatever is on screen (the open
 * artifact) for editing one artifact. Save flies the card away and calls
 * `onSave`; if that throws, the card comes back with the user's edits intact.
 */
export default function EditArtifactOverlay({
  item,
  onClose,
  onSave,
}: {
  /** The artifact being edited; null hides the overlay. */
  item: DetailsItem | null;
  onClose: () => void;
  onSave: (details: ArtifactDetails) => Promise<void>;
}) {
  return (
    <Modal
      visible={item !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Remounted per artifact so edits never leak between opens. */}
      {item && <EditCard key={item.key} initial={item} onClose={onClose} onSave={onSave} />}
    </Modal>
  );
}

function EditCard({
  initial,
  onClose,
  onSave,
}: {
  initial: DetailsItem;
  onClose: () => void;
  onSave: (details: ArtifactDetails) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const [item, setItem] = useState(initial);
  const [availableHeight, setAvailableHeight] = useState(0);
  // Bumped to bring the card back after a failed save.
  const [attempt, setAttempt] = useState(0);
  const dirtyRef = useRef(false);

  const cardWidth = Math.round(width * CARD_WIDTH_RATIO);
  const cardHeight = Math.max(
    0,
    Math.min(availableHeight, Math.round(cardWidth * CARD_MAX_ASPECT)),
  );

  const handleChange = useCallback((_key: string, patch: Partial<ArtifactDetails>) => {
    dirtyRef.current = true;
    setItem((prev) => ({ ...prev, details: { ...prev.details, ...patch } }));
  }, []);

  const itemRef = useRef(item);
  itemRef.current = item;

  const handleSaved = useCallback(async () => {
    try {
      await onSave(itemRef.current.details);
      onClose();
    } catch {
      Alert.alert('Error', "Couldn't save your changes. Please try again.");
      setAttempt((n) => n + 1);
    }
  }, [onSave, onClose]);

  const handleCancel = () => {
    if (!dirtyRef.current) {
      onClose();
      return;
    }
    Alert.alert('Discard changes?', "Your edits to this artifact won't be saved.", [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* The open artifact stays visible behind, dimmed and blurred. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleCancel}
        accessibilityLabel="Cancel editing"
      >
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.dim]} />
      </Pressable>

      {/* ── Nav row, lined up with the viewer's ── */}
      <View style={[styles.navRow, { top: insets.top + 8 }]} pointerEvents="box-none">
        <GlassIconButton onPress={handleCancel} accessibilityLabel="Cancel editing">
          <X size={20} color="#FFFFFF" />
        </GlassIconButton>
        <Text style={styles.title} pointerEvents="none">
          Edit Details
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
      >
        <View
          style={{
            flex: 1,
            marginTop: insets.top + NAV_ROW_HEIGHT,
            marginBottom: insets.bottom + 16,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onLayout={(e) => setAvailableHeight(e.nativeEvent.layout.height)}
          pointerEvents="box-none"
        >
          {cardHeight > 0 && (
            <Animated.View key={attempt} entering={cardEntering}>
              <ArtifactDetailsCard
                item={item}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
                flyDistance={windowHeight}
                onChange={handleChange}
                onSaved={handleSaved}
              />
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  navRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  title: { color: 'rgba(255,255,255,0.85)', fontSize: 17, fontWeight: '600' },
});
