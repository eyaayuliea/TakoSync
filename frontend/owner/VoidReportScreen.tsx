import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OWNER_NAVIGATION_HEIGHT } from '../navigation/BottomNavigation';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import { OwnerDetailRow, OwnerErrorState, OwnerHeader, OwnerLoadingState, OwnerReadOnlyPill } from './shared/ownerComponents';
import OwnerRecordFilterBar, { OwnerFilteredEmptyState, useOwnerBranchFilterOptions } from './OwnerRecordFilterBar';
import {
  ALL_BRANCHES,
  filterOwnerRecords,
  filterOwnerRecordsBySelection,
  ownerReportSelectionCaption,
  type OwnerRecordPeriod,
  type OwnerReportSelection,
} from './ownerRecordFilters';
import { approvedOnly, newestFirst, summarizeVoidReport } from './voidReversalReports';
import { loadOwnerSaleVoidReviews, type OwnerSaleVoidReview } from '../services/takosync';

const font = { regular: 'Poppins_400Regular', semibold: 'Poppins_600SemiBold', bold: 'Poppins_700Bold' } as const;

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

/**
 * OM-10 Void Report: every voided sale with its reason, the requesting
 * employee, and the approving owner, for the selected period and branch.
 * Given a `selection` (OM-10 c1), it is shown inside the Sales page and uses
 * the page's Daily / Weekly / Monthly and branch selection instead of its own.
 */
