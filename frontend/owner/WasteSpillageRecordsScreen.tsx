import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OWNER_NAVIGATION_HEIGHT } from '../navigation/BottomNavigation';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import { OwnerMenuIcon } from './OwnerMenuScreens';
import {
  OwnerRecordDetailRow,
  OwnerRecordEmptyState,
  OwnerRecordErrorState,
  OwnerRecordHeader,
  OwnerRecordLoadingState,
  OwnerRecordPaginationFooter,
  OwnerRecordReadOnlyPill,
} from './shared/ownerComponents';
export {
  OwnerRecordDetailRow,
  OwnerRecordEmptyState,
  OwnerRecordErrorState,
  OwnerRecordHeader,
  OwnerRecordLoadingState,
  OwnerRecordPaginationFooter,
  OwnerRecordReadOnlyPill,
} from './shared/ownerComponents';
import { pageSize } from './salesConsumptionRepository';
import {
  formatWasteSpillageDateTime,
  formatWasteSpillageQuantity,
  loadWasteSpillageRecords,
  WASTE_SPILLAGE_CATEGORY_LABELS,
  type WasteSpillageRecord,
} from './wasteSpillageRepository';
import { describeOwnerRecordError, type OwnerRecordErrorInfo } from './shared/ownerRecordErrors';

