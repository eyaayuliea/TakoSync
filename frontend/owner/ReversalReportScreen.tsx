import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OWNER_NAVIGATION_HEIGHT } from '../navigation/BottomNavigation';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import { OwnerDetailRow, OwnerErrorState, OwnerHeader, OwnerLoadingState, OwnerReadOnlyPill } from './shared/ownerComponents';
import OwnerRecordFilterBar, { OwnerFilteredEmptyState, useOwnerBranchFilterOptions } from './OwnerRecordFilterBar';
import { ALL_BRANCHES, filterOwnerRecords, type OwnerRecordPeriod } from './ownerRecordFilters';
import { approvedOnly, newestFirst } from './voidReversalReports';
import { entryReversalTypeLabel } from '../services/entryReversals';
import {
  loadEntryReversalMovements,
  loadOwnerEntryReversalReviews,
  type OwnerEntryReversalReview,
} from '../services/takosync';

const font = { regular: 'Poppins_400Regular', semibold: 'Poppins_600SemiBold', bold: 'Poppins_700Bold' } as const;

function quantity(value: number, unit: string): string {
  const amount = Math.abs(value).toLocaleString('en-PH', { maximumFractionDigits: 3 });
  return `${amount} ${unit === 'bottle' && Math.abs(value) !== 1 ? 'bottles' : unit}`;
}

function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
}

type ReversingMovement = Awaited<ReturnType<typeof loadEntryReversalMovements>>[number];

/**
 * OM-22 Reversal Report: the Stock-In, Batter Preparation, Waste, and
 * Spillage entries reversed with the owner's approval. Each record links the
 * original entry to the reversing Entry Reversal movements.
 */
