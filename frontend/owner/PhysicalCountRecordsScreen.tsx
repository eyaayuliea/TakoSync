import React, { useEffect, useRef, useState } from 'react';
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
  const [records, setRecords] = useState<PhysicalCountRecord[]>([]);
  const [selected, setSelected] = useState<PhysicalCountRecord | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const requestId = useRef(0);

  const loadRecords = () => {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    setError(false);
    setRecords([]);
    if (inventoryLoading) return;
    if (inventoryError) {
      setError(true);
      setLoading(false);
      return;
    }
    if (branches.length === 0) {
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

  return (
    <View style={styles.screen}>
      <OwnerRecordHeader
        title={view === 'details' ? 'Count record details' : 'Physical count records'}
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
                { label: 'Count status', value: selected.countStatus },
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

            {selected.difference === 0 ? (
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
        <OwnerRecordErrorState onRetry={() => inventoryError || branches.length === 0 ? onRefresh() : loadRecords()} />
      ) : records.length === 0 ? (
        <OwnerRecordEmptyState />
      ) : (
        <ScrollView
          ref={listRef}
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onScroll={(event) => setScrollOffset(event.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
        >
          {records.map((record) => (
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
                <Text style={styles.pinIcon}>⌖</Text>
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
                <Text style={styles.chevron}>›</Text>
              </View>
              <View style={styles.statusRow}>
                <StatusChip label={record.countStatus} />
                {record.revision ? <StatusChip label="Corrected" /> : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function CountResultBadge({ result, compact = false }: { result: PhysicalCountResult; compact?: boolean }) {
  const styles = useStyles();
  const icon = result === 'Matches' ? '✓' : result === 'Higher than Expected' ? '↑' : '↓';
  return (
    <View style={[
      styles.resultBadge,
      result === 'Matches' ? styles.matchesBadge
        : result === 'Higher than Expected' ? styles.higherBadge : styles.lowerBadge,
      compact && styles.resultBadgeCompact,
    ]}>
      <Text style={[
        styles.resultIcon,
        result === 'Higher than Expected' && styles.resultIconDark,
        compact && styles.resultIconCompact,
      ]}>{icon}</Text>
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

function StatusChip({ label }: { label: 'Submitted' | 'Validated' | 'Corrected' }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[
      styles.statusChip,
      label === 'Submitted' ? styles.submittedChip
        : label === 'Validated' ? styles.validatedChip : styles.correctedChip,
    ]}>
      {label === 'Validated' ? (
        <OwnerMenuIcon name="check" color={colors.background} size={9} />
      ) : (
        <Text style={[
          styles.statusChipIcon,
          label === 'Corrected' && styles.correctedIcon,
        ]}>{label === 'Submitted' ? '◷' : '↻'}</Text>
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
      <Text style={styles.employeeHeading}>Submitted by (employee account)</Text>
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
        <Text numberOfLines={1} style={styles.discrepancyTitle}>View discrepancy details</Text>
        <Text numberOfLines={1} style={styles.discrepancyMeta}>
          {record.discrepancyReference ?? '—'} · {record.discrepancyStatus ?? 'Pending review'}
        </Text>
      </View>
      <Text style={styles.discrepancyChevron}>›</Text>
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
          <Text style={styles.revisionClock}>◷</Text>
          <Text style={styles.revisionTitle}>Revision history</Text>
        </View>
        <StatusChip label="Corrected" />
      </View>
      {[
        ['Original value', formatPhysicalCountQuantity(revision.originalValue, record.unit)],
        ['Revised value', formatPhysicalCountQuantity(revision.revisedValue, record.unit)],
        ['Editor', `${revision.editor} (employee account)`],
        ['Revision date', formatPhysicalCountDate(revision.date)],
      ].map(([label, value], index) => (
        <OwnerRecordDetailRow
          key={label}
          label={label}
          value={value}
          tone={label === 'Revised value' ? 'accent' : undefined}
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
