import React, { useEffect, useRef, useState } from 'react';
import OwnerRecordFilterBar, { OwnerFilteredEmptyState, useOwnerBranchFilterOptions } from './OwnerRecordFilterBar';
import { ALL_BRANCHES, filterOwnerRecords, type OwnerRecordPeriod } from './ownerRecordFilters';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OWNER_NAVIGATION_HEIGHT } from '../navigation/BottomNavigation';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import {
  OwnerRecordDetailRow,
  OwnerRecordEmptyState,
  OwnerRecordErrorState,
  OwnerRecordHeader,
  OwnerRecordLoadingState,
  OwnerRecordReadOnlyPill,
} from './shared/ownerComponents';
import { OwnerMenuIcon } from './OwnerMenuScreens';
import {
  formatPhysicalCountDate,
  formatPhysicalCountDateTime,
  formatPhysicalCountDifference,
  formatPhysicalCountQuantity,
  loadPhysicalCountRecords,
  type PhysicalCountBranch,
  type PhysicalCountRecord,
  type PhysicalCountResult,
} from './physicalCountRepository';
import { describeOwnerRecordError, type OwnerRecordErrorInfo } from './shared/ownerRecordErrors';
import AppIcon from '../theme/AppIcon';

const font = {
  regular: 'Poppins_400Regular',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export default function PhysicalCountRecordsScreen({
  onBack,
  branches,
  inventoryLoading,
  inventoryError,
  onRefresh,
  onOpenDiscrepancy,
}: {
  onBack: () => void;
  branches: PhysicalCountBranch[];
  inventoryLoading: boolean;
  inventoryError: string;
  onRefresh: () => void;
  onOpenDiscrepancy: (record: PhysicalCountRecord) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const listRef = useRef<ScrollView>(null);
  const [view, setView] = useState<'list' | 'details'>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorInfo, setErrorInfo] = useState<OwnerRecordErrorInfo | null>(null);
  const [records, setRecords] = useState<PhysicalCountRecord[]>([]);
  const [selected, setSelected] = useState<PhysicalCountRecord | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const requestId = useRef(0);

  const loadRecords = () => {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    setError(false);
    setErrorInfo(null);
    setRecords([]);
    if (inventoryLoading) return;
    if (inventoryError) {
      setErrorInfo(describeOwnerRecordError(inventoryError));
      setError(true);
      setLoading(false);
      return;
    }
    if (branches.length === 0) {
      setErrorInfo({ message: 'No active branches were returned, so Physical Count records cannot be loaded.', detail: null });
      setError(true);
      setLoading(false);
      onRefresh();
      return;
    }

    void loadPhysicalCountRecords(branches).then((loadedRecords) => {
      if (currentRequestId !== requestId.current) return;
      setRecords(loadedRecords);
      setLoading(false);
    }).catch((loadError: unknown) => {
      if (currentRequestId !== requestId.current) return;
      console.error('Unable to load Physical Count records.', loadError);
      setErrorInfo(describeOwnerRecordError(loadError));
      setError(true);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadRecords();
    return () => {
      requestId.current += 1;
    };
  }, [branches, inventoryError, inventoryLoading]);

  const back = () => {
    if (view === 'details') {
      setView('list');
      setSelected(null);
      requestAnimationFrame(() => listRef.current?.scrollTo({ y: scrollOffset, animated: false }));
    } else {
      onBack();
    }
  };

  const openDetails = (record: PhysicalCountRecord) => {
    setSelected(record);
    setView('details');
  };

  // OM-16 c3–c4: branch and date selectors for this list.
  const [recordBranch, setRecordBranch] = useState(ALL_BRANCHES);
  const [recordPeriod, setRecordPeriod] = useState<OwnerRecordPeriod>('All dates');
  const [recordStatus, setRecordStatus] = useState('All statuses');
  const branchOptions = useOwnerBranchFilterOptions(records.map((record) => record.branchName));
  const filteredRecords = filterOwnerRecords(records, {
    branch: recordBranch,
    period: recordPeriod,
    branchOf: (record) => record.branchName,
    dateOf: (record) => record.submittedAt,
  }).filter((record) => recordStatus === 'All statuses' || record.countStatus === recordStatus);
  const recordFilterBar = (
    <OwnerRecordFilterBar
      branchOptions={branchOptions}
      branch={recordBranch}
      onBranchChange={setRecordBranch}
      period={recordPeriod}
      onPeriodChange={setRecordPeriod}
      extra={{
        label: 'Status',
        options: ['All statuses', 'Draft', 'Submitted', 'Validated', 'Rejected for Recount'],
        selected: recordStatus,
        onChange: setRecordStatus,
      }}
    />
  );

  return (
    <View style={styles.screen}>
      <OwnerRecordHeader
        title={view === 'details' ? 'Count Record Details' : 'Physical Count Records'}
        onBack={back}
      />

      {view === 'details' && selected ? (
        <View style={styles.detailsArea}>
          <ScrollView
            style={styles.detailsScroll}
            contentContainerStyle={styles.detailsContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.detailCard}>
              <View style={styles.detailHeader}>
                <View style={styles.detailTitle}>
                  <Text style={styles.detailName}>{selected.ingredientName}</Text>
                  <Text style={styles.detailReference}>{selected.reference}</Text>
                </View>
                <CountResultBadge result={selected.result} />
              </View>
              <View style={styles.detailDivider} />
              {[
                { label: 'Item', value: selected.ingredientName },
                { label: 'Branch', value: selected.branchName },
                { label: 'Expected quantity', value: formatPhysicalCountQuantity(selected.expectedQuantity, selected.unit) },
                { label: 'Actual quantity', value: formatPhysicalCountQuantity(selected.actualQuantity, selected.unit) },
                {
                  label: 'Difference',
                  value: formatPhysicalCountDifference(selected.difference, selected.unit),
                  tone: selected.result === 'Matches' ? 'success' as const
                    : selected.result === 'Higher than Expected' ? 'warning' as const : 'critical' as const,
                },
                {
                  label: 'Count result',
                  value: selected.result,
                  tone: selected.result === 'Matches' ? 'success' as const
                    : selected.result === 'Higher than Expected' ? 'warning' as const : 'critical' as const,
                },
                // OM-20 c4: a validated count is locked.
                { label: 'Count status', value: selected.countStatus === 'Validated' ? 'Validated · Locked' : selected.countStatus === 'Draft' ? 'Draft · not submitted yet' : selected.countStatus },
                { label: 'Date & time', value: formatPhysicalCountDateTime(selected.submittedAt) },
              ].map(({ label, value, tone }, index) => (
                <OwnerRecordDetailRow
                  key={label}
                  label={label}
                  value={value}
                  tone={tone}
                  first={index === 0}
                />
              ))}
            </View>

            <SubmittedByCard record={selected} />

            {selected.countStatus === 'Draft' ? (
              <View style={styles.noDiscrepancy}>
                <Text style={styles.noDiscrepancyText}>Not submitted yet. A discrepancy is created only when staff submit the count.</Text>
              </View>
            ) : selected.difference === 0 ? (
              <View style={styles.noDiscrepancy}>
                <OwnerMenuIcon name="check" color={colors.salesRecordMuted} size={12} />
                <Text style={styles.noDiscrepancyText}>No discrepancy for this count.</Text>
              </View>
            ) : (
              <DiscrepancyLinkCard
                record={selected}
                onPress={() => onOpenDiscrepancy(selected)}
              />
            )}

            {selected.revision ? <RevisionHistoryCard record={selected} /> : null}
          </ScrollView>
          <OwnerRecordReadOnlyPill />
        </View>
      ) : loading ? (
        <OwnerRecordLoadingState />
      ) : error ? (
        <OwnerRecordErrorState message={errorInfo?.message} detail={errorInfo?.detail} onRetry={() => inventoryError || branches.length === 0 ? onRefresh() : loadRecords()} />
      ) : records.length === 0 ? (
        <OwnerRecordEmptyState />
      ) : (
        <>
          {recordFilterBar}
          {filteredRecords.length === 0 ? (
            <OwnerFilteredEmptyState branch={recordBranch} period={recordPeriod} />
          ) : (
        <ScrollView
          ref={listRef}
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onScroll={(event) => setScrollOffset(event.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
        >
          {filteredRecords.map((record) => (
            <Pressable
              key={record.id}
              accessibilityRole="button"
              onPress={() => openDetails(record)}
              style={styles.countCard}
            >
              <View style={styles.cardHeader}>
                <Text numberOfLines={1} style={styles.ingredientName}>{record.ingredientName}</Text>
                <CountResultBadge result={record.result} compact />
              </View>
              <View style={styles.cardMeta}>
                <AppIcon name="location" style={styles.pinIcon} />
                <Text style={styles.dateText}>
                  {record.branchName} · {formatPhysicalCountDateTime(record.submittedAt)}
                </Text>
              </View>
              <View style={styles.cardDivider} />
              <View style={styles.quantityRow}>
                <QuantityColumn label="Expected" value={formatPhysicalCountQuantity(record.expectedQuantity, record.unit)} />
                <QuantityColumn label="Actual" value={formatPhysicalCountQuantity(record.actualQuantity, record.unit)} />
                <QuantityColumn
                  label="Difference"
                  value={formatPhysicalCountDifference(record.difference, record.unit)}
                  tone={record.result === 'Matches' ? 'success'
                    : record.result === 'Higher than Expected' ? 'warning' : 'critical'}
                />
                <AppIcon name="forward" style={styles.chevron} />
              </View>
              <View style={styles.statusRow}>
                <StatusChip label={record.countStatus} />
                {record.revision ? <StatusChip label="Corrected" /> : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

function CountResultBadge({ result, compact = false }: { result: PhysicalCountResult; compact?: boolean }) {
  const styles = useStyles();
  const icon = result === 'Matches' ? 'check' as const : result === 'Higher than Expected' ? 'higher' as const : 'lower' as const;
  return (
    <View style={[
      styles.resultBadge,
      result === 'Matches' ? styles.matchesBadge
        : result === 'Higher than Expected' ? styles.higherBadge : styles.lowerBadge,
      compact && styles.resultBadgeCompact,
    ]}>
      <AppIcon
        name={icon}
        style={[
          styles.resultIcon,
          result === 'Higher than Expected' && styles.resultIconDark,
          compact && styles.resultIconCompact,
        ]}
      />
      <Text
        numberOfLines={1}
        style={[
          styles.resultText,
          result === 'Higher than Expected' && styles.resultTextDark,
          compact && styles.resultTextCompact,
        ]}
      >
        {result}
      </Text>
    </View>
  );
}

function QuantityColumn({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'critical' | 'success' | 'warning';
}) {
  const styles = useStyles();
  return (
    <View style={styles.quantityColumn}>
      <Text style={styles.quantityLabel}>{label}</Text>
      <Text style={[
        styles.quantityValue,
        tone === 'critical' && styles.criticalValue,
        tone === 'success' && styles.successValue,
        tone === 'warning' && styles.warningValue,
      ]}>{value}</Text>
    </View>
  );
}

function StatusChip({ label }: { label: 'Draft' | 'Submitted' | 'Validated' | 'Corrected' | 'Rejected for Recount' }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[
      styles.statusChip,
      label === 'Submitted' || label === 'Draft' ? styles.submittedChip
        : label === 'Validated' ? styles.validatedChip : styles.correctedChip,
    ]}>
      {label === 'Validated' ? (
        <OwnerMenuIcon name="check" color={colors.background} size={9} />
      ) : (
        <AppIcon
          name={label === 'Draft' ? 'edit' : label === 'Submitted' ? 'pending' : 'refresh'}
          style={[styles.statusChipIcon, label === 'Corrected' && styles.correctedIcon]}
        />
      )}
      <Text style={[
        styles.statusChipText,
        label === 'Validated' && styles.validatedText,
        label === 'Corrected' && styles.correctedText,
      ]}>{label}</Text>
    </View>
  );
}

function SubmittedByCard({ record }: { record: PhysicalCountRecord }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const initials = record.submittedBy.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
  const showContact = Boolean(record.email);
  return (
    <View style={styles.employeeCard}>
      <Text style={styles.employeeHeading}>{record.countStatus === 'Draft' ? 'Saved by (employee account)' : 'Submitted by (employee account)'}</Text>
      <View style={styles.employeeLine}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={styles.employeeCopy}>
          <Text numberOfLines={1} style={styles.employeeName}>{record.submittedBy}</Text>
          <Text numberOfLines={1} style={styles.employeeMeta}>
            Employee account{record.employeeId ? ` · ${record.employeeId}` : ''}
          </Text>
        </View>
      </View>
      {showContact ? (
        <>
          <View style={styles.employeeDivider} />
          <View style={styles.contactLine}>
            <OwnerMenuIcon name="profile" color={colors.salesRecordMuted} size={12} />
            <View style={styles.contactCopy}>
              <Text style={styles.employeeEmail}>{record.email}</Text>
              <Text style={styles.employeeMeta}>Role: Employee · {record.branchName}</Text>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

function DiscrepancyLinkCard({
  record,
  onPress,
}: {
  record: PhysicalCountRecord;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.discrepancyCard}>
      <View style={styles.warningIconCircle}><Text style={styles.warningIcon}>!</Text></View>
      <View style={styles.discrepancyCopy}>
        <Text numberOfLines={1} style={styles.discrepancyTitle}>View Discrepancy Details</Text>
        <Text numberOfLines={1} style={styles.discrepancyMeta}>
          {record.discrepancyReference ?? '—'} · {record.discrepancyStatus ?? 'Pending Review'}
        </Text>
      </View>
      <AppIcon name="forward" style={styles.discrepancyChevron} />
    </Pressable>
  );
}

function RevisionHistoryCard({ record }: { record: PhysicalCountRecord }) {
  const styles = useStyles();
  const revision = record.revision;
  if (!revision) return null;
  return (
    <View style={styles.revisionCard}>
      <View style={styles.revisionHeader}>
        <View style={styles.revisionTitleLine}>
          <AppIcon name="pending" style={styles.revisionClock} />
          <Text style={styles.revisionTitle}>Revision History</Text>
        </View>
        <StatusChip label="Corrected" />
      </View>
      {[
        ['Original Value', formatPhysicalCountQuantity(revision.originalValue, record.unit)],
        ['Revised Value', formatPhysicalCountQuantity(revision.revisedValue, record.unit)],
        ['Editor', `${revision.editor} (employee account)`],
        ['Revision Date', formatPhysicalCountDate(revision.date)],
      ].map(([label, value], index) => (
        <OwnerRecordDetailRow
          key={label}
          label={label}
          value={value}
          tone={label === 'Revised Value' ? 'accent' : undefined}
          first={index === 0}
        />
      ))}
    </View>
  );
}

function useStyles() {
  const theme = useTheme();
  return StyleSheet.create(createThemedStyles({
    screen: { flex: 1, minHeight: 520 },
    listScroll: { flex: 1 },
    listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: OWNER_NAVIGATION_HEIGHT, gap: 8 },
    countCard: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile },
    cardHeader: { minHeight: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    ingredientName: { flex: 1, flexShrink: 1, color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 },
    cardMeta: { minHeight: 17, flexDirection: 'row', alignItems: 'center', marginTop: 2 },
    pinIcon: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 9, marginRight: 4 },
    dateText: { flexShrink: 1, color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 8 },
    cardDivider: { height: 1, marginTop: 3, marginBottom: 5, backgroundColor: theme.colors.salesRecordBorder },
    quantityRow: { flexDirection: 'row', alignItems: 'center' },
    quantityColumn: { flex: 1, minWidth: 0 },
    quantityLabel: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 8 },
    quantityValue: { marginTop: 1, color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 },
    criticalValue: { color: theme.colors.physicalCountBerry },
    successValue: { color: theme.colors.salesRecordSuccess },
    warningValue: { color: theme.colors.physicalCountOrange },
    chevron: { width: 14, color: theme.colors.salesRecordCategoryTag, fontFamily: font.regular, fontSize: 19, textAlign: 'right' },
    statusRow: { minHeight: 18, flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
    resultBadge: { minHeight: 22, maxWidth: '58%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 4 },
    resultBadgeCompact: { minHeight: 18, maxWidth: '60%', paddingHorizontal: 6 },
    matchesBadge: { backgroundColor: theme.colors.salesRecordSuccess },
    lowerBadge: { backgroundColor: theme.colors.physicalCountRed },
    higherBadge: { backgroundColor: theme.colors.physicalCountOrange },
    resultIcon: { color: theme.colors.background, fontFamily: font.bold, fontSize: 9, marginRight: 4 },
    resultIconDark: { color: theme.colors.salesRecordNavy },
    resultIconCompact: { fontSize: 8, marginRight: 3 },
    resultText: { color: theme.colors.background, fontFamily: font.semibold, fontSize: 8 },
    resultTextDark: { color: theme.colors.salesRecordNavy },
    resultTextCompact: { fontSize: 7 },
    statusChip: { minHeight: 17, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderRadius: 4 },
    submittedChip: { backgroundColor: theme.colors.physicalCountYellow },
    validatedChip: { backgroundColor: theme.colors.salesRecordSuccess },
    correctedChip: { borderWidth: 1, borderColor: theme.colors.salesRecordCrimson, backgroundColor: theme.colors.background },
    statusChipIcon: { color: theme.colors.salesRecordNavy, fontFamily: font.semibold, fontSize: 8, marginRight: 3 },
    correctedIcon: { color: theme.colors.salesRecordCrimson },
    correctedText: { color: theme.colors.salesRecordCrimson },
    statusChipText: { color: theme.colors.salesRecordNavy, fontFamily: font.semibold, fontSize: 8 },
    validatedIcon: { color: theme.colors.background },
    validatedText: { color: theme.colors.background },
    detailsArea: { flex: 1 },
    detailsScroll: { flex: 1 },
    detailsContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, gap: 8 },
    detailCard: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile },
    detailHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    detailTitle: { flex: 1, minWidth: 0 },
    detailName: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 13 },
    detailReference: { marginTop: 1, color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 9 },
    detailDivider: { height: 1, marginTop: 4, marginBottom: 1, backgroundColor: theme.colors.salesRecordBorder },
    employeeCard: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile },
    employeeHeading: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 9 },
    employeeLine: { minHeight: 36, flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    avatar: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: theme.colors.salesRecordNavy },
    avatarText: { color: theme.colors.background, fontFamily: font.bold, fontSize: 10 },
    employeeCopy: { flex: 1, minWidth: 0, marginLeft: 8 },
    employeeName: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 },
    employeeMeta: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 8 },
    employeeDivider: { height: 1, marginTop: 6, marginBottom: 7, backgroundColor: theme.colors.salesRecordBorder },
    contactLine: { flexDirection: 'row', alignItems: 'flex-start' },
    contactCopy: { flex: 1, minWidth: 0, marginLeft: 6 },
    contactIcon: { color: theme.colors.salesRecordMuted },
    employeeEmail: { color: theme.colors.salesRecordNavy, fontFamily: font.regular, fontSize: 9 },
    noDiscrepancy: { minHeight: 22, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
    checkIcon: { color: theme.colors.salesRecordMuted },
    noDiscrepancyText: { marginLeft: 6, color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 9 },
    discrepancyCard: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: theme.colors.salesRecordCrimson, borderRadius: 12, backgroundColor: theme.colors.background },
    warningIconCircle: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: theme.colors.salesRecordLavender },
    warningIcon: { color: theme.colors.salesRecordCrimson, fontFamily: font.bold, fontSize: 15 },
    discrepancyCopy: { flex: 1, minWidth: 0, marginLeft: 8 },
    discrepancyTitle: { color: theme.colors.salesRecordCrimson, fontFamily: font.bold, fontSize: 10 },
    discrepancyMeta: { marginTop: 2, color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 8 },
    discrepancyChevron: { marginLeft: 5, color: theme.colors.salesRecordCrimson, fontFamily: font.bold, fontSize: 18 },
    revisionCard: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile },
    revisionHeader: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
    revisionTitleLine: { flexDirection: 'row', alignItems: 'center' },
    revisionClock: { color: theme.colors.salesRecordCrimson, fontFamily: font.semibold, fontSize: 15, marginRight: 6 },
    revisionTitle: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 },
  }, theme));
}
