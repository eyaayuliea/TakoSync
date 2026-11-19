import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OWNER_NAVIGATION_HEIGHT } from '../navigation/BottomNavigation';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import { OwnerMenuIcon } from './OwnerMenuScreens';
import { OwnerRecordDetailRow, OwnerRecordEmptyState, OwnerRecordErrorState, OwnerRecordHeader, OwnerRecordLoadingState, OwnerRecordReadOnlyPill } from './shared/ownerComponents';
import { formatAuthorizedAdjustmentDateTime, formatAuthorizedAdjustmentQuantity, loadAuthorizedAdjustmentRecords, type AuthorizedAdjustmentRecord } from './authorizedAdjustmentRepository';

const font = { regular: 'Poppins_400Regular', semibold: 'Poppins_600SemiBold', bold: 'Poppins_700Bold' } as const;

export default function AuthorizedAdjustmentRecordsScreen({ onBack }: { onBack: () => void }) {
  const styles = useStyles(); const { colors } = useTheme(); const listRef = useRef<ScrollView>(null);
  const [view, setView] = useState<'list' | 'details'>('list'); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const [records, setRecords] = useState<AuthorizedAdjustmentRecord[]>([]); const [selected, setSelected] = useState<AuthorizedAdjustmentRecord | null>(null); const [scrollOffset, setScrollOffset] = useState(0);
  const requestId = useRef(0);
  const loadRecords = () => {
    const currentRequestId = ++requestId.current;
    setLoading(true); setError(false); setRecords([]);
    void loadAuthorizedAdjustmentRecords().then((loaded) => {
      if (currentRequestId !== requestId.current) return;
      setRecords(loaded); setLoading(false);
    }).catch((reason: unknown) => {
      if (currentRequestId !== requestId.current) return;
      console.error('Unable to load Authorized Adjustment records.', reason);
      setError(true); setLoading(false);
    });
  };
  useEffect(() => {
    loadRecords();
    return () => { requestId.current += 1; };
  }, []);
  const back = () => { if (view === 'details') { setView('list'); setSelected(null); requestAnimationFrame(() => listRef.current?.scrollTo({ y: scrollOffset, animated: false })); } else onBack(); };
  return <View style={styles.screen}>
    <OwnerRecordHeader title={view === 'details' ? 'Adjustment Details' : 'Authorized Adjustment Records'} onBack={back} />
    {view === 'details' && selected ? <View style={styles.detailsArea}><ScrollView style={styles.detailsScroll} contentContainerStyle={styles.detailsContent} showsVerticalScrollIndicator={false}>
      <View style={styles.detailCard}><View style={styles.detailHeader}><Text numberOfLines={1} style={styles.detailName}>{selected.ingredientName}</Text><StatusBadge /></View><View style={styles.detailDivider} />
        {[['Branch', selected.branchName], ['Previous expected quantity', formatAuthorizedAdjustmentQuantity(selected.previousExpectedQuantity, selected.unit)], ['Actual quantity', formatAuthorizedAdjustmentQuantity(selected.actualQuantity, selected.unit)], ['Adjusted quantity', formatAuthorizedAdjustmentQuantity(selected.adjustedQuantity, selected.unit)], ['Reason', selected.reason], ['Approving owner', selected.approvingOwner], ['Date & time', formatAuthorizedAdjustmentDateTime(selected.approvedAt)], ['Related discrepancy', selected.relatedDiscrepancy]].map(([label, value], index, rows) => <OwnerRecordDetailRow key={label} label={label} value={value} compact={index === 3 ? 'accent' : undefined} first={index === 0} last={index === rows.length - 1} />)}
      </View>
    </ScrollView><OwnerRecordReadOnlyPill /></View> : loading ? <OwnerRecordLoadingState /> : error ? <OwnerRecordErrorState onRetry={loadRecords} /> : records.length === 0 ? <OwnerRecordEmptyState /> : <ScrollView ref={listRef} style={styles.listScroll} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} onScroll={(event) => setScrollOffset(event.nativeEvent.contentOffset.y)} scrollEventThrottle={16}>
      {records.map((record) => <Pressable key={record.id} accessibilityRole="button" onPress={() => { setSelected(record); setView('details'); }} style={styles.adjustmentCard}><View style={styles.cardTop}><Text numberOfLines={1} style={styles.itemName}>{record.ingredientName}</Text><Text style={styles.adjustedQuantity}>{formatAuthorizedAdjustmentQuantity(record.adjustedQuantity, record.unit)}</Text></View><Text style={styles.comparison}>Previous expected {formatAuthorizedAdjustmentQuantity(record.previousExpectedQuantity, record.unit)} → Adjusted {formatAuthorizedAdjustmentQuantity(record.adjustedQuantity, record.unit)}</Text><View style={styles.branchLine}><OwnerMenuIcon name="mapPin" color={colors.salesRecordMuted} size={9} /><Text style={styles.branchText}>{record.branchName}</Text></View></Pressable>)}
    </ScrollView>}
  </View>;
}

function StatusBadge() { const { colors } = useTheme(); const styles = useStyles(); return <View style={styles.statusBadge}><OwnerMenuIcon name="check" color={colors.background} size={8} /><Text style={styles.statusText}>Validated</Text></View>; }

function useStyles() { const theme = useTheme(); return StyleSheet.create(createThemedStyles({
  screen: { flex: 1, minHeight: 520 }, listScroll: { flex: 1 }, listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: OWNER_NAVIGATION_HEIGHT, gap: 8 }, adjustmentCard: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile }, cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, itemName: { flex: 1, color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 }, adjustedQuantity: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 }, comparison: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 8, marginTop: 2 }, branchLine: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 4 }, branchText: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 8 }, detailsArea: { flex: 1 }, detailsScroll: { flex: 1 }, detailsContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }, detailCard: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile }, detailHeader: { minHeight: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, detailName: { flex: 1, color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 13 }, detailDivider: { height: 1, marginTop: 4, backgroundColor: theme.colors.salesRecordBorder }, statusBadge: { minHeight: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderRadius: 4, backgroundColor: theme.colors.salesRecordSuccess, gap: 3 }, statusText: { color: theme.colors.background, fontFamily: font.bold, fontSize: 7 },
}, theme)); }
