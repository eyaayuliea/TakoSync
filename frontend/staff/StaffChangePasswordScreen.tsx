import React, { useRef, useState } from 'react';
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
import { changeStaffPassword, verifyCurrentStaffPassword } from '../services/takosync';
import { StaffLoginError } from '../services/staffAuthentication';
import {
  CURRENT_PASSWORD_INCORRECT_MESSAGE,
  validateStaffPasswordChange,
} from '../services/staffPasswordChange';
import { ownerColors, ownerRadii, ownerSpacing } from '../owner/shared/ownerTokens';

const font = {
  regular: 'Poppins_400Regular',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

type Props = {
  employeeId: string | null;
  /** ST-15 c3, c5: ask for the current password (not for a forced first change). */
  requireCurrentPassword?: boolean;
  onChanged: () => void | Promise<void>;
  onCancel: () => void;
  onLogout: () => void | Promise<void>;
};

export default function StaffChangePasswordScreen({
  employeeId,
  requireCurrentPassword = true,
  onChanged,
  onCancel,
  onLogout,
}: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const newPasswordInput = useRef<TextInput>(null);
  const confirmationInput = useRef<TextInput>(null);

  const submit = async () => {
    if (saving || loggingOut) return;
    const problem = validateStaffPasswordChange({
      currentPassword,
      newPassword: password,
      confirmation,
      employeeId,
      requireCurrentPassword,
    });
    if (problem) {
      setError(problem.message);
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (requireCurrentPassword) {
        try {
          await verifyCurrentStaffPassword(currentPassword);
        } catch (reason: unknown) {
          if (reason instanceof StaffLoginError && reason.code === 'incorrect_password') {
            setCurrentPassword('');
            throw new Error(CURRENT_PASSWORD_INCORRECT_MESSAGE);
          }
          throw reason;
        }
      }
      try {
        await changeStaffPassword(password, requireCurrentPassword ? currentPassword : undefined);
      } catch (reason: unknown) {
        if (reason instanceof StaffLoginError && reason.code === 'incorrect_password') {
          setCurrentPassword('');
          throw new Error(CURRENT_PASSWORD_INCORRECT_MESSAGE);
        }
        throw reason;
      }
      setCurrentPassword('');
      setPassword('');
      setConfirmation('');
      await onChanged();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to change your password.');
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    if (saving || loggingOut) return;
    setLoggingOut(true);
    setError('');
    try {
      await onLogout();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to log out. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.card}>
            <Text style={styles.eyebrow}>ACCOUNT SECURITY</Text>
            <Text style={styles.title}>Change your password</Text>
            <Text style={styles.copy}>
              {requireCurrentPassword
                ? 'Enter your current password, then choose a new one with at least 8 characters.'
                : 'Your Employee ID is your initial password. Choose a new password with at least 8 characters.'}
            </Text>
            {requireCurrentPassword ? (
              <>
                <Text style={styles.label}>Current password</Text>
                <TextInput
                  value={currentPassword}
                  onChangeText={(value) => {
                    setCurrentPassword(value);
                    setError('');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  textContentType="password"
                  accessibilityLabel="Current password, required"
                  editable={!saving && !loggingOut}
                  returnKeyType="next"
                  onSubmitEditing={() => newPasswordInput.current?.focus()}
                  style={styles.input}
                  placeholder="Your current password"
                  placeholderTextColor={ownerColors.secondaryText}
                />
              </>
            ) : null}
            <Text style={styles.label}>New password</Text>
            <TextInput
              ref={newPasswordInput}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setError('');
              }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              accessibilityLabel="New password, required"
              editable={!saving && !loggingOut}
              returnKeyType="next"
              onSubmitEditing={() => confirmationInput.current?.focus()}
              style={styles.input}
              placeholder="At least 8 characters"
              placeholderTextColor={ownerColors.secondaryText}
            />
            <Text style={styles.label}>Confirm new password</Text>
            <TextInput
              ref={confirmationInput}
              value={confirmation}
              onChangeText={(value) => {
                setConfirmation(value);
                setError('');
              }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              accessibilityLabel="Confirm new password, required"
              editable={!saving && !loggingOut}
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
              style={styles.input}
              placeholder="Re-enter your new password"
              placeholderTextColor={ownerColors.secondaryText}
            />
            {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save new password"
              accessibilityState={{ disabled: saving || loggingOut, busy: saving }}
              onPress={() => void submit()}
              disabled={saving || loggingOut}
              style={({ pressed }) => [
                styles.primary,
                pressed && !saving && !loggingOut && styles.pressed,
                (saving || loggingOut) && styles.disabled,
              ]}
            >
              {saving
                ? <ActivityIndicator color={ownerColors.white} />
                : <Text style={styles.primaryText}>Save new password</Text>}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Return to Staff workspace"
              accessibilityState={{ disabled: saving || loggingOut }}
              onPress={onCancel}
              disabled={saving || loggingOut}
              style={({ pressed }) => [
                styles.secondary,
                pressed && !saving && !loggingOut && styles.pressed,
                (saving || loggingOut) && styles.disabled,
              ]}
            >
              <Text style={styles.logoutText}>Return to Staff workspace</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log out"
              accessibilityState={{ disabled: saving || loggingOut, busy: loggingOut }}
              onPress={() => void logout()}
              disabled={saving || loggingOut}
              style={({ pressed }) => [
                styles.logout,
                pressed && !saving && !loggingOut && styles.pressed,
                (saving || loggingOut) && styles.disabled,
              ]}
            >
              <Text style={styles.logoutText}>{loggingOut ? 'Logging out…' : 'Log out'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ownerColors.canvas },
  keyboardRoot: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: ownerSpacing.page,
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
  title: { color: ownerColors.navy, fontFamily: font.bold, fontSize: 24, marginTop: 10 },
  copy: { color: ownerColors.secondaryText, fontFamily: font.regular, fontSize: 13, lineHeight: 20, marginTop: 10 },
  label: { color: ownerColors.black, fontFamily: font.semibold, fontSize: 12, marginTop: 18, marginBottom: 6 },
  input: {
    minHeight: ownerSpacing.control,
    paddingHorizontal: 13,
    borderRadius: ownerRadii.control,
    borderWidth: 1,
    borderColor: ownerColors.divider,
    backgroundColor: ownerColors.white,
    color: ownerColors.black,
    fontFamily: font.regular,
    fontSize: 14,
  },
  error: { color: ownerColors.discrepancy, fontFamily: font.regular, fontSize: 12, lineHeight: 18, marginTop: 12 },
  primary: {
    minHeight: ownerSpacing.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    borderRadius: ownerRadii.control,
    backgroundColor: ownerColors.primary,
  },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.82 },
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
  logout: {
    minHeight: ownerSpacing.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: ownerColors.divider,
    borderRadius: ownerRadii.control,
  },
  logoutText: { color: ownerColors.navy, fontFamily: font.semibold, fontSize: 14 },
});
