import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import {
  getForcedSalesConsumptionState,
  getSalesConsumptionById,
  getSalesConsumptionMockList,
  pageSize,
  type SalesConsumptionRecord,
} from './salesConsumptionRepository';

const font = {
  regular: 'Poppins_400Regular',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

function tileDateTime(value: string) {
  const date = new Date(value);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || '';
  return `${Number(part('day'))} ${monthNames[Number(part('month')) - 1]} · ${part('hour')}:${part('minute')} ${part('dayPeriod')}`;
}

function detailDateTime(value: string) {
  const date = new Date(value);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || '';
  return `${Number(part('day'))} ${monthNames[Number(part('month')) - 1]} ${part('year')} · ${part('hour')}:${part('minute')} ${part('dayPeriod')}`;
}

function quantityText(record: SalesConsumptionRecord) {
  const amount = record.unit === 'bottle'
    ? record.quantity.toFixed(2)
    : String(record.quantity);
  return `−${amount} ${record.unit}`;
}

export default function SalesConsumptionRecords({
  onBack,
  onOpenLinkedSale,
}: {
  onBack: () => void;
  onOpenLinkedSale: (saleId: string) => void;
}) {
  const { colors: themeColors } = useTheme();
  const styles = useStyles();
  const listRef = useRef<ScrollView>(null);
  const [view, setView] = useState<'list' | 'details'>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [items, setItems] = useState<SalesConsumptionRecord[]>([]);
  const [loadedPages, setLoadedPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [selected, setSelected] = useState<SalesConsumptionRecord | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const loadingMoreRef = useRef(false);

  const loadFirst = () => {
    setLoading(true);
    setError(false);
    setItems([]);
    setLoadedPages(1);
    setLoadMoreError(false);
    const forced = getForcedSalesConsumptionState();
    setTimeout(() => {
      if (forced === 'error') setError(true);
      else if (forced === 'loading') return;
      else setItems(forced === 'empty' ? [] : getSalesConsumptionMockList().slice(0, pageSize));
      setLoading(false);
    }, 450);
  };

  useEffect(loadFirst, []);

  const openDetails = (id: string) => {
    setSelectedId(id);
    setView('details');
    setDetailLoading(true);
    setDetailError(false);
    setSelected(null);
    setTimeout(() => {
      const record = getSalesConsumptionById(id);
      if (record) setSelected(record);
      else setDetailError(true);
      setDetailLoading(false);
    }, 250);
  };

  const loadMore = () => {
    if (loadingMoreRef.current || items.length === 0) return;
    const mockCount = getSalesConsumptionMockList().length;
    if (loadedPages * pageSize >= mockCount) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(false);
    setTimeout(() => {
      if (getForcedSalesConsumptionState() === 'error') setLoadMoreError(true);
      else {
        setItems(getSalesConsumptionMockList().slice(0, (loadedPages + 1) * pageSize));
        setLoadedPages((value) => value + 1);
      }
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }, 500);
  };

  const back = () => {
    if (view === 'details') {
      setView('list');
      requestAnimationFrame(() => listRef.current?.scrollTo({ y: scrollOffset, animated: false }));
    } else onBack();
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={styles.backButton}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{view === 'details' ? 'Sales Consumption Details' : 'Sales Consumption Records'}</Text>
      </View>

      {view === 'details' ? (
        detailLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={themeColors.salesRecordCrimson} />
            <Text style={styles.loadingText}>Loading records…</Text>
          </View>
        ) : detailError || !selected ? (
          <View style={styles.errorCenter}>
            <Text style={styles.wifiIcon}>≋</Text>
            <Text style={styles.errorText}>Unable to load data. Please check your internet connection and try again.</Text>
            <Pressable accessibilityRole="button" onPress={() => openDetails(selectedId || '')} style={styles.retryButton}>
              <Text style={styles.retryIcon}>↻</Text>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView style={styles.detailsScroll} contentContainerStyle={styles.detailsContent} showsVerticalScrollIndicator={false}>
            <View style={styles.detailCard}>
              <View style={styles.summaryTop}>
                <Text style={styles.recordId}>{selected.recordReference}</Text>
                {selected.updateFailed ? (
                  <View style={styles.failedBadge}>
                    <Text style={styles.warningIcon}>▲</Text>
                    <Text style={styles.failedBadgeText}>Update failed · Review</Text>
                  </View>
                ) : null}
              </View>
              {[
                ['Ingredient', selected.ingredientName],
                ['Quantity deducted', quantityText(selected)],
                ['Branch', selected.branchName],
                ['Date & time', detailDateTime(selected.createdAt)],
                ['Recorded by', selected.recordedBy],
              ].map(([label, value], index) => (
                <View key={label} style={[styles.detailRow, index === 0 && styles.detailRowFirst]}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={[
                    styles.detailValue,
                    label === 'Quantity deducted' && styles.detailQuantity,
                  ]}>{value}</Text>
                </View>
              ))}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Linked sale</Text>
                <Pressable accessibilityRole="link" onPress={() => onOpenLinkedSale(selected.saleId)}>
                  <Text style={styles.linkedSale}>{selected.saleReference}</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.readOnlyPill}>
              <Text style={styles.lockIcon}>▣</Text>
              <Text style={styles.readOnlyText}>Read-only</Text>
            </View>
          </ScrollView>
        )
      ) : loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={themeColors.salesRecordCrimson} />
          <Text style={styles.loadingText}>Loading records…</Text>
        </View>
      ) : error ? (
        <View style={styles.errorCenter}>
          <Text style={styles.wifiIcon}>≋</Text>
          <Text style={styles.errorText}>Unable to load data. Please check your internet connection and try again.</Text>
          <Pressable accessibilityRole="button" onPress={loadFirst} style={styles.retryButton}>
            <Text style={styles.retryIcon}>↻</Text>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyCircle}><Text style={styles.emptyIcon}>▣</Text></View>
          <Text style={styles.emptyTitle}>No records found.</Text>
          <Text style={styles.emptySubtext}>Records will appear here once saved.</Text>
        </View>
      ) : (
        <ScrollView
          ref={listRef}
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onScroll={(event) => {
            setScrollOffset(event.nativeEvent.contentOffset.y);
            const end = event.nativeEvent.layoutMeasurement.height + event.nativeEvent.contentOffset.y;
            if (event.nativeEvent.contentSize.height - end < 56) loadMore();
          }}
          scrollEventThrottle={16}
        >
          {items.map((record) => (
            <Pressable key={record.id} accessibilityRole="button" onPress={() => openDetails(record.id)} style={styles.tile}>
              <View style={styles.tileTop}>
                <Text style={styles.ingredientName}>{record.ingredientName}</Text>
                <Text style={styles.quantity}>{quantityText(record)}</Text>
              </View>
              <Text style={styles.tileSubtitle}>Sale {record.saleReference} · {tileDateTime(record.createdAt)}</Text>
              <View style={styles.tileBottom}>
                <View style={styles.branchLine}>
                  <Text style={styles.pinIcon}>⌖</Text>
                  <Text style={styles.tileBranch}>{record.branchName}</Text>
                </View>
                {record.updateFailed ? (
                  <View style={styles.failedBadge}>
                    <Text style={styles.warningIcon}>▲</Text>
                    <Text style={styles.failedBadgeText}>Update failed · Review</Text>
                  </View>
                ) : null}
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
          ) : null}
        </ScrollView>
      )}
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
    headerTitle: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 16, flexShrink: 1 },
    loadingCenter: { minHeight: 300, flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 10, marginTop: 8 },
    errorCenter: { minHeight: 300, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    wifiIcon: { color: theme.colors.salesRecordCrimson, fontFamily: font.bold, fontSize: 32, lineHeight: 36, marginBottom: 10 },
    errorText: { maxWidth: 220, color: theme.colors.salesRecordNavy, fontFamily: font.regular, fontSize: 11, lineHeight: 16, textAlign: 'center' },
    retryButton: { minWidth: 120, minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.salesRecordCrimson, backgroundColor: theme.colors.background },
    retryIcon: { color: theme.colors.salesRecordCrimson, fontFamily: font.semibold, fontSize: 11, marginRight: 6 },
    retryText: { color: theme.colors.salesRecordCrimson, fontFamily: font.bold, fontSize: 10 },
    emptyState: { minHeight: 300, flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyCircle: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, marginBottom: 10, backgroundColor: theme.colors.salesRecordLavender },
    emptyIcon: { color: theme.colors.salesRecordNavy, fontFamily: font.semibold, fontSize: 20 },
    emptyTitle: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11, textAlign: 'center' },
    emptySubtext: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 9, textAlign: 'center', marginTop: 4 },
    listScroll: { flex: 1 },
    listContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 82, gap: 8 },
    tile: { minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: theme.colors.salesRecordGray },
    tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    ingredientName: { flexShrink: 1, color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 11 },
    quantity: { color: theme.colors.salesRecordRed, fontFamily: font.bold, fontSize: 11 },
    tileSubtitle: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 8, marginTop: 2 },
    tileBottom: { minHeight: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 },
    branchLine: { flexDirection: 'row', alignItems: 'center' },
    pinIcon: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 8, marginRight: 3 },
    tileBranch: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 8 },
    failedBadge: { minHeight: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, borderRadius: 8, backgroundColor: theme.colors.salesRecordRed },
    warningIcon: { color: theme.colors.background, fontFamily: font.semibold, fontSize: 6, marginRight: 3 },
    failedBadgeText: { color: theme.colors.background, fontFamily: font.semibold, fontSize: 8 },
    loadingMore: { height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
    loadingMoreText: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 9 },
    loadMoreRetry: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
    loadMoreRetryText: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 9 },
    detailsScroll: { flex: 1 },
    detailsContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 82, gap: 10 },
    detailCard: { paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, backgroundColor: theme.colors.salesRecordGray },
    summaryTop: { minHeight: 24, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    recordId: { color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 13 },
    detailRow: { minHeight: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: theme.colors.salesRecordBorder },
    detailRowFirst: { marginTop: 2 },
    detailLabel: { color: theme.colors.secondaryText, fontFamily: font.regular, fontSize: 9 },
    detailValue: { flexShrink: 1, color: theme.colors.salesRecordNavy, fontFamily: font.bold, fontSize: 9, textAlign: 'right' },
    detailQuantity: { color: theme.colors.salesRecordRed },
    linkedSale: { color: theme.colors.salesRecordCrimson, fontFamily: font.bold, fontSize: 9, textAlign: 'right' },
    readOnlyPill: { width: '100%', minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 2, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.salesRecordBorder, backgroundColor: theme.colors.background },
    lockIcon: { color: theme.colors.secondaryText, fontFamily: font.semibold, fontSize: 9, marginRight: 6 },
    readOnlyText: { color: theme.colors.secondaryText, fontFamily: font.semibold, fontSize: 10 },
  }, theme)), [theme]);
}
