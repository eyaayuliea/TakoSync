import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { OWNER_NAVIGATION_HEIGHT } from '../navigation/BottomNavigation';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import { OwnerBadge, OwnerErrorState, OwnerHeader, OwnerLoadingState, OwnerTabs } from './shared/ownerComponents';
import { loadOwnerDailyClosings } from '../services/takosync';
import {
  DAILY_CLOSING_PERIODS,
  buildDailyClosingReportRows,
  dailyClosingPeriodDates,
  formatPeso,
  overShortLabel,
  summarizeDailyClosingRows,
  type DailyClosing,
  type DailyClosingPeriod,
} from '../services/dailyClosing';

const font = { regular: 'Poppins_400Regular', semibold: 'Poppins_600SemiBold', bold: 'Poppins_700Bold' } as const;
const ALL_BRANCHES = 'All branches';

function formatBusinessDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
}

/**
 * OM-11 Daily Closing Report: the closing cash count of each branch and day,
 * compared with the expected cash, with over or short labelled in text. Days
 * without a closing are marked "No closing recorded".
 */
export default function DailyClosingReportScreen({ onBack }: { onBack: () => void }) {
  const styles = useStyles();
  const [period, setPeriod] = useState<DailyClosingPeriod>('Last 7 days');
  const [branchFilter, setBranchFilter] = useState(ALL_BRANCHES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(true);
  const [closings, setClosings] = useState<DailyClosing[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const generation = useRef(0);
  const dates = useMemo(() => dailyClosingPeriodDates(period), [period]);

  const load = () => {
    const current = ++generation.current;
    setLoading(true);
    setError('');
    loadOwnerDailyClosings({ startDate: dates[dates.length - 1], endDate: dates[0] })
      .then((result) => {
        if (current !== generation.current) return;
        setSupported(result.supported);
        setClosings(result.closings);
        setBranches(result.branches);
      })
      .catch((reason: unknown) => {
        if (current !== generation.current) return;
        console.error('Unable to load the Daily Closing Report.', reason);
        setError('Unable to load the Daily Closing Report. Please check your internet connection and try again.');
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
  }, [dates]);

  const selectedBranch = branches.find((branch) => branch.name === branchFilter) ?? null;
  const rows = buildDailyClosingReportRows({ closings, branches, dates, branchId: selectedBranch?.id ?? null });
  const summary = summarizeDailyClosingRows(rows);

  const renderBody = () => {
    if (loading) return <OwnerLoadingState label="Loading closings…" />;
    if (error) return <OwnerErrorState message={error} onRetry={load} />;
    if (!supported) {
      return (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            The Daily Closing Report is not available yet. The database needs the latest update before staff can record closings.
          </Text>
        </View>
      );
    }
    return (
      <>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{summary.closed} closing{summary.closed === 1 ? '' : 's'} recorded · {summary.missing} missing</Text>
          <Text style={styles.summaryMeta}>Total over {formatPeso(summary.totalOver)} · Total short {formatPeso(summary.totalShort)}</Text>
        </View>
        {summary.closed === 0 ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>No closings were recorded in this period.</Text>
          </View>
        ) : null}
        {rows.map((row) => {
          const closing = row.closing;
          if (!closing) {
            return (
              <View key={row.key} style={[styles.card, styles.cardMissing]}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{row.branchName}</Text>
                  <Text style={styles.cardDate}>{formatBusinessDate(row.businessDate)}</Text>
                </View>
                <Text style={styles.missing}>No closing recorded</Text>
              </View>
            );
          }
          const label = overShortLabel(closing.overShort);
          return (
            <View key={row.key} style={styles.card} accessibilityLabel={`${row.branchName}, ${row.businessDate}, ${label.text}`}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{row.branchName}</Text>
                <OwnerBadge label={label.text} tone={label.kind === 'short' ? 'error' : label.kind === 'over' ? 'warning' : 'success'} />
              </View>
              <Text style={styles.cardDate}>
                {formatBusinessDate(row.businessDate)} · {closing.recordedByName ?? 'Staff account'} at {formatTime(closing.recordedAt)}
              </Text>
              {[
                ['Opening float', formatPeso(closing.openingFloat)],
                [`Cash sales (${closing.cashTransactionCount}, voided excluded)`, formatPeso(closing.recordedCashSales - closing.voidedCashSales)],
                ...(closing.voidedCashSales > 0 ? [['Voided cash sales', formatPeso(closing.voidedCashSales)]] : []),
                ['Expected cash', formatPeso(closing.expectedCash)],
                ['Closing cash count', formatPeso(closing.closingCashCount)],
              ].map(([labelText, value]) => (
                <View key={labelText} style={styles.line}>
                  <Text style={styles.lineLabel}>{labelText}</Text>
                  <Text style={styles.lineValue}>{value}</Text>
                </View>
              ))}
            </View>
          );
        })}
      </>
    );
  };

  return (
    <View style={styles.screen}>
      <OwnerHeader title="Daily Closing Report" onBack={onBack} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <OwnerTabs items={DAILY_CLOSING_PERIODS} selected={period} onSelect={(item) => setPeriod(item as DailyClosingPeriod)} />
        {branches.length > 1 ? (
          <OwnerTabs items={[ALL_BRANCHES, ...branches.map((branch) => branch.name)]} selected={branchFilter} onSelect={setBranchFilter} />
        ) : null}
        {renderBody()}
      </ScrollView>
    </View>
  );
}

function useStyles() {
  const theme = useTheme();
  return StyleSheet.create(createThemedStyles({
    screen: { flex: 1, minHeight: 520 },
    flex: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: OWNER_NAVIGATION_HEIGHT, gap: 10 },
    summaryCard: { padding: 12, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile, gap: 2 },
    summaryTitle: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 12 },
    summaryMeta: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 9 },
    card: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile, gap: 3 },
    cardMissing: { opacity: 0.75 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    cardTitle: { flex: 1, color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 },
    cardDate: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 8 },
    missing: { color: theme.colors.salesRecordMuted, fontFamily: font.semibold, fontSize: 10 },
    line: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    lineLabel: { flex: 1, color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 9 },
    lineValue: { color: theme.colors.salesRecordNavy, fontFamily: font.semibold, fontSize: 9 },
    notice: { padding: 12, borderRadius: 12, backgroundColor: theme.colors.surfaceSecondary },
    noticeText: { color: theme.colors.text, fontFamily: font.regular, fontSize: 10, lineHeight: 15 },
  }, theme));
}
