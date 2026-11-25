import { formatPeso } from '../services/money';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import OwnerRecordFilterBar, { OwnerLoadOlderButton, useOwnerBranchFilterOptions } from './OwnerRecordFilterBar';
import {
  ALL_BRANCHES,
  ownerReportSelectionCaption,
  recordPeriodRange,
  type OwnerRecordPeriod,
  type OwnerReportSelection,
} from './ownerRecordFilters';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import {
  getForcedSalesTransactionState,
  loadSalesTransactionById,
  completedTotal,
  loadSalesTransactionPage,
  type SalesTransaction,
} from './salesTransactionRepository';
import { describeOwnerRecordError, type OwnerRecordErrorInfo } from './shared/ownerRecordErrors';
import AppIcon from '../theme/AppIcon';

const font = {
  regular: 'Poppins_400Regular',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

const peso = formatPeso;

function dateTime(value: string) {
  const date = new Date(value);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const manila = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => manila.find((entry) => entry.type === type)?.value || '';
  const day = Number(part('day'));
  const month = Number(part('month'));
  const year = Number(part('year'));
  return `${day} ${monthNames[month - 1]} ${year} · ${part('hour')}:${part('minute')} ${part('dayPeriod')}`;
}

/**
 * OM-09 Transaction Summary. Given a `selection` (OM-09 c1), it is shown inside
 * the Sales page and uses the page's Daily / Weekly / Monthly and branch
 * selection instead of its own.
 */
export default function SalesTransactionRecords({
  onBack,
  initialTransactionId,
  selection,
}: {
  onBack?: () => void;
  initialTransactionId?: string | null;
  selection?: OwnerReportSelection;
}) {
  const { colors: themeColors } = useTheme();
  const styles = useStyles();
  const listRef = useRef<ScrollView>(null);
  const [view, setView] = useState<'list' | 'details'>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorInfo, setErrorInfo] = useState<OwnerRecordErrorInfo | null>(null);
  const [items, setItems] = useState<SalesTransaction[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<OwnerRecordErrorInfo | null>(null);
  const [selected, setSelected] = useState<SalesTransaction | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const loadingMoreRef = useRef(false);
  const listRequestId = useRef(0);
  // OM-09 c1: the same branch and period selection as the other reports.
  const [recordBranch, setRecordBranch] = useState(ALL_BRANCHES);
  const [recordPeriod, setRecordPeriod] = useState<OwnerRecordPeriod>('All dates');
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const range = recordPeriodRange(recordPeriod);
  const filters = selection
    ? {
      branchKey: selection.branch === ALL_BRANCHES ? null : selection.branch,
      startDate: selection.startDate,
      endDate: selection.endDate,
    }
    : {
      branchKey: recordBranch === ALL_BRANCHES ? null : recordBranch,
      startDate: range?.start ?? null,
      endDate: range?.end ?? null,
    };
  const branchOptions = useOwnerBranchFilterOptions(items.map((transaction) => transaction.branchName));
  const detailRequestId = useRef(0);

  const loadFirst = () => {
    const currentRequestId = ++listRequestId.current;
    setLoading(true);
    setError(false);
    setErrorInfo(null);
    setItems([]);
    setHasMore(false);
    setLoadMoreError(false);
    loadingMoreRef.current = false;
    const forced = getForcedSalesTransactionState();
    if (forced === 'loading') return;
    if (forced === 'error') {
      setErrorInfo(describeOwnerRecordError(new Error('Forced error state (design preview).')));
      setError(true);
      setLoading(false);
      return;
    }
    if (forced === 'empty') {
      setLoading(false);
      return;
    }
    void loadSalesTransactionPage(0, filters).then((page) => {
      if (currentRequestId !== listRequestId.current) return;
      setItems(page.transactions);
      setHasMore(page.hasMore);
      setLoadedAt(new Date());
      setLoading(false);
    }).catch((loadError: unknown) => {
      if (currentRequestId !== listRequestId.current) return;
      console.error('Unable to load Sales Transaction records.', loadError);
      setErrorInfo(describeOwnerRecordError(loadError));
      setError(true);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadFirst();
    return () => {
      listRequestId.current += 1;
      detailRequestId.current += 1;
    };
  }, [recordBranch, recordPeriod, selection?.branch, selection?.startDate, selection?.endDate]);

  const openDetails = (id: string) => {
    const currentRequestId = ++detailRequestId.current;
    setSelectedId(id);
    setView('details');
    setDetailError(null);
    const cached = items.find((transaction) => transaction.id === id);
    if (cached) {
      setSelected(cached);
      setDetailLoading(false);
      return;
    }
    setSelected(null);
    setDetailLoading(true);
    void loadSalesTransactionById(id).then((transaction) => {
      if (currentRequestId !== detailRequestId.current) return;
      if (transaction) setSelected(transaction);
      else setDetailError({ message: 'This transaction could not be found. It may not be completed yet or you may not have access to it.', detail: null });
      setDetailLoading(false);
    }).catch((loadError: unknown) => {
      if (currentRequestId !== detailRequestId.current) return;
      console.error('Unable to load the sales transaction.', loadError);
      setDetailError(describeOwnerRecordError(loadError));
      setDetailLoading(false);
    });
  };

  useEffect(() => {
    if (initialTransactionId) openDetails(initialTransactionId);
  }, [initialTransactionId]);

  const loadMore = () => {
    if (loadingMoreRef.current || !hasMore || items.length === 0) return;
    const currentRequestId = listRequestId.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(false);
    void loadSalesTransactionPage(items.length, filters).then((page) => {
      if (currentRequestId !== listRequestId.current) return;
      setItems((current) => {
        const known = new Set(current.map((transaction) => transaction.id));
        return [...current, ...page.transactions.filter((transaction) => !known.has(transaction.id))];
      });
      setHasMore(page.hasMore);
    }).catch((loadError: unknown) => {
      if (currentRequestId !== listRequestId.current) return;
      console.error('Unable to load more Sales Transaction records.', loadError);
      setLoadMoreError(true);
    }).finally(() => {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    });
  };

  const back = () => {
    if (view === 'details') {
      setView('list');
      requestAnimationFrame(() => listRef.current?.scrollTo({ y: scrollOffset, animated: false }));
    } else {
      onBack?.();
    }
  };

  const detailTitle = view === 'details';

  const embedded = Boolean(selection);
  const ListBody = embedded ? View : ScrollView;
  const DetailBody = embedded ? View : ScrollView;
  return (
    <View style={embedded ? styles.embedded : styles.screen}>
      {embedded && !detailTitle ? null : (
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={styles.backButton}>
            <AppIcon name="back" style={styles.backChevron} />
          </Pressable>
          <Text style={styles.headerTitle}>{detailTitle ? 'Sales Transaction Details' : 'Transaction Summary'}</Text>
        </View>
      )}

      {detailTitle ? (
        detailLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={themeColors.salesRecordCrimson} />
            <Text style={styles.loadingText}>Loading records…</Text>
          </View>
        ) : detailError || !selected ? (
          <View style={styles.errorCenter}>
            <AppIcon name="noInternet" style={styles.wifiIcon} />
            <Text accessibilityRole="alert" style={styles.errorText}>{detailError?.message ?? 'Unable to load this transaction.'}</Text>
            {detailError?.detail ? <Text selectable style={styles.errorDetail}>Details: {detailError.detail}</Text> : null}
            <Pressable accessibilityRole="button" onPress={() => openDetails(selectedId || '')} style={styles.retryButton}>
              <AppIcon name="refresh" style={styles.retryIcon} />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <DetailBody
            {...(embedded
              ? { style: styles.detailsContent }
              : { style: styles.detailsScroll, contentContainerStyle: styles.detailsContent, showsVerticalScrollIndicator: false })}
          >
            <View style={styles.detailCard}>
              <View style={styles.summaryTop}>
                <Text style={styles.transactionId}>{selected.transactionReference}</Text>
                <View style={[styles.recordedBadge, selected.status === 'Voided' && styles.voidedBadge]}>
                  {selected.status === 'Recorded' ? <AppIcon name="check" style={styles.recordedCheck} /> : null}
                  <Text style={styles.recordedText}>{selected.status === 'Recorded' ? 'Completed' : selected.status}</Text>
                </View>
              </View>
              {[
                ['Date & time', dateTime(selected.createdAt)],
                ['Branch', selected.branchName],
                ['Recorded by', selected.recordedBy],
                ...(selected.isBulkOrder ? [['Order', 'Bulk Order']] : []),
                ...(selected.status === 'Voided' ? [['Sales totals', 'Not counted (voided)']] : []),
              ].map(([label, value]) => (
                <View key={label} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={styles.detailValue}>{value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.detailCard}>
              <Text style={styles.cardTitle}>Items</Text>
              {selected.items.map((item) => (
                <View key={`${item.name}-${item.quantity}-${item.unitPrice}`} style={styles.itemRow}>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>×{item.quantity} @ {peso(item.unitPrice)}</Text>
                  </View>
                  <Text style={styles.itemTotal}>{peso(item.lineTotal)}</Text>
                </View>
              ))}
              <View style={styles.totalDivider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{peso(selected.total)}</Text>
              </View>
            </View>

            <View style={styles.detailCard}>
              <Text style={styles.cardTitle}>Payment information</Text>
              {[
                ['Payment method', selected.paymentMethod],
                ...(selected.paymentMethod === 'Cash' && selected.amountTendered !== null
                  ? [
                    ['Cash received', peso(selected.amountTendered)],
                    ['Change', peso(selected.change ?? 0)],
                  ]
                  : []),
              ].map(([label, value]) => (
                <View key={label} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={styles.detailValue}>{value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.readOnlyPill}>
              <AppIcon name="lock" style={styles.lockIcon} />
              <Text style={styles.readOnlyText}>Read-only</Text>
            </View>
          </DetailBody>
        )
      ) : loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={themeColors.salesRecordCrimson} />
          <Text style={styles.loadingText}>Loading records…</Text>
        </View>
      ) : error ? (
        <View style={styles.errorCenter}>
          <AppIcon name="noInternet" style={styles.wifiIcon} />
          <Text accessibilityRole="alert" style={styles.errorText}>{errorInfo?.message ?? 'Unable to load records. Please try again.'}</Text>
          {errorInfo?.detail ? <Text selectable style={styles.errorDetail}>Details: {errorInfo.detail}</Text> : null}
          <Pressable accessibilityRole="button" onPress={loadFirst} style={styles.retryButton}>
            <AppIcon name="refresh" style={styles.retryIcon} />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {embedded ? null : (
            <OwnerRecordFilterBar
              branchOptions={branchOptions}
              branch={recordBranch}
              onBranchChange={setRecordBranch}
              period={recordPeriod}
              onPeriodChange={setRecordPeriod}
            />
          )}
          {items.length === 0 ? (
        <View style={styles.emptyState}>
          <AppIcon name="ownerNoRecords" size={72} style={{ marginBottom: 10 }} />
          <Text style={styles.emptyTitle}>No transactions found.</Text>
          <Text style={styles.emptySubtext}>
            {!embedded && recordBranch === ALL_BRANCHES && recordPeriod === 'All dates'
              ? 'Records will appear here once saved.'
              : 'There are no transactions for this branch and period.'}
          </Text>
          {selection ? <Text style={styles.emptySubtext}>{ownerReportSelectionCaption(selection, loadedAt)}</Text> : null}
        </View>
          ) : (
        <ListBody
          {...(embedded
            ? { style: styles.listContent }
            : {
              ref: listRef,
              style: styles.listScroll,
              contentContainerStyle: styles.listContent,
              showsVerticalScrollIndicator: false,
              onScroll: (event: { nativeEvent: { contentOffset: { y: number }; layoutMeasurement: { height: number }; contentSize: { height: number } } }) => {
                const offset = event.nativeEvent.contentOffset.y;
                setScrollOffset(offset);
                const end = event.nativeEvent.layoutMeasurement.height + offset;
                const content = event.nativeEvent.contentSize.height;
                if (content - end < 56) loadMore();
              },
              scrollEventThrottle: 16,
            })}
        >
          {/* OM-09 c5: voided transactions are listed but not added to the total. */}
          <View style={styles.summaryLine}>
            <Text style={styles.summaryLineTitle}>
              {peso(completedTotal(items))} from {items.filter((transaction) => transaction.status === 'Recorded').length} completed
              {items.some((transaction) => transaction.status === 'Voided')
                ? ` · ${items.filter((transaction) => transaction.status === 'Voided').length} voided (not counted)`
                : ''}
            </Text>
            {/* OM-03 c4: the period, branch and time the figures reflect. */}
            {selection ? <Text style={styles.summaryLineMeta}>{ownerReportSelectionCaption(selection, loadedAt)}</Text> : null}
            {hasMore ? <Text style={styles.summaryLineMeta}>Showing the newest {items.length}; scroll or load older records to include more.</Text> : null}
          </View>
          {items.map((transaction) => (
            <Pressable
              key={transaction.id}
              accessibilityRole="button"
              onPress={() => openDetails(transaction.id)}
              style={styles.transactionTile}
            >
              <View style={styles.tileCopy}>
                <Text style={styles.tileId}>{transaction.transactionReference}</Text>
                <Text style={styles.tileDate}>{dateTime(transaction.createdAt)}</Text>
                <View style={styles.branchLine}>
                  <AppIcon name="location" style={styles.pinIcon} />
                  <Text style={styles.tileBranch}>{transaction.branchName}</Text>
                </View>
                <Text style={styles.tileDate}>
                  {transaction.recordedBy} · {transaction.paymentMethod}
                  {transaction.amountTendered !== null ? ` · cash ${peso(transaction.amountTendered)}, change ${peso(transaction.change ?? 0)}` : ''}
                </Text>
                <View style={styles.tagLine}>
                  <Text style={[styles.statusTag, transaction.status === 'Voided' && styles.statusTagVoided]}>
                    {transaction.status === 'Recorded' ? 'Completed' : transaction.status}
                  </Text>
                  {transaction.isBulkOrder ? <Text style={styles.statusTag}>Bulk Order</Text> : null}
                </View>
              </View>
              <View style={styles.tileRight}>
                <Text style={[styles.tileAmount, transaction.status === 'Voided' && styles.tileAmountVoided]}>{peso(transaction.total)}</Text>
                <AppIcon name="forward" style={styles.tileChevron} />
              </View>
            </Pressable>
          ))}
          {loadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color={themeColors.salesRecordCrimson} />
              <Text style={styles.loadingMoreText}>Loading more…</Text>
            </View>
          ) : loadMoreError ? (
            <Pressable accessibilityRole="button" onPress={loadMore} style={styles.loadMoreRetry}>
              <Text style={styles.loadMoreRetryText}>Couldn't load more. Tap to retry.</Text>
            </Pressable>
          ) : hasMore ? (
            <OwnerLoadOlderButton label="Load older records" onPress={loadMore} />
          ) : null}
        </ListBody>
          )}
        </>
      )}
    </View>
  );
}

function useStyles() {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(createThemedStyles({
    screen: { flex: 1, minHeight: 520 },
    embedded: { width: '100%', marginTop: 12 },
    header: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
    backButton: { width: 24, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
    backChevron: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 24, lineHeight: 28 },
    headerTitle: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 16 },
    loadingCenter: { minHeight: 300, flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 10, marginTop: 8 },
    errorCenter: { minHeight: 300, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    wifiIcon: { color: theme.colors.salesRecordCrimson, fontFamily: font.bold, fontSize: 32, lineHeight: 36, marginBottom: 10 },
    errorDetail: { maxWidth: 260, marginTop: 6, color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 9, lineHeight: 13, textAlign: 'center' },
    errorText: { maxWidth: 220, color: theme.colors.salesRecordNavy, fontFamily: font.regular, fontSize: 11, lineHeight: 16, textAlign: 'center' },
    retryButton: { minWidth: 120, minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, borderRadius: 16, backgroundColor: theme.colors.background, borderWidth: 1.5, borderColor: theme.colors.salesRecordNavy },
    retryIcon: { color: theme.colors.salesRecordCrimson, fontFamily: font.semibold, fontSize: 11, marginRight: 6 },
    retryText: { fontFamily: font.bold, fontSize: 10, color: theme.colors.salesRecordNavy },
    emptyState: { minHeight: 300, flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyCircle: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, marginBottom: 10, backgroundColor: theme.colors.salesRecordLavender },
    emptyIcon: { color: theme.colors.salesRecordNavy, fontFamily: font.semibold, fontSize: 20 },
    emptyTitle: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11, textAlign: 'center' },
    emptySubtext: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 9, textAlign: 'center', marginTop: 4 },
    listScroll: { flex: 1 },
    listContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 82, gap: 8 },
    transactionTile: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: theme.colors.salesRecordGray },
    tileCopy: { flex: 1 },
    tileId: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 },
    tileDate: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 8, marginTop: 2 },
    branchLine: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
    pinIcon: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 8, marginRight: 3 },
    tileBranch: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 8 },
    tileRight: { flexDirection: 'row', alignItems: 'center' },
    summaryLine: { paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile, gap: 2 },
    summaryLineTitle: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 },
    summaryLineMeta: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 8 },
    tagLine: { flexDirection: 'row', gap: 6, marginTop: 3 },
    statusTag: {
      color: theme.colors.salesRecordNavy, fontFamily: font.semibold, fontSize: 8, paddingHorizontal: 6, paddingVertical: 1,
      borderRadius: 4, backgroundColor: theme.colors.salesRecordCategoryTag, overflow: 'hidden',
    },
    statusTagVoided: { color: '#FFFFFF', backgroundColor: theme.colors.salesRecordCrimson },
    tileAmountVoided: { textDecorationLine: 'line-through', opacity: 0.6 },
    voidedBadge: { backgroundColor: theme.colors.salesRecordCrimson },
    tileAmount: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11, marginRight: 8 },
    tileChevron: { color: theme.colors.secondaryText, fontFamily: font.bold, fontSize: 16 },
    loadingMore: { height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
    loadingMoreText: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 9 },
    loadMoreRetry: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
    loadMoreRetryText: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 9 },
    detailsScroll: { flex: 1 },
    detailsContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 82, gap: 10 },
    detailCard: { paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, backgroundColor: theme.colors.salesRecordGray },
    summaryTop: { minHeight: 24, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    transactionId: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 13 },
    recordedBadge: { minHeight: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, borderRadius: 8, backgroundColor: theme.colors.salesRecordSuccess },
    recordedCheck: { color: theme.colors.background, fontFamily: font.semibold, fontSize: 7, marginRight: 3 },
    recordedText: { color: theme.colors.background, fontFamily: font.semibold, fontSize: 8 },
    detailRow: { minHeight: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: theme.colors.salesRecordBorder },
    detailLabel: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 9 },
    detailValue: { flexShrink: 1, color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 9, textAlign: 'right' },
    cardTitle: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11, marginBottom: 8 },
    itemRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    itemCopy: { flex: 1 },
    itemName: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 9 },
    itemMeta: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 8, marginTop: 2 },
    itemTotal: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 9 },
    totalDivider: { height: 1, backgroundColor: theme.colors.salesRecordBorder, marginTop: 4 },
    totalRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    totalLabel: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 10 },
    totalValue: { color: theme.colors.salesRecordCrimson, fontFamily: font.bold, fontSize: 12 },
    readOnlyPill: { width: '100%', minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 2, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.salesRecordBorder, backgroundColor: theme.colors.background },
    lockIcon: { color: theme.colors.secondaryText, fontFamily: font.semibold, fontSize: 9, marginRight: 6 },
    readOnlyText: { color: theme.colors.secondaryText, fontFamily: font.semibold, fontSize: 10 },
  }, theme)), [theme]);
}
