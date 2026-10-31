import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import AuthForm, { AuthInput } from '@/components/AuthForm';
import { useAuth } from '@/hooks/use-auth';

const MIN_PASSWORD_LENGTH = 6;

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your name, email and password.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert('Weak password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setLoading(true);
    try {
      const { needsConfirmation } = await signUp(email.trim(), password, name);
      // Without confirmation the user is signed in and the auth layout
      // redirects into the app on its own.
      if (needsConfirmation) {
        Alert.alert(
          'Check your email',
          'We sent you a link to confirm your account. Once confirmed, sign in here.',
          [{ text: 'OK', onPress: () => router.replace('/(auth)/sign-in') }],
        );
      }
    } catch (err) {
      Alert.alert('Sign up failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthForm
      title="Create account"
      subtitle="Start keeping your family's memories together"
      submitLabel="Create Account"
      submitting={loading}
      onSubmit={handleSignUp}
      footerText="Already have an account?"
      footerLinkLabel="Sign in"
      footerHref="/(auth)/sign-in"
    >
      <AuthInput
        placeholder="Your name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        maxLength={80}
        returnKeyType="next"
      />
      <AuthInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <AuthInput
        placeholder={`Password (min. ${MIN_PASSWORD_LENGTH} characters)`}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={handleSignUp}
      />
    </AuthForm>
  );
}
