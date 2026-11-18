import React, { useRef, useState } from 'react';
import {
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { isSupabaseConfigured, supabaseConfigurationError } from '../services/supabase';
import { useTheme } from '../theme/ThemeProvider';

type FieldErrors = {
  username?: string;
  password?: string;
};

const FONT = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export default function OwnerLoginScreen({
  onLogin,
}: {
  onBack: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const { height, width } = useWindowDimensions();
  const { isDark } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loginError, setLoginError] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const passwordInput = useRef<TextInput>(null);
  const isShortScreen = height < 700;
  const logoWidth = Math.min(width * 0.44, 190);
  const displayedError = loginError || (!isSupabaseConfigured ? supabaseConfigurationError : '');

  const clearFeedback = () => {
    setFieldErrors({});
    setLoginError('');
  };

  const submitLogin = async () => {
    if (submissionLock.current) return;
    if (!isSupabaseConfigured) {
      setLoginError(supabaseConfigurationError ?? 'Supabase is not configured.');
      return;
    }

    const trimmedUsername = username.trim();
    const nextErrors: FieldErrors = {};
    if (!trimmedUsername) nextErrors.username = 'Please enter your username.';
    if (!password) nextErrors.password = 'Please enter your password.';

    setUsername(trimmedUsername);
    setFieldErrors(nextErrors);
    setLoginError('');
    if (Object.keys(nextErrors).length > 0) return;

    submissionLock.current = true;
    setSubmitting(true);
    try {
      await onLogin(trimmedUsername, password);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in. Please try again.';
      setLoginError(message);
      if (message === 'Incorrect password. Please try again.') {
        setPassword('');
      }
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/WELCOME PAGE.jpg')}
      resizeMode="cover"
      style={styles.background}
      imageStyle={styles.backgroundImage}
    >
      <View style={styles.backgroundOverlay}>
        <KeyboardAvoidingView
          style={styles.keyboardRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollContent, isShortScreen && styles.shortScrollContent]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.content, { maxWidth: Math.min(width - 40, 330) }]}>
              <View style={[styles.logoFrame, { width: logoWidth, height: logoWidth * 0.64 }]}>
                <Image
                  source={isDark ? require('../../assets/DARK THEME (LOGO).png') : require('../../assets/LIGHT THEME (LOGO).png')}
                  style={styles.logo}
                  resizeMode="contain"
                  accessibilityLabel="Gelo's Takoyaki logo"
                />
              </View>

              <View style={[styles.card, isShortScreen && styles.compactCard]}>
                <Text style={styles.heading}>Log In</Text>
                {displayedError !== '' && (
                  <View style={styles.errorBanner} accessibilityRole="alert">
                    <View style={styles.errorIcon}>
                      <Text style={styles.errorIconText}>!</Text>
                    </View>
                    <Text style={styles.errorMessage}>{displayedError}</Text>
                  </View>
                )}

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Username *</Text>
                  <TextInput
                    value={username}
                    onChangeText={(value) => {
                      setUsername(value);
                      clearFeedback();
                    }}
                    style={[styles.input, fieldErrors.username && styles.inputInvalid]}
                    placeholder="Enter your username"
                    placeholderTextColor="#858591"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    textContentType="username"
                    accessibilityLabel="Username, required"
                    editable={!submitting}
                    returnKeyType="next"
                    onSubmitEditing={() => passwordInput.current?.focus()}
                  />
                  {fieldErrors.username && <Text style={styles.fieldError}>{fieldErrors.username}</Text>}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Password *</Text>
                  <View style={[styles.passwordWrap, fieldErrors.password && styles.inputInvalid]}>
                    <TextInput
                      ref={passwordInput}
                      value={password}
                      onChangeText={(value) => {
                        setPassword(value);
                        clearFeedback();
                      }}
                      style={styles.passwordInput}
                      placeholder="Enter your password"
                      placeholderTextColor="#858591"
                      secureTextEntry={!passwordVisible}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="current-password"
                      textContentType="password"
                      accessibilityLabel="Password, required"
                      editable={!submitting}
                      returnKeyType="done"
                      onSubmitEditing={submitLogin}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
                      accessibilityState={{ selected: passwordVisible }}
                      onPress={() => setPasswordVisible((visible) => !visible)}
                      disabled={submitting}
                      hitSlop={10}
                      style={styles.visibilityButton}
                    >
                      <View style={styles.eye}>
                        <View style={styles.eyePupil} />
                        {passwordVisible && <View style={styles.eyeSlash} />}
                      </View>
                    </Pressable>
                  </View>
                  {fieldErrors.password && <Text style={styles.fieldError}>{fieldErrors.password}</Text>}
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Log In"
                  accessibilityState={{ disabled: submitting, busy: submitting }}
                  onPress={submitLogin}
                  disabled={submitting}
                  style={({ pressed }) => [
                    styles.loginButton,
                    pressed && !submitting && styles.loginButtonPressed,
                    submitting && styles.loginButtonDisabled,
                  ]}
                >
                  <Text style={styles.loginButtonText}>{submitting ? 'Logging in...' : 'Log In'}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: '#FFFFFF' },
  backgroundImage: { width: '100%', height: '100%', opacity: 0.88 },
  backgroundOverlay: { flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  keyboardRoot: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  shortScrollContent: { justifyContent: 'flex-start', paddingVertical: 14 },
  content: { width: '100%', alignItems: 'center', alignSelf: 'center' },
  logoFrame: { alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  logo: { width: '100%', height: '100%', alignSelf: 'center' },
  card: {
    width: '100%',
    borderRadius: 24,
    backgroundColor: '#0F1025',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    shadowColor: '#0F1025',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 10,
  },
  compactCard: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 16, borderRadius: 24 },
  heading: { color: '#FFFFFF', fontFamily: FONT.bold, fontSize: 24, textAlign: 'center', marginBottom: 20 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8DDE5',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 15,
  },
  errorIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F52F2E',
    marginRight: 9,
  },
  errorIconText: { color: '#FFFFFF', fontFamily: FONT.bold, fontSize: 14, lineHeight: 18 },
  errorMessage: { flex: 1, color: '#711433', fontFamily: FONT.regular, fontSize: 10, lineHeight: 16 },
  fieldGroup: { marginBottom: 13 },
  label: { color: '#FFFFFF', fontFamily: FONT.medium, fontSize: 12, marginBottom: 7 },
  input: {
    height: 46,
    width: '100%',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 13,
    backgroundColor: '#FFFFFF',
    color: '#000000',
    fontFamily: FONT.regular,
    fontSize: 13,
  },
  inputInvalid: { borderWidth: 1.5, borderColor: '#F52F2E' },
  fieldError: { color: '#FFFFFF', fontFamily: FONT.regular, fontSize: 11, marginTop: 5, lineHeight: 16 },
  passwordWrap: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 13,
    color: '#000000',
    fontFamily: FONT.regular,
    fontSize: 13,
  },
  visibilityButton: { height: '100%', width: 44, alignItems: 'center', justifyContent: 'center' },
  eye: {
    width: 18,
    height: 12,
    borderWidth: 1.5,
    borderColor: '#858591',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyePupil: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#858591' },
  eyeSlash: {
    position: 'absolute',
    width: 23,
    height: 1.5,
    backgroundColor: '#858591',
    transform: [{ rotate: '-45deg' }],
  },
  loginButton: {
    height: 48,
    width: '100%',
    borderRadius: 24,
    backgroundColor: '#EC1358',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  loginButtonPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  loginButtonDisabled: { opacity: 0.65 },
  loginButtonText: { color: '#FFFFFF', fontFamily: FONT.bold, fontSize: 13 },
});
