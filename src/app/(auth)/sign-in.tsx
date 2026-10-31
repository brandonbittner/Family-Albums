import { useState } from 'react';
import { Alert } from 'react-native';

import AuthForm, { AuthInput } from '@/components/AuthForm';
import { useAuth } from '@/hooks/use-auth';

// TODO: add Sign in with Apple and Google sign-in — only once the Apple Developer
//       membership is set up. Add both together (App Store rules expect Apple
//       alongside Google), using native flows (expo-apple-authentication,
//       @react-native-google-signin) + supabase.auth.signInWithIdToken. Needs a
//       development build instead of Expo Go, and handle_new_user should also read
//       the provider's name (Google: full_name; Apple: only sent on first sign-in).
export default function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      // On success the auth layout redirects into the app.
      await signIn(email.trim(), password);
    } catch (err) {
      Alert.alert('Sign in failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthForm
      title="Welcome back"
      subtitle="Sign in to your family albums"
      submitLabel="Sign In"
      submitting={loading}
      onSubmit={handleSignIn}
      footerText="Don't have an account?"
      footerLinkLabel="Sign up"
      footerHref="/(auth)/sign-up"
    >
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
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={handleSignIn}
      />
    </AuthForm>
  );
}
