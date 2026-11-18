import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { changeStaffPassword } from '../services/takosync';

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
          placeholder="Re-enter your new password"
        />
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        <Pressable onPress={() => void submit()} disabled={saving} style={[styles.primary, saving && styles.disabled]}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save new password</Text>}
        </Pressable>
        <Pressable onPress={() => void onLogout()} disabled={saving} style={styles.logout}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F6F6F8' },
  card: { width: '100%', maxWidth: 430, padding: 24, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7E7EC' },
  eyebrow: { color: '#F20D55', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#101026', fontSize: 25, fontWeight: '800', marginTop: 10 },
  copy: { color: '#777783', fontSize: 12, lineHeight: 19, marginTop: 10 },
  label: { color: '#303044', fontSize: 11, fontWeight: '700', marginTop: 18, marginBottom: 6 },
  input: { minHeight: 48, paddingHorizontal: 13, borderRadius: 10, borderWidth: 1, borderColor: '#DCDCE3', color: '#171724', fontSize: 13 },
  error: { color: '#B9244C', fontSize: 11, lineHeight: 16, marginTop: 12 },
  primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 20, borderRadius: 10, backgroundColor: '#F20D55' },
  disabled: { opacity: 0.6 },
  primaryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  logout: { alignItems: 'center', paddingVertical: 14 },
  logoutText: { color: '#777783', fontSize: 11, fontWeight: '700' },
});
