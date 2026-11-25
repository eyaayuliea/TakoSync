// S3 / US-AUDIT-02: owner screen to verify the SHA-256 audit chains.
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { OWNER_NAVIGATION_HEIGHT } from '../navigation/BottomNavigation';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import { OwnerButton, OwnerErrorState, OwnerHeader, OwnerLoadingState } from './shared/ownerComponents';
import {
  loadBranches,
  verifyAuditChains,
  type AuditVerificationResult,
} from '../services/takosync';

const font = { regular: 'Poppins_400Regular', semibold: 'Poppins_600SemiBold', bold: 'Poppins_700Bold' } as const;

const REASON_LABELS: Record<string, string> = {
  SEQUENCE_GAP: 'An event is missing (sequence gap)',
  PREVIOUS_HASH_MISMATCH: 'An event is not linked to the one before it',
  EVENT_HASH_MISMATCH: 'An event was changed after it was recorded',
  HEAD_MISMATCH: 'The newest events do not match the chain head',
};

function dateTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
    : value;
}

export default function AuditIntegrityScreen({ onBack }: { onBack: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [branchNames, setBranchNames] = useState<Map<string, string>>(new Map());
  const [result, setResult] = useState<AuditVerificationResult | null>(null);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);

  const chainName = (scope: string) => (scope === 'global' ? 'Accounts & settings' : branchNames.get(scope) ?? 'Branch');

  const verify = () => {
    const current = ++generation.current;
    setVerifying(true);
    setError('');
    Promise.all([verifyAuditChains(false), loadBranches()])
      .then(([verification, branches]) => {
        if (current !== generation.current) return;
        setBranchNames(new Map(branches.map((branch) => [branch.id, branch.name])));
        setResult(verification);
      })
      .catch((reason: unknown) => {
        if (current !== generation.current) return;
        console.error('Unable to verify the audit log.', reason);
        setError('Unable to verify the audit log. Please check your internet connection and try again.');
      })
      .finally(() => {
        if (current === generation.current) setVerifying(false);
      });
  };

  useEffect(() => {
    verify();
    return () => {
      generation.current += 1;
    };
  }, []);

  const renderBody = () => {
    if (verifying && !result) return <OwnerLoadingState label="Checking the audit log…" />;
    if (error) return <OwnerErrorState message={error} onRetry={() => verify()} />;
    if (!result) return null;
    if (!result.supported) {
      return (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Audit verification is not available yet. The database needs the latest update.</Text>
        </View>
      );
    }
    const valid = result.status === 'VALID';
    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, valid ? styles.validCard : styles.invalidCard]} accessibilityRole="summary">
          <Text style={[styles.title, { color: valid ? colors.success : colors.error }]}>
            {valid ? 'Audit log intact' : 'Audit log was changed'}
          </Text>
          <Text style={styles.meta}>
            {result.verifiedEventCount} events checked · {dateTime(result.verifiedAt)}
          </Text>
          <Text style={styles.meta}>
            Every event is linked to the one before it with a SHA-256 hash. Changing, removing or reordering an old event breaks the link.
          </Text>
        </View>

        {result.chains.map((chain) => (
          <View key={chain.chainScope} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{chainName(chain.chainScope)}</Text>
              <Text style={[styles.tag, chain.status === 'VALID' ? styles.validTag : styles.invalidTag]}>
                {chain.status === 'VALID' ? 'Intact' : 'Changed'}
              </Text>
            </View>
            <Text style={styles.meta}>
              {chain.verifiedEventCount} events{chain.fromSequence > 0 ? ` after checkpoint #${chain.fromSequence}` : ''} · {chain.executionTimeMs} ms
            </Text>
            {chain.status === 'INVALID' ? (
              <Text style={[styles.meta, { color: colors.error }]}>
                {REASON_LABELS[chain.reason ?? ''] ?? 'The chain does not verify'} at event #{chain.firstInvalidSequence}.
              </Text>
            ) : null}
            <Text selectable style={styles.hash}>Latest hash {chain.finalHash}</Text>
          </View>
        ))}

        <View style={styles.actions}>
          <OwnerButton label={verifying ? 'Checking…' : 'Check again'} disabled={verifying} icon="sync" onPress={() => verify()} />
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.screen}>
      <OwnerHeader title="Audit integrity" onBack={onBack} />
      {renderBody()}
    </View>
  );
}

function useStyles() {
  const theme = useTheme();
  return StyleSheet.create(createThemedStyles({
    screen: { flex: 1, minHeight: 520 },
    flex: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: OWNER_NAVIGATION_HEIGHT, gap: 8 },
    card: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile, gap: 6 },
    validCard: { borderWidth: 1, borderColor: theme.colors.success },
    invalidCard: { borderWidth: 1, borderColor: theme.colors.error },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    title: { fontFamily: font.bold, fontSize: 14 },
    cardTitle: { flex: 1, color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 },
    tag: { fontFamily: font.semibold, fontSize: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
    validTag: { color: theme.colors.success, backgroundColor: theme.colors.surfaceSecondary },
    invalidTag: { color: theme.colors.error, backgroundColor: theme.colors.surfaceSecondary },
    meta: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 9, lineHeight: 13 },
    hash: { color: theme.colors.salesRecordNavy, fontFamily: font.regular, fontSize: 8, lineHeight: 12 },
    actions: { gap: 8 },
    notice: { margin: 20, padding: 12, borderRadius: 12, backgroundColor: theme.colors.surfaceSecondary },
    noticeText: { color: theme.colors.text, fontFamily: font.regular, fontSize: 10, lineHeight: 15 },
  }, theme));
}
