import { Link, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Shared layout for the sign-in and sign-up screens. */
export default function AuthForm({
  title,
  subtitle,
  submitLabel,
  submitting,
  onSubmit,
  footerText,
  footerLinkLabel,
  footerHref,
  children,
}: {
  title: string;
  subtitle: string;
  submitLabel: string;
  submitting: boolean;
  onSubmit: () => void;
  footerText: string;
  footerLinkLabel: string;
  footerHref: Href;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={{ gap: 12 }}>{children}</View>

          <Pressable onPress={onSubmit} disabled={submitting} style={{ marginTop: 24 }}>
            {({ pressed }) => (
              <View style={[styles.submit, pressed && { backgroundColor: '#2563EB' }]}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitText}>{submitLabel}</Text>
                )}
              </View>
            )}
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{footerText} </Text>
            <Link href={footerHref} replace>
              <Text style={styles.footerLink}>{footerLinkLabel}</Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function AuthInput(props: TextInputProps) {
  return (
    <TextInput placeholderTextColor="#525252" {...props} style={[styles.input, props.style]} />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  title: { color: '#F5F5F5', fontSize: 30, fontWeight: '700', marginBottom: 6 },
  subtitle: { color: '#737373', fontSize: 16, marginBottom: 32 },
  // Matches the create-album inputs.
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#F5F5F5',
    fontSize: 16,
  },
  submit: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#3B82F6',
  },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { color: '#737373', fontSize: 15 },
  footerLink: { color: '#60A5FA', fontSize: 15, fontWeight: '600' },
});
