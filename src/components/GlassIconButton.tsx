import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

/** 44pt frosted-glass circle button used in floating nav bars. */
export default function GlassIconButton({
  onPress,
  disabled,
  style,
  accessibilityLabel,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      style={style}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {/* Shadow lives here — overflow:hidden would clip it */}
      <View style={[styles.shadow, disabled && { opacity: 0.5 }]}>
        <View style={styles.clip}>
          <BlurView intensity={40} tint="systemUltraThinMaterialDark" style={styles.blur}>
            <View style={[StyleSheet.absoluteFill, styles.overlay]} />
            {children}
          </BlurView>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  clip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  blur: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { backgroundColor: 'rgba(255,255,255,0.14)' },
});
