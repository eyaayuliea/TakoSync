import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OWNER_NAVIGATION_HEIGHT } from '../navigation/BottomNavigation';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import {
  OwnerBadge,
  OwnerButton,
  OwnerDetailRow,
  OwnerEmptyState,
  OwnerErrorState,
  OwnerHeader,
  OwnerInput,
  OwnerLoadingState,
  OwnerModal,
  OwnerTabs,
} from './shared/ownerComponents';
import {
  decideEntryReversal,
  loadOwnerEntryReversalReviews,
  type OwnerEntryReversalReview,
} from '../services/takosync';
import {
  ENTRY_REVERSAL_REASON_MAX_LENGTH,
  entryReversalRequestStatusLabel,
  entryReversalTypeLabel,
  sortEntryReversalRequestsForReview,
  type EntryReversalStatus,
} from '../services/entryReversals';
import { validateSaleVoidRejectionReason } from '../services/saleVoids';

const font = { regular: 'Poppins_400Regular', semibold: 'Poppins_600SemiBold', bold: 'Poppins_700Bold' } as const;

const STATUS_FILTERS = ['All', 'Pending', 'Reversed', 'Rejected'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const STATUS_BY_FILTER: Record<Exclude<StatusFilter, 'All'>, EntryReversalStatus> = {
  Pending: 'pending',
  Reversed: 'approved',
  Rejected: 'rejected',
};
const ALL_BRANCHES = 'All branches';

function quantity(value: number, unit: string): string {
  const amount = value.toLocaleString('en-PH', { maximumFractionDigits: 3 });
  return `${amount} ${unit === 'bottle' && value !== 1 ? 'bottles' : unit}`;
}

function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
}

function statusTone(status: EntryReversalStatus): 'warning' | 'error' | 'neutral' {
  return status === 'pending' ? 'warning' : status === 'approved' ? 'error' : 'neutral';
}

/**
 * OM-15 (entry reversal half) / OW-26 c4, c7: the owner reviews staff requests
 * to reverse a Stock-In, Batter Preparation, Waste, or Spillage entry.
 * Approval posts reversing Entry Reversal movements; the original entry stays
 * in the history.
 */