export default function VoidReportScreen({ onBack, selection }: { onBack?: () => void; selection?: OwnerReportSelection }) {
  const styles = useStyles();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(true);
  const [voids, setVoids] = useState<OwnerSaleVoidReview[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [branch, setBranch] = useState(ALL_BRANCHES);
  const [period, setPeriod] = useState<OwnerRecordPeriod>('This month');
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const generation = useRef(0);

  const load = () => {
    const current = ++generation.current;
    setLoading(true);
    setError('');
    loadOwnerSaleVoidReviews()
      .then((result) => {
        if (current !== generation.current) return;
        setSupported(result.supported);
        setVoids(approvedOnly(result.requests));
        setLoadedAt(new Date());
      })
      .catch((reason: unknown) => {
        if (current !== generation.current) return;
        console.error('Unable to load the Void Report.', reason);
        setError('Unable to load the Void Report. Please check your internet connection and try again.');
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
  };

  useEffect(() => {
    load();
    return () => {
      generation.current += 1;
    };
  }, []);

  const branchOptions = useOwnerBranchFilterOptions(voids.map((row) => row.branchName));
  // OM-10 c1: the period is the sale's original date.
  const dateOf = (row: OwnerSaleVoidReview) => row.sale?.createdAt ?? row.decidedAt;
  const rows = newestFirst(
    selection
      ? filterOwnerRecordsBySelection(voids, { selection, branchOf: (row) => row.branchName, dateOf })
      : filterOwnerRecords(voids, { branch, period, branchOf: (row) => row.branchName, dateOf }),
    dateOf,
  );
  const summary = summarizeVoidReport(rows);
  const selected = selectedId ? voids.find((row) => row.id === selectedId) ?? null : null;

  const renderDetails = (row: OwnerSaleVoidReview) => {
    const details: Array<[string, string]> = [
      ['Sale', row.sale?.transactionReference ?? '—'],
      ['Branch', row.branchName],
      ['Sale total', row.sale ? money(row.sale.totalAmount) : '—'],
      ['Sale recorded', dateTime(row.sale?.createdAt)],
      ['Reason', row.reason],
      ['Requested by', row.requestedByName ?? 'Staff account'],
      ['Requested', dateTime(row.requestedAt)],
      ['Approved by', row.decidedByName ?? 'Owner'],
      ['Approved', dateTime(row.decidedAt)],
      ['Void request', row.reference],
    ];
    const Body = selection ? View : ScrollView;
    const bodyProps = selection
      ? { style: styles.embeddedList }
      : { style: styles.flex, contentContainerStyle: styles.content, showsVerticalScrollIndicator: false };
    return (
      <View style={selection ? undefined : styles.flex}>
        <Body {...bodyProps}>
          <View style={styles.card}>
            {details.map(([label, value], index) => (
              <OwnerDetailRow key={label} label={label} value={value} multiline={label === 'Reason'} first={index === 0} last={index === details.length - 1} />
            ))}
          </View>
          {row.sale?.lines.length ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Items</Text>
              {row.sale.lines.map((line) => (
                <View key={line.id} style={styles.line}>
                  <Text style={styles.lineLabel}>{line.quantity} × {line.name}{line.variantLabel ? ` · ${line.variantLabel}` : ''}</Text>
                  <Text style={styles.lineValue}>{money(line.subtotal)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Body>
        <OwnerReadOnlyPill />
      </View>
    );
  };

  const renderList = () => {
    if (loading) return <OwnerLoadingState label="Loading voided sales…" />;
    if (error) return <OwnerErrorState message={error} onRetry={load} />;
    if (!supported) {
      return (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>The Void Report is not available yet. The database needs the latest update.</Text>
        </View>
      );
    }
    const List = selection ? View : ScrollView;
    const listProps = selection
      ? { style: styles.embeddedList }
      : { style: styles.flex, contentContainerStyle: styles.content, showsVerticalScrollIndicator: false };
    return (
      <>
        {selection ? null : (
          <OwnerRecordFilterBar branchOptions={branchOptions} branch={branch} onBranchChange={setBranch} period={period} onPeriodChange={setPeriod} />
        )}
        {rows.length === 0 && !selection ? (
          <OwnerFilteredEmptyState branch={branch} period={period} note="There are no voided sales for this selection." />
        ) : (
          <List {...listProps}>
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>{summary.count} voided {summary.count === 1 ? 'sale' : 'sales'} · {money(summary.total)}</Text>
              <Text style={styles.summaryMeta}>Voided sales are excluded from every sales total.</Text>
              {/* OM-03 c4: the period, branch and time the figures reflect. */}
              {selection ? <Text style={styles.summaryMeta}>{ownerReportSelectionCaption(selection, loadedAt)}</Text> : null}
            </View>
            {selection && rows.length === 0 ? (
              <Text style={styles.emptyText}>There are no voided sales for this period and branch.</Text>
            ) : null}
            {rows.map((row) => (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                accessibilityLabel={`Voided sale ${row.sale?.transactionReference ?? ''}, ${row.branchName}`}
                onPress={() => setSelectedId(row.id)}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{row.sale?.transactionReference ?? row.reference}</Text>
                  <Text style={styles.amount}>{row.sale ? money(row.sale.totalAmount) : '—'}</Text>
                </View>
                <Text style={styles.meta}>{row.branchName} · {dateTime(row.sale?.createdAt)}</Text>
                <Text style={styles.reason} numberOfLines={2}>“{row.reason}” · {row.requestedByName ?? 'Staff'}</Text>
                <Text style={styles.meta}>Approved by {row.decidedByName ?? 'Owner'} · {dateTime(row.decidedAt)}</Text>
              </Pressable>
            ))}
          </List>
        )}
      </>
    );
  };

  if (selection) {
    return (
      <View style={styles.embedded}>
        {selected ? <OwnerHeader title="Voided Sale" onBack={() => setSelectedId(null)} /> : null}
        {selected ? renderDetails(selected) : renderList()}
      </View>
    );
  }
  return (
    <View style={styles.screen}>
      <OwnerHeader title={selected ? 'Voided Sale' : 'Void Report'} onBack={selected ? () => setSelectedId(null) : () => onBack?.()} />
      {selected ? renderDetails(selected) : renderList()}
    </View>
  );
}

function useStyles() {
  const theme = useTheme();
  return StyleSheet.create(createThemedStyles({
    screen: { flex: 1, minHeight: 520 },
    embedded: { width: '100%', marginTop: 12 },
    embeddedList: { gap: 8 },
    emptyText: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 10, textAlign: 'center', paddingVertical: 16 },
    flex: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: OWNER_NAVIGATION_HEIGHT, gap: 8 },
    summary: { padding: 12, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile, gap: 2 },
    summaryTitle: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 12 },
    summaryMeta: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 9 },
    card: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile, gap: 3 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    cardTitle: { flex: 1, color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 },
    amount: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11, textDecorationLine: 'line-through' },
    meta: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 8 },
    reason: { color: theme.colors.salesRecordNavy, fontFamily: font.regular, fontSize: 9, lineHeight: 13 },
    sectionTitle: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11, marginBottom: 4 },
    line: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 2 },
    lineLabel: { flex: 1, color: theme.colors.salesRecordNavy, fontFamily: font.regular, fontSize: 10 },
    lineValue: { color: theme.colors.salesRecordNavy, fontFamily: font.semibold, fontSize: 10 },
    notice: { margin: 20, padding: 12, borderRadius: 12, backgroundColor: theme.colors.surfaceSecondary },
    noticeText: { color: theme.colors.text, fontFamily: font.regular, fontSize: 10, lineHeight: 15 },
    pressed: { opacity: 0.82 },
  }, theme));
}
