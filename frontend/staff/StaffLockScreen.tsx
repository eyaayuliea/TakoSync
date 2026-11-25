import { greetingFirstName } from '../services/greetingName';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ownerColors, ownerRadii, ownerSpacing } from '../owner/shared/ownerTokens';

const font = {
  regular: 'Poppins_400Regular',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

type Props = {
  visible: boolean;
  staffName: string;
  /** Resolves when the password is correct; rejects with the message to show. */
  onUnlock: (password: string) => Promise<void>;
  onLogout: () => void | Promise<void>;
};

/**
 * ST-01 criterion 8: covers the whole Staff workspace (including its open
 * dialogs) after inactivity. The workspace stays mounted underneath, so the
 * correct password returns to the same screen and order without ending the
 * daily session.
 */
export default function StaffLockScreen({ visible, staffName, onUnlock, onLogout }: Props) {
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'unlock' | 'logout' | null>(null);

  useEffect(() => {
    if (!visible) {
      setPassword('');
      setPasswordVisible(false);
      setError('');
    }
  }, [visible]);

  const unlock = async () => {
    if (busy) return;
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    setBusy('unlock');
    setError('');
    try {
      await onUnlock(password);
    } catch (reason: unknown) {
      setPassword('');
      setError(reason instanceof Error ? reason.message : 'Unable to unlock. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const logout = async () => {
    if (busy) return;
    setBusy('logout');
    setError('');
    try {
      await onLogout();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to log out. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={() => undefined}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          <Text style={styles.eyebrow}>SCREEN LOCKED</Text>
          <Text style={styles.title}>Welcome back{greetingFirstName(staffName) ? `, ${greetingFirstName(staffName)}` : ''}</Text>
          <Text style={styles.copy}>
            The screen was locked after a period of inactivity. Enter your password to continue where you left off.
          </Text>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setError('');
              }}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              accessibilityLabel="Password, required"
              editable={busy === null}
              returnKeyType="done"
              onSubmitEditing={() => void unlock()}
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={ownerColors.secondaryText}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
              onPress={() => setPasswordVisible((current) => !current)}
              style={styles.toggle}
            >
              <Text style={styles.toggleText}>{passwordVisible ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Unlock"
            accessibilityState={{ disabled: busy !== null, busy: busy === 'unlock' }}
            onPress={() => void unlock()}
            disabled={busy !== null}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed, busy !== null && styles.disabled]}
          >
            {busy === 'unlock'
              ? <ActivityIndicator color={ownerColors.white} />
              : <Text style={styles.primaryText}>Unlock</Text>}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log out"
            accessibilityState={{ disabled: busy !== null, busy: busy === 'logout' }}
            onPress={() => void logout()}
            disabled={busy !== null}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed, busy !== null && styles.disabled]}
          >
            <Text style={styles.secondaryText}>{busy === 'logout' ? 'Logging out…' : 'Log out'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: ownerSpacing.page,
    backgroundColor: ownerColors.canvas,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    padding: 20,
    borderRadius: ownerRadii.card,
    backgroundColor: ownerColors.card,
    borderWidth: 1,
    borderColor: ownerColors.divider,
  },
  eyebrow: { color: ownerColors.primary, fontFamily: font.bold, fontSize: 11, letterSpacing: 1.2 },
  title: { color: ownerColors.navy, fontFamily: font.bold, fontSize: 22, marginTop: 10 },
  copy: { color: ownerColors.secondaryText, fontFamily: font.regular, fontSize: 13, lineHeight: 20, marginTop: 10 },
  label: { color: ownerColors.black, fontFamily: font.semibold, fontSize: 12, marginTop: 18, marginBottom: 6 },
  passwordRow: {
    minHeight: ownerSpacing.control,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: ownerRadii.control,
    borderWidth: 1,
    borderColor: ownerColors.divider,
    backgroundColor: ownerColors.white,
  },
  input: {
    flex: 1,
    minHeight: ownerSpacing.control,
    paddingHorizontal: 13,
    color: ownerColors.black,
    fontFamily: font.regular,
    fontSize: 14,
  },
  toggle: { minHeight: ownerSpacing.control, paddingHorizontal: 13, justifyContent: 'center' },
  toggleText: { color: ownerColors.primary, fontFamily: font.semibold, fontSize: 12 },
  error: { color: ownerColors.discrepancy, fontFamily: font.regular, fontSize: 12, lineHeight: 18, marginTop: 12 },
  primary: {
    minHeight: ownerSpacing.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    borderRadius: ownerRadii.control,
    backgroundColor: ownerColors.primary,
  },
  primaryText: { color: ownerColors.white, fontFamily: font.semibold, fontSize: 14 },
  secondary: {
    minHeight: ownerSpacing.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: ownerColors.divider,
    borderRadius: ownerRadii.control,
  },
  secondaryText: { color: ownerColors.navy, fontFamily: font.semibold, fontSize: 14 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.82 },
});