export default function EntryReversalRequestsScreen({ onBack, switcher }: { onBack: () => void; switcher?: React.ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [supported, setSupported] = useState(true);
  const [requests, setRequests] = useState<OwnerEntryReversalReview[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [branchFilter, setBranchFilter] = useState(ALL_BRANCHES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState('');
  const [notice, setNotice] = useState('');
  const loadGeneration = useRef(0);

  const load = () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setLoadError('');
    loadOwnerEntryReversalReviews()
      .then((result) => {
        if (generation !== loadGeneration.current) return;
        setSupported(result.supported);
        setRequests(result.requests);
      })
      .catch((reason: unknown) => {
        if (generation !== loadGeneration.current) return;
        console.error('Unable to load entry reversal requests.', reason);
        setLoadError('Unable to load reversal requests. Please check your internet connection and try again.');
      })
      .finally(() => {
        if (generation === loadGeneration.current) setLoading(false);
      });
  };

  useEffect(() => {
    load();
    return () => {
      loadGeneration.current += 1;
    };
  }, []);

  const branchOptions = useMemo(
    () => [ALL_BRANCHES, ...[...new Set(requests.map((request) => request.branchName))].sort()],
    [requests],
  );
  const visible = useMemo(() => sortEntryReversalRequestsForReview(requests.filter((request) =>
    (statusFilter === 'All' || request.status === STATUS_BY_FILTER[statusFilter])
    && (branchFilter === ALL_BRANCHES || request.branchName === branchFilter),
  )), [requests, statusFilter, branchFilter]);
  const pendingCount = requests.filter((request) => request.status === 'pending').length;
  const selected = selectedId ? requests.find((request) => request.id === selectedId) ?? null : null;

  const back = () => {
    if (selected) {
      setSelectedId(null);
      setNotice('');
      setDecisionError('');
    } else {
      onBack();
    }
  };

  const decide = async (decision: 'approve' | 'reject') => {
    if (!selected || deciding) return;
    if (decision === 'reject') {
      const message = validateSaleVoidRejectionReason(rejectReason);
      if (message) {
        setDecisionError(message);
        return;
      }
    }
    setDeciding(true);
    setDecisionError('');
    try {
      const saved = await decideEntryReversal({
        requestId: selected.id,
        decision,
        reason: decision === 'reject' ? rejectReason : undefined,
      });
      setRequests((current) => current.map((request) => request.id === saved.id
        ? { ...request, ...saved, requestedByName: request.requestedByName, decidedByName: saved.decidedByName ?? 'You' }
        : request));
      setConfirmApprove(false);
      setRejectOpen(false);
      setRejectReason('');
      setNotice(decision === 'approve'
        ? 'The entry was reversed. A reversing Entry Reversal transaction was posted and the original entry stays in the history.'
        : 'The request was rejected. The entry stays unchanged and the staff member can see your reason.');
    } catch (reason: unknown) {
      setDecisionError(reason instanceof Error ? reason.message : 'Unable to save the decision. Please try again.');
      load();
    } finally {
      setDeciding(false);
    }
  };

  const renderList = () => {
    if (loading) return <OwnerLoadingState label="Loading reversal requests…" />;
    if (loadError) return <OwnerErrorState message={loadError} onRetry={load} />;
    if (!supported) {
      return (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Entry reversals are not available yet. The database needs the latest update before staff can request them.
          </Text>
        </View>
      );
    }
    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.summary}>
          {pendingCount === 0 ? 'No requests are waiting for you.' : `${pendingCount} ${pendingCount === 1 ? 'request is' : 'requests are'} waiting for your decision.`}
        </Text>
        <OwnerTabs items={STATUS_FILTERS} selected={statusFilter} onSelect={(item) => setStatusFilter(item as StatusFilter)} />
        {branchOptions.length > 2 ? (
          <OwnerTabs items={branchOptions} selected={branchFilter} onSelect={setBranchFilter} />
        ) : null}
        {visible.length === 0 ? <OwnerEmptyState /> : visible.map((request) => (
          <Pressable
            key={request.id}
            accessibilityRole="button"
            accessibilityLabel={`${entryReversalTypeLabel(request.entryType)} ${request.entryReference}, ${entryReversalRequestStatusLabel(request.status)}`}
            onPress={() => {
              setSelectedId(request.id);
              setNotice('');
              setDecisionError('');
            }}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {entryReversalTypeLabel(request.entryType)} · {request.itemName}
              </Text>
              <OwnerBadge label={entryReversalRequestStatusLabel(request.status)} tone={statusTone(request.status)} />
            </View>
            <Text style={styles.cardMeta}>
              {request.branchName} · {request.requestedByName ?? 'Staff'} · {dateTime(request.requestedAt)}
            </Text>
            <Text style={styles.cardReason} numberOfLines={2}>“{request.reason}”</Text>
            <Text style={styles.cardAmount}>{quantity(request.quantity, request.unit)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    );
  };

  const renderDetails = (request: OwnerEntryReversalReview) => {
    const rows: Array<[string, string]> = [
      ['Request', request.reference],
      ['Status', entryReversalRequestStatusLabel(request.status)],
      ['Entry type', entryReversalTypeLabel(request.entryType)],
      ['Entry reference', request.entryReference],
      ['Item', request.itemName],
      ['Quantity', quantity(request.quantity, request.unit)],
      ['Entry recorded', dateTime(request.entryRecordedAt)],
      ['Branch', request.branchName],
      ['Requested by', request.requestedByName ?? 'Staff account'],
      ['Requested', dateTime(request.requestedAt)],
      ['Reason', request.reason],
    ];
    if (request.status !== 'pending') {
      rows.push(['Decided by', request.decidedByName ?? 'Owner'], ['Decided', dateTime(request.decidedAt)]);
      if (request.decisionReason) rows.push([request.status === 'rejected' ? 'Rejection reason' : 'Note', request.decisionReason]);
    }
    const batter = request.entryType === 'batter_preparation';

    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
        <View style={styles.detailCard}>
          {rows.map(([label, value], index) => (
            <OwnerDetailRow
              key={label}
              label={label}
              value={value}
              multiline={label === 'Reason' || label === 'Rejection reason' || label === 'Note'}
              first={index === 0}
              last={index === rows.length - 1}
            />
          ))}
        </View>
        {request.status === 'pending' ? (
          <Text style={styles.readOnly}>
            {batter
              ? 'Approving returns the batch’s raw ingredients to stock and removes its five prepared bottles.'
              : request.entryType === 'stock_in'
                ? 'Approving removes this quantity from stock again.'
                : 'Approving puts this quantity back into stock.'}
          </Text>
        ) : null}
        {decisionError ? <Text style={styles.error} accessibilityRole="alert">{decisionError}</Text> : null}
        {request.status === 'pending' ? (
          <View style={styles.actions}>
            <OwnerButton label="Approve Reversal" onPress={() => { setDecisionError(''); setConfirmApprove(true); }} disabled={deciding} />
            <OwnerButton label="Reject" variant="outline" onPress={() => { setDecisionError(''); setRejectReason(''); setRejectOpen(true); }} disabled={deciding} />
          </View>
        ) : (
          <Text style={styles.readOnly}>This request has been decided and can no longer be changed.</Text>
        )}
      </ScrollView>
    );
  };

  return (
    <View style={styles.screen}>
      <OwnerHeader title={selected ? 'Reversal Request' : 'Requests'} onBack={back} />
      {!selected && switcher ? <View style={styles.switcher}>{switcher}</View> : null}
      {selected ? renderDetails(selected) : renderList()}

      <OwnerModal visible={confirmApprove} onClose={() => { if (!deciding) setConfirmApprove(false); }}>
        <Text style={styles.modalTitle}>Approve this reversal?</Text>
        <Text style={styles.modalCopy}>
          {selected ? `${entryReversalTypeLabel(selected.entryType)} ${selected.entryReference} (${selected.itemName}, ${quantity(selected.quantity, selected.unit)})` : ''}
          {' '}will be reversed with an Entry Reversal transaction. The original entry stays in the history. This cannot be undone.
        </Text>
        {decisionError ? <Text style={styles.error} accessibilityRole="alert">{decisionError}</Text> : null}
        <View style={styles.modalActions}>
          <OwnerButton label="Cancel" variant="neutral" onPress={() => setConfirmApprove(false)} disabled={deciding} />
          {deciding ? <ActivityIndicator color={colors.accent} /> : <OwnerButton label="Approve Reversal" onPress={() => void decide('approve')} />}
        </View>
      </OwnerModal>

      <OwnerModal visible={rejectOpen} onClose={() => { if (!deciding) setRejectOpen(false); }}>
        <Text style={styles.modalTitle}>Reject this request?</Text>
        <Text style={styles.modalCopy}>The entry stays unchanged. Staff will see the reason you enter.</Text>
        <OwnerInput
          value={rejectReason}
          onChangeText={(value) => {
            setRejectReason(value);
            if (decisionError) setDecisionError('');
          }}
          placeholder="Reason (required)"
          accessibilityLabel="Reason for rejecting, required"
          maxLength={ENTRY_REVERSAL_REASON_MAX_LENGTH}
          multiline
          editable={!deciding}
        />
        {decisionError ? <Text style={styles.error} accessibilityRole="alert">{decisionError}</Text> : null}
        <View style={styles.modalActions}>
          <OwnerButton label="Cancel" variant="neutral" onPress={() => setRejectOpen(false)} disabled={deciding} />
          {deciding ? <ActivityIndicator color={colors.accent} /> : <OwnerButton label="Reject Request" variant="outline" onPress={() => void decide('reject')} />}
        </View>
      </OwnerModal>
    </View>
  );
}

function useStyles() {
  const theme = useTheme();
  return StyleSheet.create(createThemedStyles({
    screen: { flex: 1, minHeight: 520 },
    switcher: { paddingHorizontal: 20, paddingTop: 8 },
    flex: { flex: 1 },
    listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: OWNER_NAVIGATION_HEIGHT, gap: 10 },
    summary: { color: theme.colors.salesRecordNavy, fontFamily: font.semibold, fontSize: 11 },
    card: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile, gap: 3 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    cardTitle: { flex: 1, color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 },
    cardMeta: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 8 },
    cardReason: { color: theme.colors.salesRecordNavy, fontFamily: font.regular, fontSize: 9, lineHeight: 13 },
    cardAmount: { color: theme.colors.salesRecordNavy, fontFamily: font.semibold, fontSize: 10, alignSelf: 'flex-end' },
    detailCard: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile },
    actions: { gap: 8 },
    readOnly: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 9, textAlign: 'center' },
    notice: { padding: 12, borderRadius: 12, backgroundColor: theme.colors.surfaceSecondary },
    noticeText: { color: theme.colors.text, fontFamily: font.regular, fontSize: 10, lineHeight: 15 },
    error: { color: theme.colors.error, fontFamily: font.regular, fontSize: 9, lineHeight: 13 },
    modalTitle: { color: theme.colors.text, fontFamily: font.bold, fontSize: 14, marginBottom: 6 },
    modalCopy: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 10, lineHeight: 15, marginBottom: 12 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12 },
    pressed: { opacity: 0.82 },
  }, theme));
}
