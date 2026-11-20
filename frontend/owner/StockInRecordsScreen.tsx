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
import {
  formatStockInDateTime,
  formatStockInExpirationDate,
  formatStockInQuantity,
  loadStockInRecords,
  type StockInBatch,
  type StockInBranch,
  type StockInRecord,
} from './stockInRepository';
import { describeOwnerRecordError, type OwnerRecordErrorInfo } from './shared/ownerRecordErrors';

type StockInInventoryData = {
  branches: StockInBranch[];
  batches: StockInBatch[];
};

const font = {
  regular: 'Poppins_400Regular',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export default function StockInRecordsScreen({
  onBack,
  inventoryData,
  inventoryLoading,
  inventoryError,
  onRefresh,
}: {
  onBack: () => void;
  inventoryData: StockInInventoryData | null;
  inventoryLoading: boolean;
  inventoryError: string;
  onRefresh: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const listRef = useRef<ScrollView>(null);
  const [view, setView] = useState<'list' | 'details'>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorInfo, setErrorInfo] = useState<OwnerRecordErrorInfo | null>(null);
  const [records, setRecords] = useState<StockInRecord[]>([]);
  const [selected, setSelected] = useState<StockInRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const requestId = useRef(0);

  const loadFirst = () => {
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
    if (!inventoryData) {
      setErrorInfo({ message: 'Inventory data has not loaded yet. Retrying…', detail: null });
      setError(true);
      setLoading(false);
      onRefresh();
      return;
    }
    if (inventoryData.branches.length === 0) {
      setErrorInfo({ message: 'No active branches were returned, so Stock-In records cannot be loaded.', detail: null });
      setError(true);
      setLoading(false);
      return;
    }

    void loadStockInRecords(inventoryData.branches, inventoryData.batches).then((loadedRecords) => {
      if (currentRequestId !== requestId.current) return;
      setRecords(loadedRecords);
      setLoading(false);
    }).catch((loadError: unknown) => {
      if (currentRequestId !== requestId.current) return;
      console.error('Unable to load Stock-In records.', loadError);
      setErrorInfo(describeOwnerRecordError(loadError));
      setError(true);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadFirst();
    return () => {
      requestId.current += 1;
    };
  }, [inventoryData, inventoryError, inventoryLoading]);

  const openDetails = (record: StockInRecord) => {
    setSelected(record);
    setView('details');
    setDetailLoading(true);
    setDetailError(false);
    const current = records.find((item) => item.id === record.id) ?? null;
    setSelected(current);
    setDetailError(!current);
    setDetailLoading(false);
  };

  const back = () => {
    if (view === 'details') {
      setView('list');
      requestAnimationFrame(() => listRef.current?.scrollTo({ y: scrollOffset, animated: false }));
    } else {
      onBack();
    }
  };

  return (
    <View style={styles.screen}>
      <OwnerRecordHeader title={view === 'details' ? 'Stock-in details' : 'Stock-in records'} onBack={back} />

      {view === 'details' ? (
        detailLoading ? (
          <OwnerRecordLoadingState />
        ) : detailError || !selected ? (
          <OwnerRecordErrorState onRetry={() => selected && openDetails(selected)} />
        ) : (
          <View style={styles.detailsArea}>
            <ScrollView
              style={styles.detailsScroll}
              contentContainerStyle={styles.detailsContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.detailCard}>
                <View style={styles.detailHeader}>
                  <Text style={styles.recordId}>{selected.reference}</Text>
                  <StockInStatusBadge />
                </View>
                <View style={styles.detailHeaderDivider} />
                {[
                  { label: 'Ingredient', value: selected.ingredientName },
                  { label: 'Quantity', value: formatStockInQuantity(selected), tone: 'success' as const },
                  { label: 'Branch', value: selected.branchName },
                  { label: 'Date & time', value: formatStockInDateTime(selected.createdAt) },
                  { label: 'Expiration date', value: selected.expirationDate ? formatStockInExpirationDate(selected.expirationDate) : '—' },
                  { label: 'Supplier / reference', value: selected.supplierReference || '—' },
                  { label: 'Recorded by', value: selected.recordedBy },
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
            </ScrollView>
            <OwnerRecordReadOnlyPill />
          </View>
        )
      ) : loading ? (
        <OwnerRecordLoadingState />
      ) : error ? (
        <OwnerRecordErrorState message={errorInfo?.message} detail={errorInfo?.detail} onRetry={inventoryError || !inventoryData ? onRefresh : loadFirst} />
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
              style={styles.recordCard}
            >
              <View style={styles.cardTop}>
                <Text numberOfLines={1} style={styles.ingredientName}>{record.ingredientName}</Text>
                <Text style={styles.quantity}>{formatStockInQuantity(record)}</Text>
              </View>
              <Text style={styles.recordDate}>Stock-in · {formatStockInDateTime(record.createdAt)}</Text>
              <View style={styles.cardBottom}>
                <View style={styles.branchLine}>
                  <Text style={styles.pinIcon}>⌖</Text>
                  <Text style={styles.branchName}>{record.branchName}</Text>
                </View>
                <StockInStatusBadge />
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function StockInStatusBadge() {
  const styles = useStyles();
  return (
    <View style={styles.statusBadge}>
      <Text style={styles.statusCheck}>✓</Text>
      <Text style={styles.statusText}>Stock-in</Text>
    </View>
  );
}

function useStyles() {
  const theme = useTheme();
  return StyleSheet.create(createThemedStyles({
    screen: { flex: 1, minHeight: 520 },
    listScroll: { flex: 1 },
    listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: OWNER_NAVIGATION_HEIGHT, gap: 8 },
    recordCard: { minHeight: 58, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    ingredientName: { flexShrink: 1, color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 },
    quantity: { color: theme.colors.salesRecordSuccess, fontFamily: font.bold, fontSize: 11 },
    recordDate: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 8, marginTop: 2 },
    cardBottom: { minHeight: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 },
    branchLine: { flexDirection: 'row', alignItems: 'center' },
    pinIcon: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 8, marginRight: 3 },
    branchName: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 8 },
    statusBadge: { minHeight: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderRadius: 5, backgroundColor: theme.colors.salesRecordSuccess },
    statusCheck: { color: theme.colors.background, fontFamily: font.bold, fontSize: 7, marginRight: 3 },
    statusText: { color: theme.colors.background, fontFamily: font.semibold, fontSize: 7 },
    detailsArea: { flex: 1 },
    detailsScroll: { flex: 1 },
    detailsContent: { paddingHorizontal: 20, paddingTop: 8 },
    detailCard: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.colors.salesRecordTile },
    detailHeader: { minHeight: 20, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    recordId: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 13 },
    detailHeaderDivider: { height: 1, backgroundColor: theme.colors.salesRecordBorder, marginTop: 5 },
  }, theme));
}
