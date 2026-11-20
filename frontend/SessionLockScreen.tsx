import React, { useRef, useState } from 'react';
import { typography } from './theme/typography';
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
} from 'react-native';

const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export default function SessionLockScreen({
  branch,
  username: initialUsername,
  requiresUsername,
  onUnlock,
  onLogout,
}: {
  branch: string;
  username: string;
  requiresUsername: boolean;
  onUnlock: (username: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const submissionLock = useRef(false);
  const logoutLock = useRef(false);
  const passwordInput = useRef<TextInput>(null);

  const unlock = async () => {
    if (submissionLock.current || loggingOut) return;
    const trimmedUsername = username.trim();
    if (requiresUsername && !trimmedUsername) {
      setError('Enter your username to continue.');
      return;
    }
    if (!password) {
      setError('Enter your password to continue.');
      return;
    }

    submissionLock.current = true;
    setSubmitting(true);
    setError('');
    try {
      await onUnlock(trimmedUsername, password);
      setPassword('');
    } catch (unlockError) {
      setPassword('');
      setPasswordVisible(false);
      setError(unlockError instanceof Error ? unlockError.message : 'Unable to unlock your session. Please try again.');
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  };

  const logout = async () => {
    if (logoutLock.current || submitting) return;
    logoutLock.current = true;
    setLoggingOut(true);
    setError('');
    try {
      await onLogout();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : 'Unable to log out. Please try again.');
    } finally {
      logoutLock.current = false;
      setLoggingOut(false);
    }
  };

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.lockForm}>
            <Text style={styles.title}>Locked</Text>
            <Text style={styles.branch}>{branch}</Text>
            <Text style={styles.instruction}>Enter your password to continue</Text>

            {requiresUsername ? (
              <TextInput
                value={username}
                onChangeText={(value) => {
                  setUsername(value);
                  setError('');
                }}
                style={styles.input}
                placeholder="Username"
                placeholderTextColor="#737381"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Username"
                editable={!submitting && !loggingOut}
                returnKeyType="next"
                onSubmitEditing={() => passwordInput.current?.focus()}
              />
            ) : null}

            <View style={[styles.passwordWrap, error !== '' && styles.inputInvalid]}>
              <TextInput
                ref={passwordInput}
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setError('');
                }}
                style={styles.passwordInput}
                placeholder="Password"
                placeholderTextColor="#737381"
                secureTextEntry={!passwordVisible}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                accessibilityLabel="Password"
                editable={!submitting && !loggingOut}
                returnKeyType="done"
                onSubmitEditing={unlock}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
                accessibilityState={{ selected: passwordVisible }}
                onPress={() => setPasswordVisible((visible) => !visible)}
                disabled={submitting || loggingOut}
                hitSlop={8}
                style={styles.passwordVisibilityButton}
              >
                <View style={styles.passwordEye}>
                  <View style={styles.passwordEyePupil} />
                  {passwordVisible ? <View style={styles.passwordEyeSlash} /> : null}
                </View>
              </Pressable>
            </View>

            {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log in"
              disabled={submitting || loggingOut}
              onPress={() => void unlock()}
              style={({ pressed }) => [styles.unlockButton, pressed && styles.pressed, (submitting || loggingOut) && styles.disabled]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.unlockButtonText}>Log In</Text>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log out"
              disabled={submitting || loggingOut}
              onPress={() => void logout()}
              style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed, (submitting || loggingOut) && styles.disabled]}
            >
              {loggingOut ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.logoutText}>Log Out</Text>
              )}
            </Pressable>

            <Text style={styles.note}>
              Your session was locked after 15 minutes of inactivity. Sign in to continue.
              Your daily session and current order are preserved.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: '#0F1025',
  },
  keyboardRoot: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 38,
    paddingVertical: 36,
  },
  lockForm: { width: '100%', maxWidth: 360, alignSelf: 'center', alignItems: 'center' },
  title: { ...typography.h1, color: '#FFFFFF' },
  branch: { color: '#FCA639', fontFamily: font.semibold, fontSize: 14, marginTop: 1 },
  instruction: {
    color: '#B8B8C5', fontFamily: font.regular, fontSize: 12,
    textAlign: 'center', marginTop: 5, marginBottom: 24,
  },
  input: {
    width: '100%', height: 42, paddingHorizontal: 13, borderRadius: 9,
    backgroundColor: '#FFFFFF', color: '#171724', fontFamily: font.regular, fontSize: 13,
    marginBottom: 12,
  },
  passwordWrap: {
    width: '100%', height: 42, flexDirection: 'row', alignItems: 'center',
    paddingLeft: 13, paddingRight: 4, borderRadius: 9, backgroundColor: '#FFFFFF',
  },
  inputInvalid: { borderWidth: 1.5, borderColor: '#F52F2E' },
  passwordInput: {
    flex: 1, height: 40, padding: 0, color: '#171724',
    fontFamily: font.regular, fontSize: 13,
  },
  passwordVisibilityButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  passwordEye: {
    width: 19, height: 13, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.6, borderColor: '#656575', borderRadius: 10,
  },
  passwordEyePupil: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#656575' },
  passwordEyeSlash: {
    position: 'absolute', width: 22, height: 1.5, backgroundColor: '#656575',
    transform: [{ rotate: '-35deg' }],
  },
  error: {
    alignSelf: 'flex-start', color: '#FF6262', fontFamily: font.medium,
    fontSize: 11, lineHeight: 16, marginTop: 5,
  },
  unlockButton: {
    width: 180, maxWidth: '100%', minHeight: 48, alignItems: 'center', justifyContent: 'center',
    marginTop: 58, borderRadius: 24, backgroundColor: '#EC1358',
  },
  unlockButtonText: { color: '#FFFFFF', fontFamily: font.bold, fontSize: 16 },
  logoutButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  logoutText: { color: '#FFFFFF', fontFamily: font.bold, fontSize: 16 },
  note: {
    color: '#FFFFFF', fontFamily: font.regular, fontSize: 11, lineHeight: 17,
    marginTop: 58,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.7 },
});
