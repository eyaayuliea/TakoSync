import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { loadBranches, loadStaffAccounts, saveStaffAccount, type StaffAccount } from '../services/takosync';

const colors = {
  pink: '#F20D55',
  navy: '#101027',
  orange: '#FF9418',
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
  const [username, setUsername] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    setUsername('');
    setEmployeeId('');
    setBranchId(branches[0]?.id ?? '');
    setActive(true);
    setError('');
  };

  const edit = (account: StaffAccount) => {
    setSelected(account);
    setUsername(account.full_name || account.username);
    setEmployeeId('');
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
      await saveStaffAccount({
        id: selected?.id,
        username,
        employeeId: employeeId || undefined,
        branchId,
        active,
      });
      setFeedback(selected ? 'Staff account updated.' : 'Staff account created.');
      reset();
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save Staff account.');
    } finally {
      setSaving(false);
    }
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
        <Text style={styles.label}>Employee ID {selected ? '(optional password reset)' : '(initial password)'}</Text>
        <TextInput value={employeeId} onChangeText={setEmployeeId} editable={!saving} secureTextEntry style={styles.input} placeholder={selected ? 'Leave blank to keep current password' : 'Employee ID'} />
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
          <Pressable onPress={() => void save()} disabled={saving || loading} style={[styles.primaryButton, (saving || loading) && styles.disabled]}>
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>{selected ? 'Save changes' : 'Create account'}</Text>}
          </Pressable>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Existing Staff accounts</Text>
      {loading ? <ActivityIndicator color={colors.pink} /> : accounts.length === 0 ? <Text style={styles.empty}>No Staff accounts have been provisioned.</Text> : accounts.map((account) => (
        <Pressable key={account.id} onPress={() => edit(account)} style={styles.accountCard}>
          <View style={styles.accountCopy}>
            <Text style={styles.accountName}>{account.full_name || account.username}</Text>
            <Text style={styles.accountMeta}>{account.branch_name ?? 'Branch unavailable'} · {account.active ? 'Active' : 'Inactive'}</Text>
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
