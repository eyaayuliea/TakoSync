import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { staffLockStatus, staffPasswordResetPrompt } from '../services/staffAccountLock';
import { loadBranches, loadStaffAccounts, provisionExistingStaffAccounts, resetStaffPasswordToEmployeeId, saveStaffAccount, type StaffAccount } from '../services/takosync';
import { ownerColors } from './shared/ownerTokens';

const colors = {
  pink: ownerColors.primary,
  navy: ownerColors.navy,
  orange: ownerColors.orange,
  ink: '#171724',
  muted: '#858591',
  line: '#EEEEF1',
  white: '#FFFFFF',
  red: '#C92F3C',
} as const;

type Branch = { id: string; name: string };

export default function OwnerStaffAccounts({ onBack }: { onBack: () => void }) {
  const styles = useStyles();
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState<StaffAccount | null>(null);
  // OW-27 c10: the reset runs only after the owner confirms it.
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<StaffAccount | null>(null);
  const [username, setUsername] = useState('');
  const [branchId, setBranchId] = useState('');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [nextAccounts, nextBranches] = await Promise.all([loadStaffAccounts(), loadBranches()]);
      setAccounts(nextAccounts);
      setBranches(nextBranches.map((branch) => ({ id: branch.id, name: branch.name })));
      setBranchId((current) => current || nextBranches[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Staff accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const reset = () => {
    setSelected(null);
    setConfirmingReset(false);
    setUsername('');
    setBranchId(branches[0]?.id ?? '');
    setActive(true);
    setError('');
  };

  const edit = (account: StaffAccount) => {
    setSelected(account);
    setConfirmingReset(false);
    setUsername(account.full_name || account.username);
    setBranchId(account.branch_id);
    setActive(account.active);
    setError('');
    setFeedback('');
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const savedAccount = await saveStaffAccount({
        id: selected?.id,
        username,
        branchId,
        active,
      });
      setFeedback(selected ? 'Staff account updated.' : 'Staff account created.');
      if (!selected) setCreatedAccount(savedAccount);
      reset();
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save Staff account.');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!selected || saving) return;
    setConfirmingReset(false);
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      await resetStaffPasswordToEmployeeId(selected.id);
      setFeedback('Password reset to the Employee ID. The employee must change it at the next login.');
      setAccounts(await loadStaffAccounts());
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to reset the Staff password.');
    } finally {
      setSaving(false);
    }
  };

  const provisionExisting = () => {
    Alert.alert(
      'Set Staff initial passwords?',
      'This will set each existing Staff account password to its stored Employee ID. Auth users and UUIDs will not be recreated.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setProvisioning(true);
              setError('');
              setFeedback('');
              try {
                const nextAccounts = await provisionExistingStaffAccounts();
                setAccounts(nextAccounts);
                setFeedback('Existing Staff initial passwords were set to their Employee IDs.');
              } catch (provisionError) {
                setError(provisionError instanceof Error ? provisionError.message : 'Unable to provision existing Staff credentials.');
              } finally {
                setProvisioning(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to More" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View>
          <Text style={styles.title}>Staff accounts</Text>
          <Text style={styles.subtitle}>Create and maintain the two Staff accounts for each branch.</Text>
        </View>
      </View>

      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{selected ? 'Edit Staff account' : 'New Staff account'}</Text>
        <Text style={styles.label}>Employee name / username</Text>
        <TextInput value={username} onChangeText={setUsername} editable={!saving} autoCapitalize="words" autoCorrect={false} style={styles.input} placeholder="Employee name" />
        <Text style={styles.label}>Employee ID {selected ? '(read-only)' : '(generated automatically)'}</Text>
        {selected ? (
          <Text style={styles.readOnlyValue} selectable>{selected.employee_id}</Text>
        ) : (
          <Text style={styles.hint}>A unique Employee ID and matching initial password are generated by Supabase.</Text>
        )}
        <Text style={styles.label}>Assigned branch</Text>
        <View style={styles.branchList}>
          {branches.map((branch) => (
            <Pressable key={branch.id} accessibilityRole="button" accessibilityState={{ selected: branch.id === branchId }} onPress={() => setBranchId(branch.id)} style={[styles.branchButton, branch.id === branchId && styles.branchButtonSelected]}>
              <Text style={[styles.branchText, branch.id === branchId && styles.branchTextSelected]}>{branch.name}</Text>
            </Pressable>
          ))}
        </View>
        {selected ? (
          <View style={styles.activeRow}>
            <Text style={styles.label}>Account active</Text>
            <Switch value={active} onValueChange={setActive} disabled={saving} trackColor={{ false: colors.line, true: colors.pink }} />
          </View>
        ) : null}
        <View style={styles.actions}>
          {selected ? <Pressable onPress={reset} disabled={saving} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancel</Text></Pressable> : null}
          {selected?.active ? <Pressable onPress={() => setConfirmingReset(true)} disabled={saving} style={styles.secondaryButton}><Text style={styles.secondaryText}>Reset password</Text></Pressable> : null}
          <Pressable onPress={() => void save()} disabled={saving || loading} style={[styles.primaryButton, (saving || loading) && styles.disabled]}>
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>{selected ? 'Save changes' : 'Create account'}</Text>}
          </Pressable>
        </View>
      </View>

      {selected && confirmingReset ? (
        <View style={styles.generatedCard} accessibilityRole="alert">
          <Text style={styles.generatedTitle}>Reset password?</Text>
          <Text style={styles.generatedHint}>{staffPasswordResetPrompt(selected)}</Text>
          <View style={styles.actions}>
            <Pressable onPress={() => setConfirmingReset(false)} disabled={saving} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Confirm password reset" onPress={() => void resetPassword()} disabled={saving} style={styles.primaryButton}><Text style={styles.primaryText}>Reset password</Text></Pressable>
          </View>
        </View>
      ) : null}

      {createdAccount ? (
        <View style={styles.generatedCard}>
          <Text style={styles.generatedTitle}>New Staff credentials</Text>
          <Text style={styles.generatedLabel}>Employee ID / initial password</Text>
          <Text style={styles.generatedValue} selectable>{createdAccount.employee_id}</Text>
          <Text style={styles.generatedHint}>Long-press the value to copy it. Do not share it in logs or chat.</Text>
        </View>
      ) : null}

      <Pressable onPress={provisionExisting} disabled={provisioning || loading} style={[styles.provisionButton, (provisioning || loading) && styles.disabled]}>
        {provisioning ? <ActivityIndicator color={colors.navy} /> : <Text style={styles.provisionText}>Set existing Staff initial passwords</Text>}
      </Pressable>

      <Text style={styles.sectionTitle}>Existing Staff accounts</Text>
      {loading ? <ActivityIndicator color={colors.pink} /> : accounts.length === 0 ? <Text style={styles.empty}>No Staff accounts have been provisioned.</Text> : accounts.map((account) => (
        <Pressable key={account.id} onPress={() => edit(account)} style={styles.accountCard}>
          <View style={styles.accountCopy}>
            <Text style={styles.accountName}>{account.full_name || account.username}</Text>
            <Text style={styles.accountMeta}>{account.branch_name ?? 'Branch unavailable'} · {account.active ? 'Active' : 'Inactive'} · {staffLockStatus(account).label}</Text>
          </View>
          <Text style={styles.editText}>Edit</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function useStyles() {
  return StyleSheet.create({
    content: { padding: 18, paddingBottom: 28 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
    backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
    backText: { color: colors.navy, fontSize: 28 },
    title: { color: colors.navy, fontFamily: 'Poppins_700Bold', fontSize: 17 },
    subtitle: { color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 9, marginTop: 3 },
    panel: { padding: 15, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, marginBottom: 22 },
    panelTitle: { color: colors.navy, fontFamily: 'Poppins_600SemiBold', fontSize: 12, marginBottom: 12 },
    label: { color: colors.navy, fontFamily: 'Poppins_500Medium', fontSize: 9, marginTop: 9, marginBottom: 5 },
    input: { minHeight: 42, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: colors.line, color: colors.ink, fontFamily: 'Poppins_400Regular', fontSize: 10 },
    readOnlyValue: { minHeight: 42, padding: 12, borderRadius: 11, backgroundColor: '#F7F7F9', color: colors.ink, fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
    hint: { color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 9, lineHeight: 13 },
    generatedCard: { padding: 15, borderRadius: 16, backgroundColor: '#FFF4D6', borderWidth: 1, borderColor: colors.orange, marginBottom: 22 },
    generatedTitle: { color: colors.navy, fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
    generatedLabel: { color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 9, marginTop: 8 },
    generatedValue: { color: colors.navy, fontFamily: 'Poppins_700Bold', fontSize: 15, marginTop: 4 },
    generatedHint: { color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 8, lineHeight: 12, marginTop: 8 },
    provisionButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.orange, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
    provisionText: { color: colors.navy, fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
    branchList: { gap: 6 },
    branchButton: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.line },
    branchButtonSelected: { borderColor: colors.pink, backgroundColor: '#FFF0F4' },
    branchText: { color: colors.muted, fontFamily: 'Poppins_500Medium', fontSize: 9 },
    branchTextSelected: { color: colors.pink },
    activeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 15 },
    primaryButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 11, backgroundColor: colors.pink },
    primaryText: { color: colors.white, fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
    secondaryButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 11, borderWidth: 1, borderColor: colors.line },
    secondaryText: { color: colors.navy, fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
    disabled: { opacity: 0.6 },
    error: { color: colors.red, fontFamily: 'Poppins_500Medium', fontSize: 9, lineHeight: 15, marginBottom: 12 },
    feedback: { color: '#2F8C57', fontFamily: 'Poppins_500Medium', fontSize: 9, marginBottom: 12 },
    sectionTitle: { color: colors.navy, fontFamily: 'Poppins_600SemiBold', fontSize: 12, marginBottom: 9 },
    empty: { color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 10 },
    accountCard: { flexDirection: 'row', alignItems: 'center', padding: 13, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, marginBottom: 8 },
    accountCopy: { flex: 1 },
    accountName: { color: colors.ink, fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
    accountMeta: { color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 8, marginTop: 3 },
    editText: { color: colors.pink, fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
  });
}