const font = {
  regular: 'Poppins_400Regular',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export default function WasteSpillageRecordsScreen({
  onBack,
  branches,
  inventoryLoading,
  inventoryError,
  onRefresh,
}: {
  onBack: () => void;
  branches: { id: string; name: string }[];
  inventoryLoading: boolean;
  inventoryError: string;
  onRefresh: () => void;
}) {
  const { colors: themeColors } = useTheme();
  const styles = useStyles();
  const listRef = useRef<ScrollView>(null);
  const [view, setView] = useState<'list' | 'details'>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorInfo, setErrorInfo] = useState<OwnerRecordErrorInfo | null>(null);
  const [items, setItems] = useState<WasteSpillageRecord[]>([]);
  const [loadedPages, setLoadedPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [selected, setSelected] = useState<WasteSpillageRecord | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const loadingMoreRef = useRef(false);
  const requestId = useRef(0);

  const loadFirst = () => {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    setError(false);
    setErrorInfo(null);
    setItems([]);
    setLoadedPages(1);
    setLoadingMore(false);
    loadingMoreRef.current = false;
    if (inventoryLoading) return;
    if (inventoryError) {
      setErrorInfo(describeOwnerRecordError(inventoryError));
      setError(true);
      setLoading(false);
      return;
    }
    if (branches.length === 0) {
      setErrorInfo({ message: 'No active branches were returned, so Waste and Spillage records cannot be loaded.', detail: null });
      setError(true);
      setLoading(false);
      onRefresh();
      return;
    }
    void loadWasteSpillageRecords(branches).then((loadedRecords) => {
      if (currentRequestId !== requestId.current) return;
      setItems(loadedRecords);
      setLoading(false);
    }).catch((loadError: unknown) => {
      if (currentRequestId !== requestId.current) return;
      console.error('Unable to load Waste and Spillage records.', loadError);
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
  }, [branches, inventoryError, inventoryLoading]);

  const openDetails = (id: string) => {
    setSelectedId(id);
    setView('details');
    setDetailLoading(true);
    setDetailError(false);
    const record = items.find((item) => item.id === id) ?? null;
    setSelected(record);
    setDetailError(!record);
    setDetailLoading(false);
  };

  const loadMore = () => {
    if (loadingMoreRef.current || items.length === 0) return;
    if (loadedPages * pageSize >= items.length) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadedPages((value) => Math.min(value + 1, Math.ceil(items.length / pageSize)));
    requestAnimationFrame(() => {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    });
  };

  const visibleItems = items.slice(0, loadedPages * pageSize);

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
      <OwnerRecordHeader
        title={view === 'details' ? 'Waste Record Details' : 'Waste and Spillage Records'}
        onBack={back}
      />

      {view === 'details' ? (
        detailLoading ? (
          <OwnerRecordLoadingState />
        ) : detailError || !selected ? (
          <OwnerRecordErrorState onRetry={() => openDetails(selectedId || '')} />
        ) : (
          <View style={styles.detailsArea}>
            <ScrollView
              style={styles.detailsScroll}
              contentContainerStyle={styles.detailsContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.detailCard}>
                <Text style={styles.recordId}>{selected.recordReference}</Text>
                {[
                  ['Ingredient', selected.ingredientName],
                  ['Quantity lost', formatWasteSpillageQuantity(selected)],
                  ['Category', WASTE_SPILLAGE_CATEGORY_LABELS[selected.category]],
                  ['Branch', selected.branchName],
                  ['Date & time', formatWasteSpillageDateTime(selected.createdAt)],
                  ['Remarks', selected.remarks.trim() || '—'],
                  ['Recorded by', selected.recordedBy],
                ].map(([label, value]) => (
                  <OwnerRecordDetailRow
                    key={label}
                    label={label}
                    value={value}
                    tone={label === 'Quantity lost' ? 'red' : undefined}
                    multiline={label === 'Remarks'}
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
        <OwnerRecordErrorState message={errorInfo?.message} detail={errorInfo?.detail} onRetry={inventoryError || branches.length === 0 ? onRefresh : loadFirst} />
      ) : items.length === 0 ? (
        <OwnerRecordEmptyState />
      ) : (
        <ScrollView
          ref={listRef}
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onScroll={(event) => {
            const offset = event.nativeEvent.contentOffset.y;
            setScrollOffset(offset);
            const end = event.nativeEvent.layoutMeasurement.height + offset;
            if (event.nativeEvent.contentSize.height - end < 56) loadMore();
          }}
          scrollEventThrottle={16}
        >
          {visibleItems.map((record) => (
            <Pressable
              key={record.id}
              accessibilityRole="button"
              onPress={() => openDetails(record.id)}
              style={styles.tile}
            >
              <View style={styles.tileTop}>
                <Text numberOfLines={1} style={styles.ingredientName}>{record.ingredientName}</Text>
                <Text style={styles.quantity}>{formatWasteSpillageQuantity(record)}</Text>
              </View>
              <Text style={styles.tileDate}>{formatWasteSpillageDateTime(record.createdAt)}</Text>
              <View style={styles.tileBottom}>
                <View style={styles.branchLine}>
                  <Text style={styles.pinIcon}>⌖</Text>
                  <Text style={styles.tileBranch}>{record.branchName}</Text>
                </View>
                <WasteCategoryTag category={WASTE_SPILLAGE_CATEGORY_LABELS[record.category]} />
              </View>
            </Pressable>
          ))}
          <OwnerRecordPaginationFooter
            loadingMore={loadingMore}
            loadMoreError={false}
            onRetry={loadMore}
          />
        </ScrollView>
      )}
    </View>
  );
}

function WasteCategoryTag({ category }: { category: string }) {
  const styles = useStyles();
  return (
    <View style={styles.categoryTag}>
      <Text style={styles.categoryTagText}>{category}</Text>
    </View>
  );
}

function useStyles() {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(createThemedStyles({
    screen: { flex: 1, minHeight: 520 },
    header: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
    backButton: { width: 24, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
    backChevron: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 24, lineHeight: 28 },
    headerTitle: { flex: 1, color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 16 },
    loadingCenter: { minHeight: 300, flex: 1, alignItems: 'center', justifyContent: 'center' },
    spinner: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    spinnerTrack: { ...StyleSheet.absoluteFillObject, borderWidth: 3, borderRadius: 14 },
    loadingText: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 10, marginTop: 8 },
    errorCenter: { minHeight: 300, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    wifiOffIcon: { width: 34, height: 34, marginBottom: 10 },
    wifiArc: { position: 'absolute', alignSelf: 'center', backgroundColor: 'transparent', borderTopWidth: 1.8, borderLeftWidth: 1.8, borderRightWidth: 1.8 },
    wifiArcTop: { top: 3, width: 30, height: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
    wifiArcMiddle: { top: 9, width: 21, height: 12, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
    wifiArcBottom: { top: 15, width: 11, height: 8, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
    wifiSlash: { position: 'absolute', top: 4, left: 16, width: 2, height: 31, borderRadius: 1, transform: [{ rotate: '-43deg' }] },
    errorText: { maxWidth: 220, color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 11, lineHeight: 16, textAlign: 'center' },
    retryButton: { minWidth: 120, minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.salesRecordCrimson, backgroundColor: theme.colors.background },
    retryIcon: { color: theme.colors.salesRecordCrimson, fontFamily: font.semibold, fontSize: 11, marginRight: 6 },
    retryText: { color: theme.colors.salesRecordCrimson, fontFamily: font.bold, fontSize: 10 },
    emptyState: { minHeight: 300, flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyCircle: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, marginBottom: 10, backgroundColor: theme.colors.salesRecordLavender },
    emptyTitle: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11, textAlign: 'center' },
    emptySubtext: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 9, textAlign: 'center', marginTop: 4 },
    listScroll: { flex: 1 },
    listContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: OWNER_NAVIGATION_HEIGHT, gap: 8 },
    tile: { minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: theme.colors.salesRecordGray },
    tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    ingredientName: { flexShrink: 1, color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 },
    quantity: { color: theme.colors.salesRecordRed, fontFamily: font.bold, fontSize: 11 },
    tileDate: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 8, marginTop: 2 },
    tileBottom: { minHeight: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 },
    branchLine: { flexDirection: 'row', alignItems: 'center' },
    pinIcon: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 8, marginRight: 3 },
    tileBranch: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 8 },
    categoryTag: { minHeight: 14, justifyContent: 'center', paddingHorizontal: 6, borderRadius: 4, backgroundColor: theme.colors.salesRecordCategoryTag },
    categoryTagText: { color: theme.colors.salesRecordNavy, fontFamily: font.semibold, fontSize: 7, lineHeight: 9 },
    loadingMore: { height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
    loadingMoreText: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 9 },
    loadMoreRetry: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
    loadMoreRetryText: { color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 9 },
    detailsArea: { flex: 1 },
    detailsScroll: { flex: 1 },
    detailsContent: { paddingHorizontal: 20, paddingTop: 8 },
    detailCard: { paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, backgroundColor: theme.colors.salesRecordGray },
    recordId: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 13, paddingBottom: 8 },
    detailRow: { minHeight: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: theme.colors.salesRecordBorder },
    compactDetailRow: { minHeight: 29 },
    detailRowLast: { borderTopWidth: 0 },
    detailRowFirst: { borderTopWidth: 0 },
    remarksRow: { alignItems: 'flex-start', paddingVertical: 6 },
    detailLabel: { flexShrink: 0, color: theme.colors.salesRecordMuted, fontFamily: font.regular, fontSize: 9 },
    detailValue: { flex: 1, flexShrink: 1, marginLeft: 8, color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 9, textAlign: 'right' },
    detailQuantity: { color: theme.colors.salesRecordRed },
    detailCritical: { color: theme.colors.physicalCountBerry },
    detailSuccess: { color: theme.colors.salesRecordSuccess },
    detailWarning: { color: theme.colors.physicalCountOrange },
    detailAccent: { color: theme.colors.salesRecordCrimson },
    readOnlyPill: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 20, marginTop: 2, marginBottom: 10, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.salesRecordBorder, backgroundColor: theme.colors.background },
    lockIcon: { width: 12, height: 13, alignItems: 'center', justifyContent: 'flex-end', marginRight: 6 },
    lockShackle: { position: 'absolute', top: 0, width: 7, height: 7, borderWidth: 1.4, borderBottomWidth: 0, borderColor: theme.colors.salesRecordMuted, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
    lockBody: { width: 10, height: 7, borderWidth: 1.4, borderColor: theme.colors.salesRecordMuted, borderRadius: 2 },
    readOnlyText: { color: theme.colors.salesRecordMuted, fontFamily: font.semibold, fontSize: 10 },
  }, theme)), [theme]);
}
