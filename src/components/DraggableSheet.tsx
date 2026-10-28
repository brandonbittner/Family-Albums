import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  type PanGesture,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import FrostedBackground, { FROSTED_BORDER_COLOR } from '@/components/FrostedBackground';

// Dragging the sheet down past either threshold closes it.
const DISMISS_DISTANCE = 80;
const DISMISS_VELOCITY = 800;
const SLIDE_IN_DURATION = 300;
const SLIDE_OUT_DURATION = 240;

const DragAreaContext = createContext<(() => PanGesture) | null>(null);

function makeDismissPan(
  dragY: SharedValue<number>,
  sheetHeight: SharedValue<number>,
  onClose: () => void,
): PanGesture {
  return Gesture.Pan()
    .activeOffsetY(10)
    .onUpdate((e) => {
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        dragY.value = withTiming(sheetHeight.value, { duration: 180 }, (finished) => {
          if (finished) scheduleOnRN(onClose);
        });
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });
}

/**
 * Marks part of a `dragArea="handle"` sheet's content (e.g. its header) as
 * another place the sheet can be dragged down from.
 */
export function SheetDragArea({ children }: { children: ReactNode }) {
  const makePan = useContext(DragAreaContext);
  if (!makePan) return <>{children}</>;
  return (
    <GestureDetector gesture={makePan()}>
      <View>{children}</View>
    </GestureDetector>
  );
}

/**
 * Bottom sheet with a grab handle. Slides up on open and back down however it's
 * closed — dragged down, tapped outside, Android back, or the parent setting
 * `visible` to false.
 */
export default function DraggableSheet({
  visible,
  onClose,
  children,
  radius = 24,
  fullHeight = false,
  dragArea = 'sheet',
  translucent = false,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  radius?: number;
  /** Fill the screen below the status bar instead of sizing to content. */
  fullHeight?: boolean;
  /**
   * 'sheet': drag from anywhere. 'handle': only from the grab handle and any
   * `SheetDragArea` — use when the content scrolls.
   */
  dragArea?: 'sheet' | 'handle';
  /** Frosted-glass background: a blur behind an 80% opaque fill. */
  translucent?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const dragY = useSharedValue(windowHeight);
  const backdropOpacity = useSharedValue(0);
  const sheetHeight = useSharedValue(windowHeight);
  // The modal stays mounted after `visible` turns false until the sheet has
  // slid off screen.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      dragY.value = windowHeight;
      dragY.value = withTiming(0, {
        duration: SLIDE_IN_DURATION,
        easing: Easing.out(Easing.cubic),
      });
      backdropOpacity.value = withTiming(1, { duration: SLIDE_IN_DURATION });
    } else {
      backdropOpacity.value = withTiming(0, { duration: SLIDE_OUT_DURATION });
      dragY.value = withTiming(
        sheetHeight.value,
        { duration: SLIDE_OUT_DURATION, easing: Easing.in(Easing.cubic) },
        (finished) => {
          // Not finished means it was reopened mid-slide — stay mounted.
          if (finished) scheduleOnRN(setMounted, false);
        },
      );
    }
  }, [visible, windowHeight, dragY, backdropOpacity, sheetHeight]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const makePan = () => makeDismissPan(dragY, sheetHeight, onClose);

  const handle = <View style={styles.handle} />;

  const sheet = (
    <Animated.View
      onLayout={(e) => {
        sheetHeight.value = e.nativeEvent.layout.height;
      }}
      style={[
        styles.sheet,
        { borderTopLeftRadius: radius, borderTopRightRadius: radius },
        fullHeight ? { top: insets.top + 8 } : { paddingBottom: insets.bottom + 16 },
        translucent && { backgroundColor: 'transparent' },
        sheetStyle,
      ]}
    >
      {translucent && <FrostedBackground />}
      {dragArea === 'handle' ? (
        <GestureDetector gesture={makePan()}>
          <View style={styles.handleArea}>{handle}</View>
        </GestureDetector>
      ) : (
        <View style={styles.handleArea}>{handle}</View>
      )}
      <DragAreaContext.Provider value={dragArea === 'handle' ? makePan : null}>
        {children}
      </DragAreaContext.Provider>
    </Animated.View>
  );

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Modals render outside the app's gesture root, so they need their own. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        {dragArea === 'sheet' ? (
          <GestureDetector gesture={makePan()}>{sheet}</GestureDetector>
        ) : (
          sheet
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: FROSTED_BORDER_COLOR,
  },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
});
