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
  reviewSaleVoid,
  loadOwnerSaleVoidReviews,
  type OwnerSaleVoidReview,
} from '../services/takosync';
import {
  SALE_VOID_REASON_MAX_LENGTH,
  saleVoidRequestStatusLabel,
  sortSaleVoidRequestsForReview,
  validateSaleVoidFlagReason,
  type SaleVoidRequestStatus,
} from '../services/saleVoids';

const font = { regular: 'Poppins_400Regular', semibold: 'Poppins_600SemiBold', bold: 'Poppins_700Bold' } as const;

const STATUS_FILTERS = ['All', 'Pending Review', 'Reviewed', 'Flagged'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const STATUS_BY_FILTER: Record<Exclude<StatusFilter, 'All'>, SaleVoidRequestStatus> = {
  'Pending Review': 'pending_review',
  Reviewed: 'reviewed',
  Flagged: 'flagged',
};
const ALL_BRANCHES = 'All branches';

function money(value: number): string {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
}

function statusTone(status: SaleVoidRequestStatus): 'warning' | 'error' | 'neutral' {
  return status === 'pending_review' ? 'warning' : status === 'flagged' ? 'error' : 'neutral';
}

/**
 * OM-15 (void half) / OW-26: the owner reviews the sales staff voided, Pending
 * Review first, and marks each one Reviewed or Flagged (a reason is required to
 * flag). The sale is already Voided; the review records the owner's view and
 * never undoes the void. A reviewed or flagged void is read-only.
 */
export default function SaleVoidRequestsScreen({ onBack, switcher }: { onBack: () => void; switcher?: React.ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [supported, setSupported] = useState(true);
  const [requests, setRequests] = useState<OwnerSaleVoidReview[]>([]);
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
    loadOwnerSaleVoidReviews()
      .then((result) => {
        if (generation !== loadGeneration.current) return;
        setSupported(result.supported);
        setRequests(result.requests);
      })
      .catch((reason: unknown) => {
        if (generation !== loadGeneration.current) return;
        console.error('Unable to load voided sales.', reason);
        setLoadError('Unable to load voided sales. Please check your internet connection and try again.');
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
  const visible = useMemo(() => sortSaleVoidRequestsForReview(requests.filter((request) =>
    (statusFilter === 'All' || request.status === STATUS_BY_FILTER[statusFilter])
    && (branchFilter === ALL_BRANCHES || request.branchName === branchFilter),
  )) as OwnerSaleVoidReview[], [requests, statusFilter, branchFilter]);
  const pendingCount = requests.filter((request) => request.status === 'pending_review').length;
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

  const decide = async (decision: 'reviewed' | 'flagged') => {
    if (!selected || deciding) return;
    if (decision === 'flagged') {
      const message = validateSaleVoidFlagReason(rejectReason);
      if (message) {
        setDecisionError(message);
        return;
      }
    }
    setDeciding(true);
    setDecisionError('');
    try {
      const saved = await reviewSaleVoid({
        voidId: selected.id,
        decision,
        reason: decision === 'flagged' ? rejectReason : undefined,
      });
      setRequests((current) => current.map((request) => request.id === saved.id
        ? { ...request, ...saved, requestedByName: request.requestedByName, decidedByName: saved.decidedByName ?? 'You' }
        : request));
      setConfirmApprove(false);
      setRejectOpen(false);
      setRejectReason('');
      setNotice(decision === 'reviewed'
        ? 'The void is marked Reviewed. The sale stays Voided.'
        : 'The void is Flagged with your reason. The sale stays Voided; flagging records your concern and does not undo the void.');
    } catch (reason: unknown) {
      setDecisionError(reason instanceof Error ? reason.message : 'Unable to save the review. Please try again.');
      // Someone may have reviewed it already; show the current state.
      load();
    } finally {
      setDeciding(false);
    }
  };

  const renderList = () => {
    if (loading) return <OwnerLoadingState label="Loading voided sales…" />;
    if (loadError) return <OwnerErrorState message={loadError} onRetry={load} />;
    if (!supported) {
      return (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Void review is not available yet. The database needs the latest update before staff can void sales.
          </Text>
        </View>
      );
    }
    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.summary}>
          {pendingCount === 0 ? 'No voids are waiting for your review.' : `${pendingCount} ${pendingCount === 1 ? 'void is' : 'voids are'} waiting for your review.`}
        </Text>
        <OwnerTabs items={STATUS_FILTERS} selected={statusFilter} onSelect={(item) => setStatusFilter(item as StatusFilter)} />
        {branchOptions.length > 2 ? (
          <OwnerTabs items={branchOptions} selected={branchFilter} onSelect={setBranchFilter} />
        ) : null}
        {visible.length === 0 ? <OwnerEmptyState /> : visible.map((request) => (
          <Pressable
            key={request.id}
            accessibilityRole="button"
            accessibilityLabel={`${request.reference}, ${saleVoidRequestStatusLabel(request.status)}, sale ${request.sale?.transactionReference ?? ''}`}
            onPress={() => {
              setSelectedId(request.id);
              setNotice('');
              setDecisionError('');
            }}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle} numberOfLines={1}>{request.sale?.transactionReference ?? request.reference}</Text>
              <OwnerBadge label={saleVoidRequestStatusLabel(request.status)} tone={statusTone(request.status)} />
            </View>
            <Text style={styles.cardMeta}>
              {request.branchName} · {request.requestedByName ?? 'Staff'} · {dateTime(request.requestedAt)}
            </Text>
            <Text style={styles.cardReason} numberOfLines={2}>“{request.reason}”</Text>
            {request.sale ? <Text style={styles.cardAmount}>{money(request.sale.totalAmount)}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    );
  };

  const renderDetails = (request: OwnerSaleVoidReview) => {
    const rows: Array<[string, string]> = [
      ['Void', request.reference],
      ['Review status', saleVoidRequestStatusLabel(request.status)],
      ['Branch', request.branchName],
      ['Voided by', request.requestedByName ?? 'Staff account'],
      ['Voided', dateTime(request.requestedAt)],
      ['Reason', request.reason],
      ['Sale status', 'Voided · not counted in sales totals; ingredients returned to stock'],
      ['Sale', request.sale?.transactionReference ?? 'Sale not found'],
      ['Sale recorded', dateTime(request.sale?.createdAt)],
      ['Sale total', request.sale ? money(request.sale.totalAmount) : '—'],
    ];
    if (request.status !== 'pending_review') {
      rows.push(
        ['Reviewed by', request.decidedByName ?? 'Owner'],
        ['Reviewed', dateTime(request.decidedAt)],
      );
      if (request.decisionReason) rows.push([request.status === 'flagged' ? 'Flag reason' : 'Note', request.decisionReason]);
    }

    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
        <View style={styles.detailCard}>
          {rows.map(([label, value], index) => (
            <OwnerDetailRow
              key={label}
              label={label}
              value={value}
              multiline={label === 'Reason' || label === 'Flag reason' || label === 'Note' || label === 'Sale status'}
              first={index === 0}
              last={index === rows.length - 1}
            />
          ))}
        </View>
        {request.sale?.lines.length ? (
          <View style={styles.detailCard}>
            <Text style={styles.sectionTitle}>Items</Text>
            {request.sale.lines.map((line) => (
              <View key={line.id} style={styles.itemRow}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {line.quantity} × {line.name}{line.variantLabel ? ` · ${line.variantLabel}` : ''}
                </Text>
                <Text style={styles.itemAmount}>{money(line.subtotal)}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {decisionError ? <Text style={styles.error} accessibilityRole="alert">{decisionError}</Text> : null}
        {request.status === 'pending_review' ? (
          <View style={styles.actions}>
            <OwnerButton label="Mark as Reviewed" onPress={() => { setDecisionError(''); setConfirmApprove(true); }} disabled={deciding} />
            <OwnerButton label="Flag Void" variant="outline" onPress={() => { setDecisionError(''); setRejectReason(''); setRejectOpen(true); }} disabled={deciding} />
          </View>
        ) : (
          <Text style={styles.readOnly}>This void has been {request.status === 'flagged' ? 'flagged' : 'reviewed'} and can no longer be changed.</Text>
        )}
      </ScrollView>
    );
  };

  return (
    <View style={styles.screen}>
      <OwnerHeader title={selected ? 'Voided Sale' : 'Void and Reversal Review'} onBack={back} />
      {!selected && switcher ? <View style={styles.switcher}>{switcher}</View> : null}
      {selected ? renderDetails(selected) : renderList()}

      <OwnerModal visible={confirmApprove} onClose={() => { if (!deciding) setConfirmApprove(false); }}>
        <Text style={styles.modalTitle}>Mark this void as Reviewed?</Text>
        <Text style={styles.modalCopy}>
          Sale {selected?.sale?.transactionReference} ({selected?.sale ? money(selected.sale.totalAmount) : ''}) is already Voided.
          Marking it Reviewed records that you checked it. This cannot be changed afterwards.
        </Text>
        {decisionError ? <Text style={styles.error} accessibilityRole="alert">{decisionError}</Text> : null}
        <View style={styles.modalActions}>
          <OwnerButton label="Cancel" variant="neutral" onPress={() => setConfirmApprove(false)} disabled={deciding} />
          {deciding ? <ActivityIndicator color={colors.accent} /> : <OwnerButton label="Mark as Reviewed" onPress={() => void decide('reviewed')} />}
        </View>
      </OwnerModal>

      <OwnerModal visible={rejectOpen} onClose={() => { if (!deciding) setRejectOpen(false); }}>
        <Text style={styles.modalTitle}>Flag this void?</Text>
        <Text style={styles.modalCopy}>Flagging records your concern. It does not undo the void, and staff will see that it is Flagged.</Text>
        <OwnerInput
          value={rejectReason}
          onChangeText={(value) => {
            setRejectReason(value);
            if (decisionError) setDecisionError('');
          }}
          placeholder="Reason (required)"
          accessibilityLabel="Reason for flagging, required"
          maxLength={SALE_VOID_REASON_MAX_LENGTH}
          multiline
          editable={!deciding}
        />
        {decisionError ? <Text style={styles.error} accessibilityRole="alert">{decisionError}</Text> : null}
        <View style={styles.modalActions}>
          <OwnerButton label="Cancel" variant="neutral" onPress={() => setRejectOpen(false)} disabled={deciding} />
          {deciding ? <ActivityIndicator color={colors.accent} /> : <OwnerButton label="Flag Void" variant="outline" onPress={() => void decide('flagged')} />}
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
    sectionTitle: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11, marginBottom: 6 },
    itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 3 },
    itemName: { flex: 1, color: theme.colors.salesRecordNavy, fontFamily: font.regular, fontSize: 10 },
    itemAmount: { color: theme.colors.salesRecordNavy, fontFamily: font.semibold, fontSize: 10 },
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
