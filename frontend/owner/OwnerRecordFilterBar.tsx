import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { OwnerTabs } from './shared/ownerComponents';
import { loadOwnerBranchLabels } from '../services/takosync';
import {
  OWNER_RECORD_PERIODS,
  branchFilterOptions,
  filteredEmptyMessage,
  type OwnerRecordPeriod,
} from './ownerRecordFilters';

const font = { regular: 'Poppins_400Regular', semibold: 'Poppins_600SemiBold' } as const;

let cachedBranchLabels: string[] | null = null;

/** All Branches plus every active branch, even ones without records yet (OM-16 c3). */
export function useOwnerBranchFilterOptions(recordBranchNames: string[]): string[] {
  const [loaded, setLoaded] = useState<string[]>(cachedBranchLabels ?? []);
  useEffect(() => {
    if (cachedBranchLabels) return;
    let active = true;
    loadOwnerBranchLabels()
      .then((labels) => {
        cachedBranchLabels = labels;
        if (active) setLoaded(labels);
      })
      .catch(() => undefined); // The records' own branches are still offered.
    return () => {
      active = false;
    };
  }, []);
  const key = recordBranchNames.join('|');
  return useMemo(() => branchFilterOptions([...loaded, ...recordBranchNames]), [loaded, key]);
}

/**
 * OM-16 c3–c4: branch and date selectors for an inventory record list, plus an
 * optional extra selector (category or status) for the lists that need one.
 */
export default function OwnerRecordFilterBar({
  branchOptions,
  branch,
  onBranchChange,
  period,
  onPeriodChange,
  showPeriod = true,
  extra,
}: {
  branchOptions: string[];
  branch: string;
  onBranchChange: (branch: string) => void;
  period: OwnerRecordPeriod;
  onPeriodChange: (period: OwnerRecordPeriod) => void;
  showPeriod?: boolean;
  extra?: { label: string; options: readonly string[]; selected: string; onChange: (value: string) => void };
}) {
  return (
    <View style={styles.bar} accessibilityLabel="Record filters">
      <OwnerTabs items={branchOptions} selected={branch} onSelect={onBranchChange} />
      {showPeriod ? (
        <OwnerTabs items={OWNER_RECORD_PERIODS} selected={period} onSelect={(value) => onPeriodChange(value as OwnerRecordPeriod)} />
      ) : null}
      {extra ? <OwnerTabs items={extra.options} selected={extra.selected} onSelect={extra.onChange} /> : null}
    </View>
  );
}

/** Empty state for a filtered list that names the selection (OM-16 c6). */
export function OwnerFilteredEmptyState({
  branch,
  period,
  note,
  action,
}: {
  branch: string;
  period: OwnerRecordPeriod;
  note?: string;
  /** e.g. load older pages when only some records are loaded. */
  action?: { label: string; onPress: () => void } | null;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{filteredEmptyMessage(branch, period)}</Text>
      <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
        {note ?? 'Choose another branch or period to see more records.'}
      </Text>
      {action ? <OwnerLoadOlderButton label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 20, paddingTop: 6, gap: 6 },
  empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 6 },
  emptyTitle: { fontFamily: font.semibold, fontSize: 12, textAlign: 'center' },
  emptyText: { fontFamily: font.regular, fontSize: 10, lineHeight: 15, textAlign: 'center' },
  loadOlder: { marginTop: 8, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  loadOlderText: { fontFamily: font.semibold, fontSize: 10 },
});

export function OwnerLoadOlderButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={[styles.loadOlder, { borderColor: colors.border }]}>
      <Text style={[styles.loadOlderText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}