export default function ReversalReportScreen({ onBack }: { onBack: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(true);
  const [reversals, setReversals] = useState<OwnerEntryReversalReview[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [movements, setMovements] = useState<ReversingMovement[] | null>(null);
  const [movementsError, setMovementsError] = useState('');
  const [branch, setBranch] = useState(ALL_BRANCHES);
  const [period, setPeriod] = useState<OwnerRecordPeriod>('All dates');
  const generation = useRef(0);
  const detailGeneration = useRef(0);

  const load = () => {
    const current = ++generation.current;
    setLoading(true);
    setError('');
    loadOwnerEntryReversalReviews()
      .then((result) => {
        if (current !== generation.current) return;
        setSupported(result.supported);
        // OM-22 c4: rejected (and pending) requests are not reversed entries.
        setReversals(approvedOnly(result.requests));
      })
      .catch((reason: unknown) => {
        if (current !== generation.current) return;
        console.error('Unable to load the Reversal Report.', reason);
        setError('Unable to load the Reversal Report. Please check your internet connection and try again.');
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
  };

  useEffect(() => {
    load();
    return () => {
      generation.current += 1;
      detailGeneration.current += 1;
    };
  }, []);

  const open = (row: OwnerEntryReversalReview) => {
    const current = ++detailGeneration.current;
    setSelectedId(row.id);
    setMovements(null);
    setMovementsError('');
    loadEntryReversalMovements(row.reference)
      .then((loaded) => {
        if (current === detailGeneration.current) setMovements(loaded);
      })
      .catch(() => {
        if (current === detailGeneration.current) setMovementsError('Unable to load the reversing entries.');
      });
  };

  const branchOptions = useOwnerBranchFilterOptions(reversals.map((row) => row.branchName));
  const rows = newestFirst(
    filterOwnerRecords(reversals, {
      branch,
      period,
      branchOf: (row) => row.branchName,
      dateOf: (row) => row.entryRecordedAt,
    }),
    (row) => row.decidedAt,
  );
  const selected = selectedId ? reversals.find((row) => row.id === selectedId) ?? null : null;

  const renderDetails = (row: OwnerEntryReversalReview) => {
    const details: Array<[string, string]> = [
      ['Entry type', entryReversalTypeLabel(row.entryType)],
      ['Original entry', row.entryReference],
      ['Item', row.itemName],
      ['Quantity', quantity(row.quantity, row.unit)],
      ['Branch', row.branchName],
      ['Entry recorded', dateTime(row.entryRecordedAt)],
      ['Reason', row.reason],
      ['Requested by', row.requestedByName ?? 'Staff account'],
      ['Requested', dateTime(row.requestedAt)],
      ['Approved by', row.decidedByName ?? 'Owner'],
      ['Approved', dateTime(row.decidedAt)],
      ['Reversal request', row.reference],
    ];
    return (
      <View style={styles.flex}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            {details.map(([label, value], index) => (
              <OwnerDetailRow key={label} label={label} value={value} multiline={label === 'Reason'} first={index === 0} last={index === details.length - 1} />
            ))}
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Reversing entries</Text>
            <Text style={styles.meta}>
              The original entry {row.entryReference} stays in the history; these Entry Reversal transactions undo it.
            </Text>
            {movementsError ? (
              <Text style={[styles.meta, { color: colors.error }]}>{movementsError}</Text>
            ) : movements === null ? (
              <ActivityIndicator color={colors.accent} />
            ) : movements.length === 0 ? (
              <Text style={styles.meta}>No reversing entries were found.</Text>
            ) : movements.map((movement) => (
              <View key={movement.id} style={styles.line}>
                <Text style={styles.lineLabel}>{movement.reference} · {movement.ingredientName}</Text>
                <Text style={styles.lineValue}>
                  {movement.movement > 0 ? '+' : '−'}{quantity(movement.quantity, movement.unit)}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
        <OwnerReadOnlyPill />
      </View>
    );
  };

  const renderList = () => {
    if (loading) return <OwnerLoadingState label="Loading reversed entries…" />;
    if (error) return <OwnerErrorState message={error} onRetry={load} />;
    if (!supported) {
      return (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>The Reversal Report is not available yet. The database needs the latest update.</Text>
        </View>
      );
    }
    return (
      <>
        <OwnerRecordFilterBar branchOptions={branchOptions} branch={branch} onBranchChange={setBranch} period={period} onPeriodChange={setPeriod} />
        {rows.length === 0 ? (
          <OwnerFilteredEmptyState branch={branch} period={period} note="There are no reversed entries for this selection." />
        ) : (
          <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {rows.map((row) => (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                accessibilityLabel={`${entryReversalTypeLabel(row.entryType)} ${row.itemName}, reversed`}
                onPress={() => open(row)}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{row.itemName}</Text>
                  <Text style={styles.amount}>{quantity(row.quantity, row.unit)}</Text>
                </View>
                <View style={styles.tagRow}>
                  <Text style={styles.tag}>{entryReversalTypeLabel(row.entryType)}</Text>
                  <Text style={styles.tag}>Reversed</Text>
                </View>
                <Text style={styles.meta}>{row.branchName} · {dateTime(row.entryRecordedAt)} · {row.entryReference}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </>
    );
  };

  return (
    <View style={styles.screen}>
      <OwnerHeader title={selected ? 'Reversed Entry' : 'Reversal Report'} onBack={selected ? () => setSelectedId(null) : onBack} />
      {selected ? renderDetails(selected) : renderList()}
    </View>
  );
}

function useStyles() {
  const theme = useTheme();
  return StyleSheet.create(createThemedStyles({
    screen: { flex: 1, minHeight: 520 },
    flex: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: OWNER_NAVIGATION_HEIGHT, gap: 8 },
    card: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile, gap: 4 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    cardTitle: { flex: 1, color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 },
    amount: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 },
    tagRow: { flexDirection: 'row', gap: 6 },
    tag: {
      color: theme.colors.salesRecordNavy, fontFamily: font.semibold, fontSize: 8, paddingHorizontal: 6, paddingVertical: 2,
      borderRadius: 4, backgroundColor: theme.colors.salesRecordCategoryTag, overflow: 'hidden',
    },
    meta: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 8, lineHeight: 12 },
    sectionTitle: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 },
    line: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 2 },
    lineLabel: { flex: 1, color: theme.colors.salesRecordNavy, fontFamily: font.regular, fontSize: 10 },
    lineValue: { color: theme.colors.salesRecordNavy, fontFamily: font.semibold, fontSize: 10 },
    notice: { margin: 20, padding: 12, borderRadius: 12, backgroundColor: theme.colors.surfaceSecondary },
    noticeText: { color: theme.colors.text, fontFamily: font.regular, fontSize: 10, lineHeight: 15 },
    pressed: { opacity: 0.82 },
  }, theme));
}
