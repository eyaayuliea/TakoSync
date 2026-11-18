import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { changeStaffPassword } from '../services/takosync';
import { staffColors, staffRadius, staffSpacing, staffTypography } from './theme/staffTokens';

type Props = {
  employeeId: string | null;
  onChanged: () => void | Promise<void>;
  onLogout: () => void | Promise<void>;
};

export default function StaffChangePasswordScreen({ employeeId, onChanged, onLogout }: Props) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (password.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (password === employeeId) {
      setError('Choose a password different from your Employee ID.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await changeStaffPassword(password);
      setPassword('');
      setConfirmation('');
      await onChanged();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to change your password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>SECURITY REQUIRED</Text>
        <Text style={styles.title}>Change your password</Text>
        <Text style={styles.copy}>
          Your Employee ID was used only as your initial password. Set a new password before using POS, inventory, or other Staff tools.
        </Text>
        <Text style={styles.label}>New password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!saving}
          style={styles.input}
          accessibilityLabel="New password"
          placeholder="At least 8 characters"
        />
        <Text style={styles.label}>Confirm new password</Text>
        <TextInput
          value={confirmation}
          onChangeText={setConfirmation}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!saving}
          style={styles.input}
          accessibilityLabel="Confirm new password"
          placeholder="Re-enter your new password"
        />
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Save new password" accessibilityState={{ disabled: saving, busy: saving }} onPress={() => void submit()} disabled={saving} style={[styles.primary, saving && styles.disabled]}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save new password</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Log out" accessibilityState={{ disabled: saving }} onPress={() => void onLogout()} disabled={saving} style={styles.logout}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: staffSpacing.xxl, backgroundColor: staffColors.background },
  card: { width: '100%', maxWidth: 430, padding: staffSpacing.xxl, borderRadius: staffRadius.dialog, backgroundColor: staffColors.surface, borderWidth: 1, borderColor: staffColors.divider },
  eyebrow: { color: staffColors.primary, ...staffTypography.label, letterSpacing: 1.2 },
  title: { color: staffColors.navy, ...staffTypography.h2, marginTop: 10 },
  copy: { color: staffColors.secondaryText, ...staffTypography.detail, marginTop: 10 },
  label: { color: staffColors.navy, ...staffTypography.label, marginTop: 18, marginBottom: 6 },
  input: { minHeight: 48, paddingHorizontal: 13, borderRadius: staffRadius.control, borderWidth: 1, borderColor: staffColors.divider, color: staffColors.text, ...staffTypography.detail },
  error: { color: staffColors.discrepancy, ...staffTypography.detail, marginTop: 12 },
  primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 20, borderRadius: staffRadius.control, backgroundColor: staffColors.primary },
  disabled: { opacity: 0.6 },
  primaryText: { color: staffColors.white, ...staffTypography.label },
  logout: { alignItems: 'center', paddingVertical: 14 },
  logoutText: { color: staffColors.secondaryText, ...staffTypography.label },
});
