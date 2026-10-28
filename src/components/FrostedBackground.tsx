import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';

/**
 * Frosted-glass fill for a surface: a dark blur behind an 80% opaque grey.
 * Place it first inside a container with `overflow: 'hidden'` and a transparent
 * background. Android can't blur without a BlurTargetView, so there it's just
 * the translucent fill.
 */
export default function FrostedBackground() {
  return (
    <>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.fill]} />
    </>
  );
}

/** Border shared by frosted surfaces. */
export const FROSTED_BORDER_COLOR = 'rgba(255,255,255,0.12)';

const styles = StyleSheet.create({
  fill: { backgroundColor: 'rgba(30,30,30,0.8)' },
});
