import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import {
  filterOwnerSalesByInventoryState,
  getOwnerSaleInventoryStatusLabel,
  loadOwnerSalesData,
  type OwnerSale,
  type OwnerSaleItem,
  type OwnerSalesData,
} from '../services/takosync';
import {
  PRODUCTS_SECTION_TITLE,
  PRODUCTS_SOLD_EMPTY_MESSAGE,
  summarizeOwnerProducts,
} from './ownerSalesSummary';
import {
  getOwnerSalesDateRange,
  type OwnerSalesDateRange,
  type OwnerSalesPeriod,
} from './ownerSalesPeriod';
import { manilaDateKey } from '../services/businessDaySettings';
import { refreshOwnerMonitoring } from './ownerSalesRefresh';
import { resolveOwnerSalesSelection } from './ownerSalesSelection';
import { isSupabaseConfigured } from '../services/supabase';
import { DAILY_SALES_THEME } from './dailySalesTheme';
import { ownerColors } from './shared/ownerTokens';
import {
  DAILY_SALES_SAMPLE_DATE,
  WEEKLY_SALES_LABEL,
  getDailySalesSampleData,
  getForcedDailySalesState,
  getWeeklySalesSampleData,
  getMonthlySalesSampleData,
  getBranchVariantSampleData,
} from './dailySalesRepository';

type Branch = { id: string; name: string };
type SalesMode = 'monitoring' | 'reports';
type Period = OwnerSalesPeriod;
type DateRange = OwnerSalesDateRange;
type ProductSummary = { id: string; name: string; quantity: number; total: number };
type PaymentSummary = { name: string; transactions: number; total: number };
type InventoryFilter = 'all' | 'confirmed' | 'needs_processing';

const periods: Period[] = ['Today', 'Daily', 'Weekly', 'Monthly', 'Custom'];
const PAGE_SIZE = 10;

function currency(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(value);
}

function compactDate(value: string) {
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function summarizePayments(sales: OwnerSale[]): PaymentSummary[] {
  const grouped = new Map<string, PaymentSummary>();
  for (const sale of sales) {
    const name = sale.payment_method.trim() || 'Unspecified';
    const existing = grouped.get(name) ?? { name, transactions: 0, total: 0 };
    existing.transactions += 1;
    existing.total += Number(sale.total_amount);
    grouped.set(name, existing);
  }
  return [...grouped.values()].sort((a, b) => b.total - a.total);
}

function makeTrend(sales: OwnerSale[], range: DateRange) {
  const elapsedDays = Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / 86_400_000));
  const buckets: { label: string; start: number; end: number }[] = [];
  if (elapsedDays === 1) {
    for (let hour = 0; hour < 24; hour += 3) {
      const start = new Date(range.start);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start);
      end.setHours(hour + 3);
      buckets.push({ label: `${String(hour).padStart(2, '0')}:00`, start: start.getTime(), end: end.getTime() });
    }
  } else {
    const step = elapsedDays > 45 ? 7 : 1;
    for (let day = 0; day < elapsedDays; day += step) {
      const start = new Date(range.start);
      start.setDate(start.getDate() + day);
      const end = new Date(start);
      end.setDate(end.getDate() + step);
      const label = step === 1
        ? start.toLocaleDateString('en-PH', { day: 'numeric', month: elapsedDays > 12 ? undefined : 'short' })
        : start.toLocaleDateString('en-PH', { day: 'numeric', month: 'short' });
      buckets.push({ label, start: start.getTime(), end: Math.min(end.getTime(), range.end.getTime()) });
    }
  }
  return buckets.map((bucket) => ({
    ...bucket,
    total: sales.reduce((sum, sale) => {
      const timestamp = new Date(sale.created_at).getTime();
      return timestamp >= bucket.start && timestamp < bucket.end ? sum + Number(sale.total_amount) : sum;
    }, 0),
  }));
}

function csvCell(value: string | number) {
  const raw = String(value);
  const text = typeof value === 'string' && /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}

async function exportReportCsv(input: {
  title: string;
  range: DateRange;
  branchName: string;
  generatedAt: Date;
  sales: OwnerSale[];
  previousSales: OwnerSale[];
  branches: { name: string; total: number; transactions: number; average: number }[];
  products: ProductSummary[];
  payments: PaymentSummary[];
  transactionRows: { sale: OwnerSale; branch: string; summary: string; quantity: number }[];
}): Promise<void> {
  const previousTotal = input.previousSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const currentTotal = input.sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const change = currentTotal - previousTotal;
  const previousSummary: (string | number)[][] = input.previousSales.length > 0
    ? [
        ['Previous comparable period sales', previousTotal],
        ['Sales change', change],
        ...(previousTotal ? [['Sales change percentage', `${((change / previousTotal) * 100).toFixed(1)}%`]] : []),
      ]
    : [];
  const rows: (string | number)[][] = [
    ['TakoSync', input.title],
    ['Reporting period', `${input.range.startText} to ${input.range.endText}`],
    ['Branch', input.branchName],
    ['Generated', input.generatedAt.toLocaleString('en-PH')],
    [],
    ['Sales summary'],
    ['Total sales', input.sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0)],
    ['Completed transactions', input.sales.length],
    ['Average transaction value', input.sales.length
      ? input.sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0) / input.sales.length
      : 0],
    ...previousSummary,
    [],
    ['Branch', 'Sales', 'Transactions', 'Average transaction'],
    ...input.branches.map((branch) => [branch.name, branch.total, branch.transactions, branch.average]),
    [],
    ['Product', 'Quantity sold', 'Sales'],
    ...input.products.map((product) => [product.name, product.quantity, product.total]),
    [],
    ['Payment method', 'Transactions', 'Sales'],
    ...input.payments.map((payment) => [payment.name, payment.transactions, payment.total]),
    [],
    ['Transaction reference', 'Date', 'Branch', 'Products', 'Quantity', 'Payment method', 'Amount', 'Status'],
    ...input.transactionRows.map(({ sale, branch, summary, quantity }) => [
      sale.transaction_reference,
      compactDate(sale.created_at),
      branch,
      summary,
      quantity,
      sale.payment_method,
      Number(sale.total_amount),
      sale.status,
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const filename = `${input.title.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'sales-report'}-${input.range.startText}-to-${input.range.endText}.csv`;
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') throw new Error('CSV export is unavailable in this browser.');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return;
  }
  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error('A temporary storage location is unavailable for this report.');
  if (!await Sharing.isAvailableAsync()) throw new Error('Report sharing is not available on this device.');
  const uri = `${directory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Share sales report',
    UTI: 'public.comma-separated-values-text',
  });
}

function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export default function OwnerSalesWorkspace({
  mode,
  branches,
  initialData,
  initialLoading = false,
  initialPeriod = 'Monthly',
  initialBranchId = null,
  initialStartDate,
  initialEndDate,
  onOpenReports,
  onBack,
  onRefresh,
  availableWidth,
}: {
  mode: SalesMode;
  branches: Branch[];
  initialData?: OwnerSalesData | null;
  initialLoading?: boolean;
  initialPeriod?: Period;
  initialBranchId?: string | null;
  initialStartDate?: string;
  initialEndDate?: string;
  onOpenReports?: () => void;
  onBack?: () => void;
  onRefresh?: () => Promise<void> | void;
  availableWidth: number;
}) {
  const styles = useStyles();
  const wide = availableWidth >= 900;
  const medium = availableWidth >= 620;
  const contentWidth = Math.max(0, availableWidth);
  const twoColumnWidth = medium ? (contentWidth - 12) / 2 : contentWidth;
  const detailLeftWidth = wide ? contentWidth * 0.62 - 8 : twoColumnWidth;
  const detailRightWidth = wide ? contentWidth * 0.38 - 8 : twoColumnWidth;
  const today = manilaDateKey(new Date());
  const [period, setPeriod] = useState<Period>(mode === 'monitoring' ? 'Daily' : initialPeriod);
  const [fromText, setFromText] = useState(() => mode === 'monitoring'
    ? DAILY_SALES_SAMPLE_DATE
    : (initialStartDate ?? `${today.slice(0, 7)}-01`));
  const [toText, setToText] = useState(() => initialEndDate ?? today);
  const [branchId, setBranchId] = useState<string | null>(initialBranchId);
  const [reportTitle, setReportTitle] = useState('Sales performance report');
  const [liveData, setLiveData] = useState<OwnerSalesData | null>(null);
  const [reportData, setReportData] = useState<OwnerSalesData | null>(null);
  const [reportRange, setReportRange] = useState<DateRange | null>(null);
  const [reportBranchId, setReportBranchId] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'reference'>('date');
  const [newestFirst, setNewestFirst] = useState(true);
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>('all');
  const [page, setPage] = useState(0);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [activeSalesTab, setActiveSalesTab] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Branch' | 'Products'>(
    period === 'Weekly' ? 'Weekly' : period === 'Monthly' ? 'Monthly' : 'Daily',
  );
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [weekPickerVisible, setWeekPickerVisible] = useState(false);
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState({ year: 2026, month: 10 });
  const [branchPickerVisible, setBranchPickerVisible] = useState(false);
  const [branchSubTab, setBranchSubTab] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');
  const [productSubTab, setProductSubTab] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');
  const [productSortDescending, setProductSortDescending] = useState(true);
  const [branchDrillDownId, setBranchDrillDownId] = useState<string | null>(null);
  const salesTabScrollRef = useRef<ScrollView>(null);
  const [selectedWeek, setSelectedWeek] = useState({
    dropdownLabel: '9–15 Nov 2026',
    sheetLabel: '9 – 15 Nov 2026',
    start: '2026-11-09',
    end: '2026-11-15',
  });
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [calendarCursor, setCalendarCursor] = useState(() => {
    if (mode === 'monitoring') return new Date(2026, 10, 1);
    const initialDate = initialStartDate && /^\d{4}-\d{2}-\d{2}$/.test(initialStartDate)
      ? new Date(`${initialStartDate}T12:00:00`)
      : new Date();
    return new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
  });
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(mode === 'monitoring'
    ? DAILY_SALES_SAMPLE_DATE
    : (initialStartDate ?? today));
  const compact = availableWidth < 620;
  const shimmerOpacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(shimmerOpacity, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    shimmer.start();
    return () => shimmer.stop();
  }, [shimmerOpacity]);

  useEffect(() => {
    if (activeSalesTab === 'Products') {
      const timeout = setTimeout(() => {
        salesTabScrollRef.current?.scrollToEnd({ animated: true });
      }, 0);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [activeSalesTab]);

  useEffect(() => {
    if (mode === 'monitoring') {
      setBranchId(initialBranchId);
      if (initialPeriod === 'Monthly') {
        setActiveSalesTab('Monthly');
        setPeriod('Monthly');
        setSelectedMonth({ year: 2026, month: 10 });
        setFromText('2026-11-01');
        setToText('2026-11-30');
      } else if (initialPeriod === 'Weekly') {
        setActiveSalesTab('Weekly');
        setPeriod('Weekly');
        setFromText(selectedWeek.start);
        setToText(selectedWeek.end);
      } else {
        setActiveSalesTab('Daily');
        setPeriod('Daily');
        setFromText(DAILY_SALES_SAMPLE_DATE);
        setToText(DAILY_SALES_SAMPLE_DATE);
      }
      return;
    }
    const selection = resolveOwnerSalesSelection({
      branchId: initialBranchId,
      period: initialPeriod,
      startDate: initialStartDate,
      endDate: initialEndDate,
    });
    setBranchId(selection.branchId);
    setPeriod(selection.period);
    if (selection.startDate !== undefined) setFromText(selection.startDate);
    if (selection.endDate !== undefined) setToText(selection.endDate);
  }, [initialBranchId, initialEndDate, initialPeriod, initialStartDate, mode]);

  const refreshMonitoring = () => {
    void refreshOwnerMonitoring(
      mode === 'monitoring' ? onRefresh : undefined,
      () => setRetry((value) => value + 1),
    );
  };

  const activeBranchId = mode === 'reports' && reportData ? reportBranchId : branchId;
  const range = mode === 'reports' && reportData
    ? reportRange
    : getOwnerSalesDateRange(period, fromText, toText);
  const matchesInitialCustomRange = period !== 'Custom' ||
    (fromText === initialStartDate && toText === initialEndDate);

  useEffect(() => {
    if (mode !== 'monitoring') return undefined;
    const forcedState = getForcedDailySalesState();
    if (forcedState || !isSupabaseConfigured) {
      if (forcedState === 'error') {
        setLiveData(null);
        setLoading(false);
        setError('Unable to load data. Please check your internet connection and try again.');
        return undefined;
      }
      if (forcedState === 'loading') {
        setLiveData(null);
        setLoading(true);
        setError('');
        return undefined;
      }
      setLoading(true);
      setError('');
      const timeout = setTimeout(() => {
        if (forcedState === 'empty') {
          setLiveData({ sales: [], todaySales: [], previousSales: [], items: [] });
        } else if (forcedState === 'branch_variant') {
          setLiveData(getBranchVariantSampleData());
        } else {
          setLiveData(activeSalesTab === 'Weekly'
            ? getWeeklySalesSampleData(branchId)
            : activeSalesTab === 'Monthly'
              ? getMonthlySalesSampleData(branchId)
              : getDailySalesSampleData(branchId));
        }
        setLoading(false);
      }, 450);
      return () => clearTimeout(timeout);
    }
    if (initialLoading && !initialData && retry === 0) {
      setLoading(true);
      setError('');
      return undefined;
    }
    if (
      initialData &&
      period === initialPeriod &&
      branchId === initialBranchId &&
      matchesInitialCustomRange &&
      retry === 0
    ) {
      setLiveData(initialData);
      setLoading(false);
      setError('');
      return undefined;
    }
    const requestedRange = getOwnerSalesDateRange(period, fromText, toText);
    if (!requestedRange) {
      setLiveData(null);
      setError('Enter valid start and end dates. The end date must not be before the start date.');
      return undefined;
    }
    let active = true;
    setLiveData(null);
    setError('');
    setLoading(true);
    loadOwnerSalesData({ ...requestedRange, branchId, includePrevious: true })
      .then((data) => {
        if (active) setLiveData(data);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load sales data.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeSalesTab, branchId, fromText, initialBranchId, initialData, initialLoading, initialPeriod, initialEndDate, initialStartDate, matchesInitialCustomRange, mode, period, retry, toText]);

  const generateReport = async () => {
    const requestedRange = getOwnerSalesDateRange(period, fromText, toText);
    if (!requestedRange) {
      setReportData(null);
      setError('Enter valid dates in YYYY-MM-DD format. The end date must not be before the start date.');
      return;
    }
    setLoading(true);
    setError('');
    setReportData(null);
    try {
      const data = await loadOwnerSalesData({ ...requestedRange, branchId, includePrevious: true });
      setReportData(data);
      setReportRange(requestedRange);
      setReportBranchId(branchId);
      setGeneratedAt(new Date());
      setPage(0);
      setExpandedSaleId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to generate the selected sales report.');
    } finally {
      setLoading(false);
    }
  };

  const data = mode === 'monitoring' ? liveData : reportData;
  const sales = data?.sales ?? [];
  const unresolvedSales = useMemo(
    () => filterOwnerSalesByInventoryState(sales, 'needs_processing'),
    [sales],
  );
  const items = data?.items ?? [];
  const products = useMemo(() => summarizeOwnerProducts(items), [items]);
  const rankedProducts = useMemo(() => {
    const sorted = [...products].sort((left, right) => {
      if (left.quantity === right.quantity) return left.name.localeCompare(right.name);
      return productSortDescending
        ? right.quantity - left.quantity
        : left.quantity - right.quantity;
    });
    return sorted;
  }, [productSortDescending, products]);
  const payments = useMemo(() => summarizePayments(sales), [sales]);
  const totalSales = sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const previousSales = data?.previousSales ?? [];
  const previousTotal = previousSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const salesChange = totalSales - previousTotal;
  const comparisonDays = range
    ? Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / 86_400_000))
    : 0;
  const average = sales.length ? totalSales / sales.length : 0;
  const productBySale = useMemo(() => {
    const grouped = new Map<string, OwnerSaleItem[]>();
    for (const item of items) grouped.set(item.sale_id, [...(grouped.get(item.sale_id) ?? []), item]);
    return grouped;
  }, [items]);
  const branchMetrics = useMemo(() => branches
    .filter((branch) => !activeBranchId || branch.id === activeBranchId)
    .map((branch) => {
      const branchSales = sales.filter((sale) => sale.branch_id === branch.id);
      const total = branchSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
      return {
        id: branch.id,
        name: branch.name,
        total,
        transactions: branchSales.length,
        average: branchSales.length ? total / branchSales.length : 0,
      };
    })
    .sort((a, b) => b.total - a.total), [activeBranchId, branches, sales]);
  const bestBranch = branchMetrics.find((branch) => branch.transactions > 0);
  const trend = range ? makeTrend(sales, range) : [];
  const trendMax = Math.max(...trend.map((point) => point.total), 0);
  const selectedTrend = trend.find((point) => point.label === selectedBucket);
  const paymentTotal = payments.reduce((sum, payment) => sum + payment.total, 0);
  const paymentSectionAvailable = sales.some((sale) => sale.payment_method.trim() !== '');
  const branchName = branches.find((branch) => branch.id === activeBranchId)?.name ?? 'All branches';
  const allTransactionRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...sales]
      .map((sale) => {
        const saleItems = productBySale.get(sale.id) ?? [];
        return {
          sale,
          branch: branches.find((branch) => branch.id === sale.branch_id)?.name ?? 'Branch unavailable',
          summary: saleItems.map((item) => `${item.quantity} × ${item.product_name}`).join(', ') || 'No item details available',
          quantity: saleItems.reduce((sum, item) => sum + Number(item.quantity), 0),
          searchText: `${sale.transaction_reference} ${sale.payment_method} ${saleItems.map((item) => item.product_name).join(' ')}`.toLowerCase(),
        };
      })
      .sort((a, b) => sortBy === 'amount'
        ? Number(b.sale.total_amount) - Number(a.sale.total_amount)
        : sortBy === 'reference'
          ? a.sale.transaction_reference.localeCompare(b.sale.transaction_reference)
          : newestFirst
            ? new Date(b.sale.created_at).getTime() - new Date(a.sale.created_at).getTime()
            : new Date(a.sale.created_at).getTime() - new Date(b.sale.created_at).getTime());
  }, [branches, newestFirst, productBySale, sales, sortBy]);
  const transactionRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const scopedRows = allTransactionRows.filter((row) =>
      filterOwnerSalesByInventoryState([row.sale], inventoryFilter).length > 0,
    );
    return scopedRows.filter((row) =>
      !term || row.searchText.includes(term) || row.branch.toLowerCase().includes(term),
    );
  }, [allTransactionRows, inventoryFilter, search]);
  const pageCount = Math.max(1, Math.ceil(transactionRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = transactionRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const title = mode === 'reports' ? reportTitle.trim() || 'Sales performance report' : 'Sales Monitoring';
  const downloadCsv = async () => {
    if (!data || !range || !generatedAt) return;
    setExporting(true);
    setExportError('');
    try {
      await exportReportCsv({
        title,
        range,
        branchName,
        generatedAt,
        sales,
        previousSales,
        branches: branchMetrics,
        products,
        payments,
        transactionRows: allTransactionRows,
      });
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Unable to export this sales report.');
    } finally {
      setExporting(false);
    }
  };
  const changePeriod = (value: Period) => {
    setPeriod(value);
    if (mode === 'reports') {
      setReportData(null);
      setGeneratedAt(null);
      setError('');
    }
  };
  const changeBranch = (value: string | null) => {
    setBranchId(value);
    if (mode === 'reports') {
      setReportData(null);
      setGeneratedAt(null);
      setError('');
    }
  };
  const changeDate = (setter: (value: string) => void, value: string) => {
    setter(value);
    if (mode === 'reports') {
      setReportData(null);
      setGeneratedAt(null);
      setError('');
    }
  };

  const filterPanel = (
    <View style={styles.filterCard}>
      <Text style={styles.filterLabel}>Reporting period</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {periods.map((option) => (
          <ChoiceChip key={option} label={option} selected={period === option} onPress={() => changePeriod(option)} />
        ))}
      </ScrollView>
      {period === 'Custom' && (
        <View style={[styles.dateRow, medium && styles.dateRowWide]}>
          <View style={styles.dateField}>
            <Text style={styles.filterLabel}>Start date</Text>
            <TextInput
              accessibilityLabel="Start date"
              value={fromText}
              onChangeText={(value) => changeDate(setFromText, value)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#858591"
              style={styles.input}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.dateField}>
            <Text style={styles.filterLabel}>End date</Text>
            <TextInput
              accessibilityLabel="End date"
              value={toText}
              onChangeText={(value) => changeDate(setToText, value)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#858591"
              style={styles.input}
              autoCapitalize="none"
            />
          </View>
        </View>
      )}
      <Text style={[styles.filterLabel, styles.branchLabel]}>Branch</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <ChoiceChip label="All Branches" selected={branchId === null} onPress={() => changeBranch(null)} />
        {branches.map((branch) => (
          <ChoiceChip
            key={branch.id}
            label={branch.name}
            selected={branchId === branch.id}
            onPress={() => changeBranch(branch.id)}
          />
        ))}
      </ScrollView>
      {mode === 'reports' && (
        <>
          <Text style={[styles.filterLabel, styles.branchLabel]}>Report title</Text>
          <TextInput
            accessibilityLabel="Report title"
            value={reportTitle}
            onChangeText={setReportTitle}
            placeholder="Sales performance report"
            placeholderTextColor="#858591"
            style={styles.input}
            maxLength={100}
          />
          {period !== 'Custom' && range && (
            <Text style={styles.rangeHint}>Dates: {range.startText} – {range.endText}</Text>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={loading}
            onPress={generateReport}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, loading && styles.disabled]}
          >
            {loading
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={styles.primaryButtonText}>Generate Report</Text>}
          </Pressable>
        </>
      )}
    </View>
  );

  if (mode === 'monitoring') {
    const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(fromText)
      ? new Date(`${fromText}T12:00:00`)
      : new Date();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dateLabel = activeSalesTab === 'Branch'
      ? branchSubTab === 'Weekly'
        ? selectedWeek.dropdownLabel
        : branchSubTab === 'Monthly'
          ? `${monthNames[selectedMonth.month]} ${selectedMonth.year}`
          : selectedDate.toLocaleDateString('en-PH', {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
      : activeSalesTab === 'Products'
        ? productSubTab === 'Weekly'
          ? selectedWeek.dropdownLabel
          : productSubTab === 'Monthly'
            ? `${monthNames[selectedMonth.month]} ${selectedMonth.year}`
            : selectedDate.toLocaleDateString('en-PH', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })
      : activeSalesTab === 'Weekly'
        ? selectedWeek.dropdownLabel
        : activeSalesTab === 'Monthly'
          ? `${monthNames[selectedMonth.month]} ${selectedMonth.year}`
          : selectedDate.toLocaleDateString('en-PH', {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            });
    const branchLabel = branches.find((branch) => branch.id === branchId)?.name ?? 'All branches';
    const orderedBranches = branches
      .filter((branch) => /^Branch [123]$/.test(branch.name))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
    const branchSalesCards = (orderedBranches.length === 3 ? orderedBranches : [
      { id: 'branch-1', name: 'Branch 1' },
      { id: 'branch-2', name: 'Branch 2' },
      { id: 'branch-3', name: 'Branch 3' },
    ] as Branch[])
      .filter((branch) => !branchId || branch.id === branchId)
      .map((branch) => ({
        id: branch.id,
        name: branch.name,
        total: sales.filter((sale) => sale.branch_id === branch.id)
          .reduce((sum, sale) => sum + Number(sale.total_amount), 0),
      }));
    const branchCombinedTotal = branchSalesCards.reduce((sum, branch) => sum + branch.total, 0);
    const calendarYear = calendarCursor.getFullYear();
    const calendarMonth = calendarCursor.getMonth();
    const calendarMonthLabel = calendarCursor.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    const calendarFirstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const calendarDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const calendarCells = [
      ...Array.from({ length: calendarFirstDay }, () => null),
      ...Array.from({ length: calendarDays }, (_, index) => index + 1),
    ];
    const dateInputValue = (day: number) =>
      `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const sheetWidth = Math.min(availableWidth + 36, 390);

    if (branchDrillDownId) {
      const drillBranch = branches.find((branch) => branch.id === branchDrillDownId);
      const drillName = drillBranch?.name ?? 'Branch';
      const drillRows = allTransactionRows.filter((row) =>
        row.sale.branch_id === branchDrillDownId &&
        (!search.trim() || row.searchText.includes(search.trim().toLowerCase()) || row.branch.toLowerCase().includes(search.trim().toLowerCase())),
      );
      const drillTotal = drillRows.reduce((sum, row) => sum + Number(row.sale.total_amount), 0);
      return (
        <View style={styles.omWorkspace}>
          <View style={styles.omHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Back to ${drillName} sales`}
              onPress={() => setBranchDrillDownId(null)}
              style={styles.omBackButton}
            >
              <Text style={styles.omBackText}>‹</Text>
            </Pressable>
            <Text style={styles.omHeaderTitle}>{drillName} Transactions</Text>
            <View style={styles.omHeaderSpacer} />
          </View>
          <View style={styles.omSearchWrap}>
            <Text style={styles.omSearchIcon}>⌕</Text>
            <TextInput
              accessibilityLabel={`Search ${drillName} transactions`}
              value={search}
              onChangeText={setSearch}
              placeholder="Searching for something?"
              placeholderTextColor={DAILY_SALES_THEME.secondaryText}
              style={styles.omSearchInput}
            />
          </View>
          {loading ? (
            <View style={styles.omSkeletonCard}>
              <Animated.View style={[styles.omSkeletonLabel, { opacity: shimmerOpacity }]} />
              <Animated.View style={[styles.omSkeletonAmount, { opacity: shimmerOpacity }]} />
            </View>
          ) : error ? (
            <View style={styles.omErrorCenter}>
              <Text style={styles.omWifiOffIcon}>≋</Text>
              <Text style={styles.omErrorText}>Unable to load data. Please check your internet connection and try again.</Text>
              <Pressable accessibilityRole="button" onPress={refreshMonitoring} style={styles.omRetryButton}>
                <Text style={styles.omRetryIcon}>↻</Text>
                <Text style={styles.omRetryText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.omSalesCard}>
                <View style={styles.omSalesCardHeader}>
                  <Text style={styles.omSalesCardLabel}>Combined Total Recorded Sales</Text>
                  <Text style={styles.omLockIcon}>▣</Text>
                </View>
                <Text style={styles.omSalesAmount}>{currency(drillTotal)}</Text>
              </View>
              {drillRows.length ? (
                <>
                  <View style={styles.omTransactionsHeader}>
                    <Text style={styles.omTransactionsTitle}>Transactions</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={newestFirst ? 'Sort oldest first' : 'Sort newest first'}
                      onPress={() => setNewestFirst((value) => !value)}
                    >
                      <Text style={styles.omNewestText}>{newestFirst ? 'Newest first' : 'Oldest first'}</Text>
                    </Pressable>
                  </View>
                  {drillRows.map((row) => (
                    <Pressable
                      key={row.sale.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Open transaction ${row.sale.transaction_reference}`}
                      onPress={() => setSelectedSaleId(row.sale.id)}
                      style={({ pressed }) => [styles.omTransactionCard, pressed && styles.omPressed]}
                    >
                      <View style={styles.omTransactionCopy}>
                        <Text style={styles.omTransactionId}>{row.sale.transaction_reference}</Text>
                        <Text style={styles.omTransactionMeta}>{compactDate(row.sale.created_at)}</Text>
                        <Text style={styles.omTransactionMeta}>{drillName}</Text>
                      </View>
                      <Text style={styles.omTransactionAmount}>{currency(Number(row.sale.total_amount))}</Text>
                      <Text style={styles.omTransactionChevron}>›</Text>
                    </Pressable>
                  ))}
                </>
              ) : (
                <View style={styles.omEmptyCard}>
                  <Text style={styles.omEmptyIcon}>▤</Text>
                  <Text style={styles.omEmptyText}>No sales recorded for this period.</Text>
                </View>
              )}
            </>
          )}
        </View>
      );
    }

    const selectedSale = allTransactionRows.find((row) => row.sale.id === selectedSaleId)?.sale ?? null;
    if (selectedSale) {
      const selectedSaleItems = productBySale.get(selectedSale.id) ?? [];
      const selectedSaleBranch = branches.find((branch) => branch.id === selectedSale.branch_id)?.name ?? 'Branch unavailable';
      return (
        <View style={styles.workspace}>
          <View style={styles.omHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to Sales Summaries"
              onPress={() => setSelectedSaleId(null)}
              style={styles.omBackButton}
            >
              <Text style={styles.omBackText}>‹</Text>
            </Pressable>
            <Text style={styles.omHeaderTitle}>Transaction Details</Text>
            <View style={styles.omHeaderSpacer} />
          </View>

          <View style={styles.omDetailCard}>
            <View style={styles.omDetailTitleRow}>
              <Text style={styles.omDetailReference}>{selectedSale.transaction_reference}</Text>
              <View style={styles.omRecordedBadge}><Text style={styles.omRecordedText}>✓ Recorded</Text></View>
            </View>
            <View style={styles.omDetailRow}>
              <Text style={styles.omDetailLabel}>Date & time</Text>
              <Text style={styles.omDetailValue}>{compactDate(selectedSale.created_at)}</Text>
            </View>
            <View style={styles.omDetailRow}>
              <Text style={styles.omDetailLabel}>Branch</Text>
              <Text style={styles.omDetailValue}>{selectedSaleBranch}</Text>
            </View>
            <View style={styles.omDetailRow}>
              <Text style={styles.omDetailLabel}>Recorded by</Text>
              <Text style={styles.omDetailValue}>{selectedSale.recorded_by_name ? `${selectedSale.recorded_by_name} (employee account)` : 'Employee account unavailable'}</Text>
            </View>
          </View>

          <View style={styles.omDetailCard}>
            <Text style={styles.omDetailSectionTitle}>Items</Text>
            {selectedSaleItems.length ? selectedSaleItems.map((item) => (
              <View key={item.id} style={styles.omItemRow}>
                <View style={styles.omItemCopy}>
                  <Text style={styles.omItemName}>{item.product_name}</Text>
                  <Text style={styles.omItemMeta}>{item.quantity} × {currency(Number(item.unit_price))}</Text>
                </View>
                <Text style={styles.omItemAmount}>{currency(Number(item.subtotal))}</Text>
              </View>
            )) : (
              <Text style={styles.omDetailUnavailable}>Item details are unavailable for this transaction.</Text>
            )}
            <View style={styles.omItemTotalRow}>
              <Text style={styles.omItemTotalLabel}>Total</Text>
              <Text style={styles.omItemTotalAmount}>{currency(Number(selectedSale.total_amount))}</Text>
            </View>
          </View>

          <View style={styles.omDetailCard}>
            <Text style={styles.omDetailSectionTitle}>Payment information</Text>
            <View style={styles.omDetailRow}>
              <Text style={styles.omDetailLabel}>Payment method</Text>
              <Text style={styles.omDetailValue}>{selectedSale.payment_method || 'Unavailable'}</Text>
            </View>
            <View style={styles.omDetailRow}>
              <Text style={styles.omDetailLabel}>Amount tendered</Text>
              <Text style={styles.omDetailValue}>Unavailable</Text>
            </View>
            <View style={styles.omDetailRow}>
              <Text style={styles.omDetailLabel}>Change</Text>
              <Text style={styles.omDetailValue}>Unavailable</Text>
            </View>
          </View>

          <View style={styles.omReadOnly}>
            <Text style={styles.omLockIcon}>▣</Text>
            <Text style={styles.omReadOnlyText}>Read-only</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.omWorkspace}>
        <Text style={styles.omPageTitle}>Sales Summaries</Text>
        <View style={styles.omSearchWrap}>
          <Text style={styles.omSearchIcon}>⌕</Text>
          <TextInput
            accessibilityLabel="Search sales transactions"
            value={search}
            onChangeText={(value) => {
              setSearch(value);
              setPage(0);
            }}
            placeholder="Searching for something?"
            placeholderTextColor="#858591"
            style={styles.omSearchInput}
          />
          {search.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear sales search" onPress={() => setSearch('')} style={styles.omClearSearch}>
              <Text style={styles.omClearSearchText}>×</Text>
            </Pressable>
          )}
        </View>

        <ScrollView ref={salesTabScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.omTabRow}>
          {(['Daily', 'Weekly', 'Monthly', 'Branch', 'Products'] as const).map((tab) => (
            <Pressable
              key={tab}
              accessibilityRole="button"
              accessibilityState={{ selected: activeSalesTab === tab }}
              disabled={loading}
              onPress={() => {
                setActiveSalesTab(tab);
                if (tab === 'Daily') {
                  setPeriod('Daily');
                  setFromText(DAILY_SALES_SAMPLE_DATE);
                  setToText(DAILY_SALES_SAMPLE_DATE);
                }
                if (tab === 'Weekly') {
                  setPeriod('Weekly');
                  setFromText(selectedWeek.start);
                  setToText(selectedWeek.end);
                }
                if (tab === 'Monthly') {
                  setPeriod('Monthly');
                  setSelectedMonth({ year: 2026, month: 10 });
                  setFromText('2026-11-01');
                  setToText('2026-11-30');
                }
                if (tab === 'Branch') {
                  setBranchSubTab('Daily');
                  setBranchId(null);
                  setPeriod('Daily');
                  setFromText(DAILY_SALES_SAMPLE_DATE);
                  setToText(DAILY_SALES_SAMPLE_DATE);
                }
                if (tab === 'Products') {
                  setProductSubTab('Daily');
                  setBranchId(null);
                  setProductSortDescending(true);
                  setPeriod('Daily');
                  setFromText(DAILY_SALES_SAMPLE_DATE);
                  setToText(DAILY_SALES_SAMPLE_DATE);
                }
              }}
              style={[
                styles.omTab,
                activeSalesTab === tab && (tab === 'Products' ? styles.omTabSelectedNavy : styles.omTabSelected),
              ]}
            >
              <Text style={[styles.omTabText, activeSalesTab === tab && styles.omTabTextSelected]}>{tab}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {activeSalesTab === 'Branch' && !error && (
          <>
            <View style={styles.omBranchDivider} />
            <View style={styles.omBranchSubTabRow}>
              {(['Daily', 'Weekly', 'Monthly'] as const).map((subTab) => (
                <Pressable
                  key={subTab}
                  accessibilityRole="button"
                  accessibilityState={{ selected: branchSubTab === subTab }}
                  disabled={loading}
                  onPress={() => {
                    setBranchSubTab(subTab);
                    if (subTab === 'Daily') {
                      setPeriod('Daily');
                      setFromText(DAILY_SALES_SAMPLE_DATE);
                      setToText(DAILY_SALES_SAMPLE_DATE);
                    } else if (subTab === 'Weekly') {
                      setPeriod('Weekly');
                      setFromText(selectedWeek.start);
                      setToText(selectedWeek.end);
                    } else {
                      setPeriod('Monthly');
                      setFromText('2026-11-01');
                      setToText('2026-11-30');
                    }
                  }}
                  style={[styles.omBranchSubTab, branchSubTab === subTab && styles.omBranchSubTabSelected]}
                >
                  <Text style={[styles.omBranchSubTabText, branchSubTab === subTab && styles.omBranchSubTabTextSelected]}>{subTab}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        {activeSalesTab === 'Products' && (
          <>
            <View style={styles.omBranchDivider} />
            <View style={styles.omBranchSubTabRow}>
              {(['Daily', 'Weekly', 'Monthly'] as const).map((subTab) => (
                <Pressable
                  key={subTab}
                  accessibilityRole="button"
                  accessibilityState={{ selected: productSubTab === subTab }}
                  disabled={loading}
                  onPress={() => {
                    setProductSubTab(subTab);
                    if (subTab === 'Daily') {
                      setPeriod('Daily');
                      setFromText(DAILY_SALES_SAMPLE_DATE);
                      setToText(DAILY_SALES_SAMPLE_DATE);
                    } else if (subTab === 'Weekly') {
                      setPeriod('Weekly');
                      setFromText(selectedWeek.start);
                      setToText(selectedWeek.end);
                    } else {
                      setPeriod('Monthly');
                      setFromText('2026-11-01');
                      setToText('2026-11-30');
                    }
                  }}
                  style={[styles.omBranchSubTab, productSubTab === subTab && styles.omBranchSubTabSelected]}
                >
                  <Text style={[styles.omBranchSubTabText, productSubTab === subTab && styles.omBranchSubTabTextSelected]}>{subTab}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <View style={styles.omSelectorRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose sales date"
            disabled={loading}
            onPress={() => {
              const activeDateMode = activeSalesTab === 'Branch'
                ? branchSubTab
                : activeSalesTab === 'Products'
                  ? productSubTab
                  : activeSalesTab;
              if (activeDateMode === 'Weekly') {
                setWeekPickerVisible(true);
                return;
              }
              if (activeDateMode === 'Monthly') {
                setMonthPickerVisible(true);
                return;
              }
              setCalendarSelectedDate(fromText);
              if (/^\d{4}-\d{2}-\d{2}$/.test(fromText)) {
                setCalendarCursor(new Date(`${fromText}T12:00:00`));
              }
              setDatePickerVisible(true);
            }}
            style={styles.omDateSelector}
          >
            <Text style={styles.omSelectorIcon}>▣</Text>
            <Text style={styles.omSelectorText} numberOfLines={1}>{dateLabel}</Text>
            <Text style={styles.omSelectorChevron}>⌄</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose branch"
            disabled={loading}
            onPress={() => setBranchPickerVisible(true)}
            style={styles.omBranchSelector}
          >
            <Text style={styles.omSelectorIcon}>⌖</Text>
            <Text style={styles.omSelectorText} numberOfLines={1}>{branchLabel}</Text>
            <Text style={styles.omSelectorChevron}>⌄</Text>
          </Pressable>
        </View>

        {loading && !data ? (
          <>
            {activeSalesTab === 'Products' ? (
              <View style={styles.omProductLoadingCard}>
                <Animated.View style={[styles.omProductSkeletonIcon, { opacity: shimmerOpacity }]} />
                <Animated.View style={[styles.omProductSkeletonLong, { opacity: shimmerOpacity }]} />
                <Animated.View style={[styles.omProductSkeletonShort, { opacity: shimmerOpacity }]} />
              </View>
            ) : (
              <>
                {activeSalesTab === 'Branch' && (
                  <Text style={styles.omTransactionsTitle}>Sales per branch</Text>
                )}
                <View style={styles.omSkeletonCard}>
                  <Animated.View style={[styles.omSkeletonLabel, { opacity: shimmerOpacity }]} />
                  <Animated.View style={[styles.omSkeletonAmount, { opacity: shimmerOpacity }]} />
                </View>
              </>
            )}
            <View style={styles.omLoadingCenter}>
              <View style={styles.omSpinner}><Text style={styles.omSpinnerText}>•</Text></View>
              <Text style={styles.omLoadingText}>Loading sales…</Text>
            </View>
          </>
        ) : error ? (
          <View style={styles.omErrorCenter}>
            <Text style={styles.omWifiOffIcon}>≋</Text>
            <Text style={styles.omErrorText}>Unable to load data. Please check your internet connection and try again.</Text>
            <Pressable accessibilityRole="button" onPress={refreshMonitoring} style={styles.omRetryButton}>
              <Text style={styles.omRetryIcon}>↻</Text>
              <Text style={styles.omRetryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {activeSalesTab !== 'Products' && (
              <View style={styles.omSalesCard}>
                <View style={styles.omSalesCardHeader}>
                  <Text style={styles.omSalesCardLabel}>
                    {activeSalesTab === 'Branch' ? 'Combined Total Recorded Sales' : 'Total Recorded Sales'}
                  </Text>
                  <Text style={styles.omLockIcon}>▣</Text>
                </View>
                <Text style={styles.omSalesAmount}>
                  {activeSalesTab === 'Branch'
                    ? currency(branchCombinedTotal)
                    : sales.length ? currency(totalSales) : '₱0'}
                </Text>
              </View>
            )}

            {activeSalesTab === 'Branch' ? (
              <>
                <View style={styles.omTransactionsHeader}>
                  <Text style={styles.omTransactionsTitle}>Sales per branch</Text>
                </View>
                {!sales.length ? (
                  <View style={styles.omEmptyCard}>
                    <Text style={styles.omEmptyIcon}>▤</Text>
                    <Text style={styles.omEmptyText}>No sales recorded for this period.</Text>
                  </View>
                ) : branchSalesCards.length ? branchSalesCards.map((branch) => (
                  <Pressable
                    key={branch.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${branch.name} transactions`}
                    onPress={() => setBranchDrillDownId(branch.id)}
                    style={({ pressed }) => [styles.omBranchCard, pressed && styles.omPressed]}
                  >
                    <View style={styles.omBranchIconTile}>
                      <Text style={styles.omBranchPin}>⌖</Text>
                    </View>
                    <View style={styles.omBranchCopy}>
                      <Text style={styles.omBranchName}>{branch.name}</Text>
                      <Text style={styles.omBranchSupporting}>View transactions</Text>
                    </View>
                    <Text style={styles.omBranchAmount}>{currency(branch.total)}</Text>
                    <Text style={styles.omTransactionChevron}>›</Text>
                  </Pressable>
                )) : (
                  <Text style={styles.omEmptyText}>No sales recorded for this period.</Text>
                )}
              </>
            ) : activeSalesTab === 'Products' ? (
              <>
                <View style={styles.omTransactionsHeader}>
                  <Text style={styles.omTransactionsTitle}>{PRODUCTS_SECTION_TITLE}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={productSortDescending ? 'Sort lowest to highest' : 'Sort highest to lowest'}
                    onPress={() => setProductSortDescending((value) => !value)}
                  >
                    <Text style={styles.omNewestText}>
                      {productSortDescending ? 'Highest to lowest' : 'Lowest to highest'}
                    </Text>
                  </Pressable>
                </View>
                {rankedProducts.length ? rankedProducts.map((product, index) => {
                  const maxQuantity = rankedProducts.reduce(
                    (maximum, item) => Math.max(maximum, item.quantity),
                    0,
                  );
                  const barWidth = maxQuantity ? (product.quantity / maxQuantity) * 100 : 0;
                  return (
                    <View key={product.id} style={styles.omProductRankCard}>
                      <View style={styles.omProductRankBadge}>
                        <Text style={styles.omProductRankText}>{index + 1}</Text>
                      </View>
                      <View style={styles.omProductRankCopy}>
                        <View style={styles.omProductRankTopLine}>
                          <Text style={styles.omProductName} numberOfLines={1}>{product.name}</Text>
                          <Text style={styles.omProductSold}>{product.quantity} sold</Text>
                        </View>
                        <View style={styles.omProductProgressTrack}>
                          <View style={[styles.omProductProgressBar, { width: `${barWidth}%` }]} />
                        </View>
                      </View>
                    </View>
                  );
                }) : (
                  <View style={styles.omEmptyCard}>
                    <Text style={styles.omEmptyIcon}>▤</Text>
                    <Text style={styles.omEmptyText}>{PRODUCTS_SOLD_EMPTY_MESSAGE}</Text>
                  </View>
                )}
              </>
            ) : (
              <>
                <View style={styles.omTransactionsHeader}>
                  <Text style={styles.omTransactionsTitle}>Transactions</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={newestFirst ? 'Sort oldest first' : 'Sort newest first'}
                    onPress={() => setNewestFirst((value) => !value)}
                  >
                    <Text style={styles.omNewestText}>{newestFirst ? 'Newest first' : 'Oldest first'}</Text>
                  </Pressable>
                </View>
                {transactionRows.length ? transactionRows.map((row) => (
                  <Pressable
                    key={row.sale.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open transaction ${row.sale.transaction_reference}`}
                    onPress={() => setSelectedSaleId(row.sale.id)}
                    style={({ pressed }) => [styles.omTransactionCard, pressed && styles.omPressed]}
                  >
                    <View style={styles.omTransactionCopy}>
                      <Text style={styles.omTransactionId}>{row.sale.transaction_reference}</Text>
                      <Text style={styles.omTransactionMeta}>{compactDate(row.sale.created_at)}</Text>
                      <Text style={styles.omTransactionMeta}>{row.branch}</Text>
                    </View>
                    <Text style={styles.omTransactionAmount}>{currency(Number(row.sale.total_amount))}</Text>
                    <Text style={styles.omTransactionChevron}>›</Text>
                  </Pressable>
                )) : (
                  <View style={styles.omEmptyCard}>
                    <Text style={styles.omEmptyIcon}>▤</Text>
                    <Text style={styles.omEmptyText}>No sales recorded for this period.</Text>
                  </View>
                )}
              </>
            )}
          </>
        )}

        <Modal
          visible={datePickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setDatePickerVisible(false)}
        >
          <Pressable accessibilityRole="button" accessibilityLabel="Close date picker" onPress={() => setDatePickerVisible(false)} style={styles.omModalBackdrop}>
            <Pressable onPress={() => undefined} style={[styles.omBottomSheet, { width: sheetWidth }]}>
              <View style={styles.omSheetHandle} />
              <View style={styles.omCalendarHeader}>
                <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setCalendarCursor(new Date(calendarYear, calendarMonth - 1, 1))} style={styles.omCalendarArrow}>
                  <Text style={styles.omCalendarArrowText}>‹</Text>
                </Pressable>
                <Text style={styles.omCalendarTitle}>{calendarMonthLabel}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setCalendarCursor(new Date(calendarYear, calendarMonth + 1, 1))} style={styles.omCalendarArrow}>
                  <Text style={styles.omCalendarArrowText}>›</Text>
                </Pressable>
              </View>
              <View style={styles.omCalendarGrid}>
                {calendarCells.map((day, index) => {
                  if (!day) return <View key={`blank-${index}`} style={styles.omCalendarDay} />;
                  const value = dateInputValue(day);
                  const selected = calendarSelectedDate === value;
                  const referenceCutoff = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-12`;
                  const disabled = calendarYear === 2026 && calendarMonth === 10
                    ? value > referenceCutoff
                    : (() => {
                        const current = new Date(`${value}T23:59:59`);
                        const now = new Date();
                        now.setHours(23, 59, 59, 999);
                        return current > now;
                      })();
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled }}
                      disabled={disabled}
                      onPress={() => setCalendarSelectedDate(value)}
                      style={[styles.omCalendarDay, selected && styles.omCalendarDaySelected]}
                    >
                      <Text style={[
                        styles.omCalendarDayText,
                        selected && styles.omCalendarDayTextSelected,
                        disabled && styles.omCalendarDayDisabled,
                      ]}>{day}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFromText(calendarSelectedDate);
                  setToText(calendarSelectedDate);
                  setPeriod('Daily');
                  if (activeSalesTab === 'Products') {
                    setProductSubTab('Daily');
                  } else {
                    setActiveSalesTab('Daily');
                  }
                  setDatePickerVisible(false);
                }}
                style={styles.omApplyButton}
              >
                <Text style={styles.omApplyText}>Apply</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={monthPickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setMonthPickerVisible(false)}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close month selector"
            onPress={() => setMonthPickerVisible(false)}
            style={styles.omModalBackdrop}
          >
            <Pressable onPress={() => undefined} style={[styles.omBottomSheet, styles.omMonthSheet, { width: sheetWidth }]}>
              <View style={styles.omSheetHandle} />
              <View style={styles.omMonthHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous year"
                  onPress={() => setSelectedMonth((current) => ({ ...current, year: current.year - 1 }))}
                  style={styles.omMonthArrow}
                >
                  <Text style={styles.omMonthArrowText}>‹</Text>
                </Pressable>
                <Text style={styles.omMonthYear}>{selectedMonth.year}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next year"
                  accessibilityState={{ disabled: selectedMonth.year >= 2026 }}
                  disabled={selectedMonth.year >= 2026}
                  onPress={() => setSelectedMonth((current) => ({ ...current, year: current.year + 1 }))}
                  style={[styles.omMonthArrow, selectedMonth.year >= 2026 && styles.omMonthArrowDisabled]}
                >
                  <Text style={styles.omMonthArrowText}>›</Text>
                </Pressable>
              </View>
              <View style={styles.omMonthGrid}>
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((monthName, monthIndex) => {
                  const selected = selectedMonth.year === (selectedMonth.year) && selectedMonth.month === monthIndex;
                  const disabled = selectedMonth.year === 2026 && monthIndex > 10;
                  return (
                    <Pressable
                      key={monthName}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled }}
                      disabled={disabled}
                      onPress={() => {
                        const year = selectedMonth.year;
                        const monthNumber = monthIndex + 1;
                        const lastDay = new Date(year, monthNumber, 0).getDate();
                        setSelectedMonth({ year, month: monthIndex });
                        setFromText(`${year}-${String(monthNumber).padStart(2, '0')}-01`);
                        setToText(`${year}-${String(monthNumber).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
                        setPeriod('Monthly');
                        if (activeSalesTab === 'Products') {
                          setProductSubTab('Monthly');
                        } else {
                          setActiveSalesTab('Monthly');
                        }
                        setMonthPickerVisible(false);
                      }}
                      style={[
                        styles.omMonthButton,
                        selected && styles.omMonthButtonSelected,
                        disabled && styles.omMonthButtonDisabled,
                      ]}
                    >
                      <Text style={[
                        styles.omMonthButtonText,
                        selected && styles.omMonthButtonTextSelected,
                        disabled && styles.omMonthButtonTextDisabled,
                      ]}>{monthName}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={weekPickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setWeekPickerVisible(false)}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close week selector"
            onPress={() => setWeekPickerVisible(false)}
            style={styles.omModalBackdrop}
          >
            <Pressable onPress={() => undefined} style={[styles.omBottomSheet, styles.omWeekSheet, { width: sheetWidth }]}>
              <View style={styles.omSheetHandle} />
              <Text style={styles.omBranchSheetTitle}>Select week</Text>
              {([
                { dropdownLabel: '9–15 Nov 2026', sheetLabel: '9 – 15 Nov 2026', start: '2026-11-09', end: '2026-11-15', current: true },
                { dropdownLabel: '2–8 Nov 2026', sheetLabel: '2 – 8 Nov 2026', start: '2026-11-02', end: '2026-11-08', current: false },
                { dropdownLabel: '26 Oct–1 Nov 2026', sheetLabel: '26 Oct – 1 Nov 2026', start: '2026-10-26', end: '2026-11-01', current: false },
                { dropdownLabel: '19–25 Oct 2026', sheetLabel: '19 – 25 Oct 2026', start: '2026-10-19', end: '2026-10-25', current: false },
                { dropdownLabel: '12–18 Oct 2026', sheetLabel: '12 – 18 Oct 2026', start: '2026-10-12', end: '2026-10-18', current: false },
              ] as const).map((week) => {
                const selected = selectedWeek.start === week.start;
                return (
                  <Pressable
                    key={week.start}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setSelectedWeek({
                        dropdownLabel: week.dropdownLabel,
                        sheetLabel: week.sheetLabel,
                        start: week.start,
                        end: week.end,
                      });
                      setFromText(week.start);
                      setToText(week.end);
                      setPeriod('Weekly');
                      if (activeSalesTab === 'Products') {
                        setProductSubTab('Weekly');
                      } else {
                        setActiveSalesTab('Weekly');
                      }
                      setWeekPickerVisible(false);
                    }}
                    style={[styles.omWeekOption, selected && styles.omWeekOptionSelected]}
                  >
                    <View style={styles.omWeekCopy}>
                      <Text style={[styles.omWeekTitle, selected && styles.omWeekTitleSelected]}>{week.sheetLabel}</Text>
                      <Text style={[styles.omWeekSubtitle, selected && styles.omWeekSubtitleSelected]}>
                        Mon – Sun{week.current ? ' · Current week' : ''}
                      </Text>
                    </View>
                    {selected && <Text style={styles.omWeekCheck}>✓</Text>}
                  </Pressable>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={branchPickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setBranchPickerVisible(false)}
        >
          <Pressable accessibilityRole="button" accessibilityLabel="Close branch selector" onPress={() => setBranchPickerVisible(false)} style={styles.omModalBackdrop}>
            <Pressable onPress={() => undefined} style={[styles.omBottomSheet, { width: sheetWidth }]}>
              <View style={styles.omSheetHandle} />
              <Text style={styles.omBranchSheetTitle}>Select a branch.</Text>
              {[{ id: null, name: 'All branches' }, ...branches].map((branch) => {
                const selected = branchId === branch.id;
                return (
                  <Pressable
                    key={branch.id ?? 'all'}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      changeBranch(branch.id);
                      if (activeSalesTab !== 'Products') setActiveSalesTab('Branch');
                      setBranchPickerVisible(false);
                    }}
                    style={[styles.omBranchOption, selected && styles.omBranchOptionSelected]}
                  >
                    <Text style={[styles.omBranchOptionText, selected && styles.omBranchOptionTextSelected]}>{branch.name}</Text>
                    {selected && <Text style={styles.omBranchCheck}>✓</Text>}
                  </Pressable>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.workspace}>
      <View style={styles.pageHeading}>
        <View style={styles.pageHeadingCopy}>
          <Text style={styles.subtitle}>
            Generate and export a branch- and date-filtered sales report.
          </Text>
        </View>
        {mode === 'reports' && onBack && (
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonText}>Back to sales</Text>
          </Pressable>
        )}
        {mode === 'reports' && reportData && (
          <Pressable
            accessibilityRole="button"
            disabled={exporting}
            onPress={() => void downloadCsv()}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, exporting && styles.disabled]}
          >
            <Text style={styles.secondaryButtonText}>{exporting ? 'Preparing…' : 'Export CSV'}</Text>
          </Pressable>
        )}
      </View>

      {filterPanel}
      {exportError !== '' && (
        <View accessibilityRole="alert" style={styles.errorBanner}>
          <Text style={styles.errorText}>{exportError}</Text>
          <Pressable accessibilityRole="button" onPress={() => setExportError('')}>
            <Text style={styles.retryText}>Dismiss</Text>
          </Pressable>
        </View>
      )}
      {error !== '' && (
        <View accessibilityRole="alert" style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {mode === 'reports' && reportData && (
        <View style={styles.reportMeta}>
          <Text style={styles.reportMetaText}>
            {title} · {range?.startText} – {range?.endText} · {branchName}
          </Text>
          {generatedAt && <Text style={styles.reportMetaText}>Generated {generatedAt.toLocaleString('en-PH')}</Text>}
        </View>
      )}

      {loading && !data ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="small" color={ownerColors.primary} />
          <Text style={styles.bodyText}>{mode === 'reports' ? 'Generating report…' : 'Loading recorded sales…'}</Text>
        </View>
      ) : !data ? (
        mode === 'reports' ? (
          <View style={styles.emptyCard}>
            <Text style={styles.panelTitle}>Report not generated</Text>
            <Text style={styles.bodyText}>Choose a reporting period and branch, then generate the report.</Text>
          </View>
        ) : error === '' ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="small" color={ownerColors.primary} />
            <Text style={styles.bodyText}>Loading recorded sales…</Text>
          </View>
        ) : null
      ) : (
        <>
          {unresolvedSales.length > 0 && (
            <View style={styles.reconciliationBanner}>
              <Text style={styles.reconciliationTitle}>
                {unresolvedSales.length} recorded sale{unresolvedSales.length === 1 ? '' : 's'} need inventory processing
              </Text>
              <Text style={styles.reconciliationText}>
                These sales remain visible in the transaction list, but are not confirmed inventory outcomes until Staff retry processing.
              </Text>
            </View>
          )}
          <View style={styles.bentoGrid}>
            <View style={[styles.heroCard, { width: medium ? contentWidth * 0.58 - 6 : contentWidth }]}>
              <Text style={styles.heroEyebrow}>RECORDED COMPLETED SALES</Text>
              <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>{currency(totalSales)}</Text>
              <Text style={styles.heroDetail}>{range?.startText} – {range?.endText} · {branchName}</Text>
            </View>
            <View style={[styles.metricCard, styles.transactionMetric, { width: medium ? contentWidth * 0.42 - 6 : contentWidth }]}>
              <Text style={styles.metricLabel}>Completed transactions</Text>
              <Text style={styles.metricValue}>{sales.length.toLocaleString('en-PH')}</Text>
              <Text style={styles.metricHint}>Recorded as completed</Text>
            </View>
            <View style={[styles.metricCard, { width: twoColumnWidth }]}>
              <Text style={styles.metricLabel}>Average transaction</Text>
              <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{sales.length ? currency(average) : '—'}</Text>
              <Text style={styles.metricHint}>Total sales ÷ completed transactions</Text>
            </View>
            <View style={[styles.metricCard, { width: twoColumnWidth }]}>
              <Text style={styles.metricLabel}>Sales today</Text>
              <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
                {currency((data.todaySales ?? []).reduce((sum, sale) => sum + Number(sale.total_amount), 0))}
              </Text>
              <Text style={styles.metricHint}>Current business day</Text>
            </View>
            <View style={[styles.metricCard, { width: twoColumnWidth }]}>
              <Text style={styles.metricLabel}>Sales comparison</Text>
              <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
                {previousSales.length ? `${salesChange >= 0 ? '+' : '−'}${currency(Math.abs(salesChange))}` : '—'}
              </Text>
              <Text style={styles.metricHint}>
                {previousSales.length
                  ? `vs prior ${comparisonDays} ${comparisonDays === 1 ? 'day' : 'days'} · ${previousTotal ? `${((salesChange / previousTotal) * 100).toFixed(1)}%` : 'prior period had no sales'}`
                  : `No completed sales in the prior ${comparisonDays} ${comparisonDays === 1 ? 'day' : 'days'}`}
              </Text>
            </View>
            <View style={[styles.metricCard, { width: twoColumnWidth }]}>
              <Text style={styles.metricLabel}>Best performing branch</Text>
              <Text style={styles.metricValueSmall} numberOfLines={1}>
                {bestBranch?.name ?? '—'}
              </Text>
              <Text style={styles.metricHint}>{bestBranch ? currency(bestBranch.total) : 'No completed sales in this period'}</Text>
            </View>
            <View style={[styles.metricCard, { width: twoColumnWidth }]}>
              <Text style={styles.metricLabel}>Best-selling product</Text>
              <Text style={styles.metricValueSmall} numberOfLines={1}>
                {products[0]?.name ?? '—'}
              </Text>
              <Text style={styles.metricHint}>
                {products[0] ? `${products[0].quantity} sold · ${currency(products[0].total)}` : 'Product line data unavailable'}
              </Text>
            </View>
          </View>

          <View style={styles.bentoGrid}>
            <View style={[styles.panel, { width: detailLeftWidth }]}>
              <Text style={styles.panelTitle}>Sales performance</Text>
              <Text style={styles.panelCaption}>Recorded sales by {period === 'Daily' || period === 'Today' ? 'time of day' : trend.length > 45 ? 'week' : 'day'}</Text>
              {sales.length === 0 ? (
                <Text style={styles.bodyText}>No completed sales in this period.</Text>
              ) : (
                <>
                  {selectedTrend && (
                    <Text style={styles.selectedTrend}>{selectedTrend.label} · {currency(selectedTrend.total)}</Text>
                  )}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.chart}>
                      {trend.map((point) => {
                        const barHeight = trendMax ? Math.max(point.total > 0 ? 5 : 0, point.total / trendMax * 100) : 0;
                        const selected = selectedBucket === point.label;
                        return (
                          <Pressable
                            key={`${point.start}-${point.label}`}
                            accessibilityRole="button"
                            accessibilityLabel={`${point.label}, ${currency(point.total)}`}
                            accessibilityState={{ selected }}
                            onPress={() => setSelectedBucket(selected ? null : point.label)}
                            style={styles.chartColumn}
                          >
                            <Text style={styles.chartAmount}>{point.total > 0 ? currency(point.total) : ''}</Text>
                            <View style={styles.chartTrack}>
                              <View style={[styles.chartBar, { height: `${barHeight}%` }, selected && styles.chartBarSelected]} />
                            </View>
                            <Text style={styles.chartLabel}>{point.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </>
              )}
            </View>
            <View style={[styles.panel, { width: detailRightWidth }]}>
              <Text style={styles.panelTitle}>Branch performance</Text>
              <Text style={styles.panelCaption}>Ranked by completed sales in this period</Text>
              {branchMetrics.length === 0 ? (
                <Text style={styles.bodyText}>No branch records are available.</Text>
              ) : branchMetrics.map((branch, index) => {
                const max = branchMetrics[0]?.total ?? 0;
                return (
                  <View key={branch.id} style={styles.branchRow}>
                    <View style={styles.branchRowHeader}>
                      <Text style={styles.branchName} numberOfLines={1}>{index + 1}. {branch.name}</Text>
                      <Text style={styles.branchTotal}>{currency(branch.total)}</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressBar, { width: `${max ? branch.total / max * 100 : 0}%` }]} />
                    </View>
                    <Text style={styles.panelCaption}>
                      {branch.transactions} transactions · average {branch.transactions ? currency(branch.average) : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View style={[styles.panel, { width: twoColumnWidth }]}>
              <View style={styles.panelHeadingRow}>
                <View>
                  <Text style={styles.panelTitle}>Product sales</Text>
                  <Text style={styles.panelCaption}>Ranked by quantity sold</Text>
                </View>
                {products.length > 8 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showAllProducts }}
                    onPress={() => setShowAllProducts((value) => !value)}
                  >
                    <Text style={styles.linkText}>{showAllProducts ? 'Show less' : 'View all'}</Text>
                  </Pressable>
                )}
              </View>
              {products.length === 0 ? (
                <Text style={styles.bodyText}>{PRODUCTS_SOLD_EMPTY_MESSAGE}</Text>
              ) : products.slice(0, showAllProducts ? undefined : 8).map((product, index) => {
                const maximum = products[0]?.quantity ?? 0;
                return (
                  <View key={product.id} style={styles.productRow}>
                    <Text style={styles.rank}>{String(index + 1).padStart(2, '0')}</Text>
                    <View style={styles.productCopy}>
                      <View style={styles.branchRowHeader}>
                        <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
                        <Text style={styles.productSales}>{product.quantity} · {currency(product.total)}</Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressBar, styles.productBar, { width: `${maximum ? product.quantity / maximum * 100 : 0}%` }]} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
            <View style={[styles.panel, { width: twoColumnWidth }]}>
              <Text style={styles.panelTitle}>Payment methods</Text>
              <Text style={styles.panelCaption}>Share of completed recorded sales</Text>
              {!sales.length ? (
                <Text style={styles.bodyText}>No completed sales are available for payment analysis.</Text>
              ) : !paymentSectionAvailable ? (
                <Text style={styles.bodyText}>Payment method information is unavailable for these sales.</Text>
              ) : (
                payments.map((payment) => {
                  const share = paymentTotal ? payment.total / paymentTotal : 0;
                  return (
                    <View key={payment.name} style={styles.paymentRow}>
                      <View style={styles.branchRowHeader}>
                        <Text style={styles.productName}>{payment.name}</Text>
                        <Text style={styles.productSales}>{(share * 100).toFixed(1)}%</Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressBar, styles.paymentBar, { width: `${share * 100}%` }]} />
                      </View>
                      <Text style={styles.panelCaption}>{payment.transactions} transactions · {currency(payment.total)}</Text>
                    </View>
                  );
                })
              )}
            </View>
          </View>

          <View style={styles.panel}>
            <View style={styles.tableHeading}>
              <View style={styles.tableTitleGroup}>
                <Text style={styles.panelTitle}>Sales transactions</Text>
                <Text style={styles.panelCaption}>{transactionRows.length} completed records</Text>
              </View>
              {mode === 'reports' && (
                <Pressable
                  accessibilityRole="button"
                  disabled={exporting}
                  onPress={() => void downloadCsv()}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, exporting && styles.disabled]}
                >
                  <Text style={styles.secondaryButtonText}>{exporting ? 'Preparing…' : 'Export CSV'}</Text>
                </Pressable>
              )}
            </View>
            <View style={[styles.tableTools, medium && styles.tableToolsWide]}>
              <TextInput
                accessibilityLabel="Search transactions"
                value={search}
                onChangeText={(value) => {
                  setSearch(value);
                  setPage(0);
                }}
                placeholder="Search reference, product, payment, branch"
                placeholderTextColor="#858591"
                style={[styles.input, styles.searchInput]}
              />
              <View style={styles.sortButtons}>
                {([
                  ['date', 'Latest'],
                  ['amount', 'Amount'],
                  ['reference', 'Reference'],
                ] as const).map(([value, label]) => (
                  <ChoiceChip
                    key={value}
                    label={label}
                    selected={sortBy === value}
                    onPress={() => {
                      setSortBy(value);
                      setPage(0);
                    }}
                  />
                ))}
              </View>
              <View style={styles.sortButtons}>
                {([
                  ['all', 'All recorded'],
                  ['confirmed', 'Inventory confirmed'],
                  ['needs_processing', 'Needs processing'],
                ] as const).map(([value, label]) => (
                  <ChoiceChip
                    key={value}
                    label={label}
                    selected={inventoryFilter === value}
                    onPress={() => {
                      setInventoryFilter(value);
                      setPage(0);
                    }}
                  />
                ))}
              </View>
            </View>
            {visibleRows.length === 0 ? (
              <Text style={styles.bodyText}>
                {sales.length === 0 ? 'No completed transactions in this report.' : 'No transactions match this search.'}
              </Text>
            ) : compact ? (
              <View style={styles.mobileTransactionList}>
                {visibleRows.map(({ sale, branch, summary, quantity }) => {
                  const expanded = expandedSaleId === sale.id;
                  const saleItems = productBySale.get(sale.id) ?? [];
                  const inventoryStatus = getOwnerSaleInventoryStatusLabel(sale);
                  const inventoryStatusStyle = inventoryStatus === 'Failed'
                    ? styles.failedStatus
                    : inventoryStatus === 'Pending' || inventoryStatus === 'Processing'
                      ? styles.pendingStatus
                      : styles.completedStatus;
                  return (
                    <Pressable
                      key={sale.id}
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      accessibilityLabel={`${sale.transaction_reference}, ${currency(Number(sale.total_amount))}, ${expanded ? 'hide' : 'view'} details`}
                      onPress={() => setExpandedSaleId(expanded ? null : sale.id)}
                      style={[styles.mobileTransaction, expanded && styles.expandedRow]}
                    >
                      <View style={styles.transactionTopLine}>
                        <Text style={styles.transactionReference} numberOfLines={1}>{sale.transaction_reference}</Text>
                        <Text style={styles.transactionTotal}>{currency(Number(sale.total_amount))}</Text>
                      </View>
                      <Text style={styles.transactionMeta}>{compactDate(sale.created_at)} · {branch}</Text>
                      <Text style={styles.transactionProducts} numberOfLines={expanded ? undefined : 2}>
                        {summary}{quantity ? ` · ${quantity} items` : ''}
                      </Text>
                      <View style={styles.transactionBottomLine}>
                        <Text style={styles.transactionMeta}>{sale.payment_method || 'Payment unavailable'}</Text>
                        <Text style={inventoryStatusStyle}>{inventoryStatus} · {expanded ? 'Hide details' : 'View details'}</Text>
                      </View>
                      {expanded && (
                        <View style={styles.transactionDetails}>
                          {saleItems.length ? saleItems.map((item) => (
                            <View key={item.id} style={styles.transactionDetailRow}>
                              <Text style={styles.transactionDetailName}>
                                {item.quantity} × {item.product_name} · {currency(Number(item.unit_price))}
                              </Text>
                              <Text style={styles.transactionDetailSubtotal}>{currency(Number(item.subtotal))}</Text>
                            </View>
                          )) : (
                            <Text style={styles.transactionMeta}>Product details are not available for this transaction.</Text>
                          )}
                          <View style={styles.transactionDetailRow}>
                            <Text style={styles.transactionDetailName}>Transaction status</Text>
                            <Text style={inventoryStatusStyle}>{inventoryStatus}</Text>
                          </View>
                          {sale.inventory_processing_error ? (
                            <View style={styles.transactionDetailRow}>
                              <Text style={styles.transactionDetailName}>Inventory processing</Text>
                              <Text style={styles.failedStatus}>{sale.inventory_processing_error}</Text>
                            </View>
                          ) : null}
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View style={styles.table}>
                  <View style={[styles.tableRow, styles.tableHeaderRow]}>
                    <Text style={[styles.tableHeader, styles.referenceColumn]}>REFERENCE</Text>
                    <Text style={[styles.tableHeader, styles.dateColumn]}>DATE / TIME</Text>
                    <Text style={[styles.tableHeader, styles.branchColumn]}>BRANCH</Text>
                    <Text style={[styles.tableHeader, styles.summaryColumn]}>PRODUCTS</Text>
                    <Text style={[styles.tableHeader, styles.quantityColumn]}>QTY</Text>
                    <Text style={[styles.tableHeader, styles.paymentColumn]}>PAYMENT</Text>
                    <Text style={[styles.tableHeader, styles.amountColumn]}>TOTAL</Text>
                  </View>
                  {visibleRows.map(({ sale, branch, summary, quantity }) => {
                    const expanded = expandedSaleId === sale.id;
                    const inventoryStatus = getOwnerSaleInventoryStatusLabel(sale);
                    return (
                      <Pressable
                        key={sale.id}
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        onPress={() => setExpandedSaleId(expanded ? null : sale.id)}
                        style={[styles.tableRow, expanded && styles.expandedRow]}
                      >
                        <Text style={[styles.tableCell, styles.referenceColumn]} numberOfLines={1}>{sale.transaction_reference}</Text>
                        <Text style={[styles.tableCell, styles.dateColumn]} numberOfLines={2}>{compactDate(sale.created_at)}</Text>
                        <Text style={[styles.tableCell, styles.branchColumn]} numberOfLines={1}>{branch}</Text>
                        <Text style={[styles.tableCell, styles.summaryColumn]} numberOfLines={expanded ? undefined : 2}>
                          {expanded ? `${summary} · ${sale.payment_method} · ${inventoryStatus}` : `${summary}${inventoryStatus !== 'Completed' ? ` · ${inventoryStatus}` : ''}`}
                        </Text>
                        <Text style={[styles.tableCell, styles.quantityColumn]}>{quantity || '—'}</Text>
                        <Text style={[styles.tableCell, styles.paymentColumn]}>{sale.payment_method || '—'}</Text>
                        <Text style={[styles.tableCell, styles.amountColumn]}>{currency(Number(sale.total_amount))}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            )}
            <View style={styles.pagination}>
              <Text style={styles.panelCaption}>
                {transactionRows.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, transactionRows.length)} of ${transactionRows.length}` : '0 records'}
              </Text>
              <View style={styles.paginationButtons}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous transaction page"
                  disabled={currentPage === 0}
                  onPress={() => setPage(currentPage - 1)}
                  style={[styles.pageButton, currentPage === 0 && styles.disabled]}
                >
                  <Text style={styles.pageButtonText}>Previous</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next transaction page"
                  disabled={currentPage + 1 >= pageCount}
                  onPress={() => setPage(currentPage + 1)}
                  style={[styles.pageButton, currentPage + 1 >= pageCount && styles.disabled]}
                >
                  <Text style={styles.pageButtonText}>Next</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function useStyles() {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(createThemedStyles({
    workspace: { width: '100%', paddingBottom: 15 },
    omWorkspace: { width: '100%', minHeight: '100%', paddingBottom: 18 },
    omPageTitle: { color: '#0F1025', fontFamily: 'Poppins_700Bold', fontSize: 20, marginBottom: 12 },
    omSearchWrap: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 10, borderRadius: 12, backgroundColor: '#F5F5F7' },
    omSearchIcon: { color: '#858591', fontFamily: 'Poppins_600SemiBold', fontSize: 16, marginRight: 7 },
    omSearchInput: { flex: 1, height: '100%', color: '#171724', fontFamily: 'Poppins_400Regular', fontSize: 10, paddingVertical: 0 },
    omClearSearch: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    omClearSearchText: { color: '#858591', fontFamily: 'Poppins_600SemiBold', fontSize: 18 },
    omTabRow: { flexDirection: 'row', gap: 7, paddingBottom: 10 },
    omTab: { minHeight: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, borderRadius: 17, backgroundColor: '#F5F5F7' },
    omTabSelected: { backgroundColor: '#EC1358' },
    omTabSelectedNavy: { backgroundColor: DAILY_SALES_THEME.navy },
    omTabText: { color: '#626270', fontFamily: 'Poppins_500Medium', fontSize: 9 },
    omTabTextSelected: { color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold' },
    omSelectorRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    omDateSelector: { flex: 1.45, height: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#F5F5F7' },
    omBranchSelector: { flex: 1, height: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#F5F5F7' },
    omSelectorIcon: { color: '#626270', fontFamily: 'Poppins_600SemiBold', fontSize: 11, marginRight: 5 },
    omSelectorText: { flex: 1, color: '#343440', fontFamily: 'Poppins_500Medium', fontSize: 8 },
    omSelectorChevron: { color: '#858591', fontFamily: 'Poppins_600SemiBold', fontSize: 10, marginLeft: 4 },
    omSalesCard: { minHeight: 112, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 14, marginBottom: 14, borderRadius: 16, backgroundColor: '#EC1358' },
    omSalesCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    omSalesCardLabel: { color: '#FFFFFF', fontFamily: 'Poppins_500Medium', fontSize: 10 },
    omLockIcon: { color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
    omSalesAmount: { color: '#FFFFFF', fontFamily: 'Poppins_700Bold', fontSize: 30, lineHeight: 38, marginTop: 5 },
    omLoadingText: { color: DAILY_SALES_THEME.secondaryText, fontFamily: DAILY_SALES_THEME.font.regular, fontSize: 10, textAlign: 'center', marginTop: 10 },
    omSkeletonCard: { minHeight: 112, justifyContent: 'center', paddingHorizontal: 18, marginBottom: 14, borderRadius: 16, backgroundColor: '#EC1358' },
    omSkeletonLabel: { width: 100, height: 8, borderRadius: 4, backgroundColor: '#F7A7C2' },
    omSkeletonAmount: { width: 80, height: 22, borderRadius: 6, backgroundColor: '#F7A7C2', marginTop: 10 },
    omProductLoadingCard: { height: 112, justifyContent: 'flex-end', paddingHorizontal: 18, paddingBottom: 18, marginBottom: 14, borderRadius: DAILY_SALES_THEME.radius.totalCard, backgroundColor: DAILY_SALES_THEME.primary },
    omProductSkeletonIcon: { position: 'absolute', width: 16, height: 16, right: 14, top: 12, borderRadius: 8, backgroundColor: '#F7A7C2' },
    omProductSkeletonLong: { width: '72%', height: 8, borderRadius: 4, backgroundColor: '#F7A7C2', marginBottom: 8 },
    omProductSkeletonShort: { width: '46%', height: 14, borderRadius: 5, backgroundColor: '#F7A7C2' },
    omLoadingCenter: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
    omSpinner: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 3, borderColor: '#F8B6CB', borderTopColor: '#EC1358' },
    omSpinnerText: { color: 'transparent', fontSize: 1 },
    omErrorCard: { minHeight: 112, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginBottom: 14, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EEEEF1' },
    omErrorCenter: { minHeight: 300, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    omWifiOffIcon: { color: '#EC1358', fontFamily: 'Poppins_700Bold', fontSize: 32, lineHeight: 36, marginBottom: 10 },
    omErrorText: { maxWidth: 220, color: '#343440', fontFamily: 'Poppins_400Regular', fontSize: 11, lineHeight: 16, textAlign: 'center' },
    omRetryButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: '#EC1358', backgroundColor: '#FFFFFF' },
    omRetryIcon: { color: '#EC1358', fontFamily: 'Poppins_600SemiBold', fontSize: 11, marginRight: 6 },
    omRetryText: { color: '#EC1358', fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
    omTransactionsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    omTransactionsTitle: { color: '#0F1025', fontFamily: 'Poppins_700Bold', fontSize: 12 },
    omNewestText: { color: '#EC1358', fontFamily: 'Poppins_600SemiBold', fontSize: 8 },
    omProductRankCard: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, borderRadius: DAILY_SALES_THEME.radius.card, backgroundColor: DAILY_SALES_THEME.neutral },
    omProductRankBadge: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 9, marginRight: 8, backgroundColor: DAILY_SALES_THEME.navy },
    omProductRankText: { color: DAILY_SALES_THEME.white, fontFamily: DAILY_SALES_THEME.font.bold, fontSize: 9, lineHeight: 11 },
    omProductRankCopy: { flex: 1, minWidth: 0 },
    omProductRankTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
    omProductName: { flex: 1, color: DAILY_SALES_THEME.navy, fontFamily: DAILY_SALES_THEME.font.bold, fontSize: 11, marginRight: 8 },
    omProductSold: { color: DAILY_SALES_THEME.navy, fontFamily: DAILY_SALES_THEME.font.bold, fontSize: 10 },
    omProductProgressTrack: { width: '100%', height: 5, overflow: 'hidden', borderRadius: 3, backgroundColor: DAILY_SALES_THEME.border },
    omProductProgressBar: { height: 5, borderRadius: 3, backgroundColor: DAILY_SALES_THEME.primary },
    omTransactionCard: { minHeight: 70, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8, borderRadius: 13, backgroundColor: '#F5F5F7' },
    omPressed: { opacity: 0.76 },
    omTransactionCopy: { flex: 1, minWidth: 0 },
    omTransactionId: { color: '#0F1025', fontFamily: 'Poppins_700Bold', fontSize: 9 },
    omTransactionMeta: { color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 8, lineHeight: 12, marginTop: 2 },
    omTransactionAmount: { color: '#0F1025', fontFamily: 'Poppins_700Bold', fontSize: 9, marginLeft: 7 },
    omTransactionChevron: { color: '#858591', fontFamily: 'Poppins_600SemiBold', fontSize: 18, marginLeft: 8 },
    omEmptyCard: { minHeight: 160, alignItems: 'center', justifyContent: 'center' },
    omEmptyIcon: { color: '#858591', fontFamily: 'Poppins_600SemiBold', fontSize: 28, marginBottom: 8 },
    omEmptyText: { color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 9, textAlign: 'center', marginTop: 8 },
    omModalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', backgroundColor: 'rgba(15,16,37,0.50)' },
    omBottomSheet: { width: '100%', maxWidth: 390, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 22, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF' },
    omSheetHandle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 2, marginBottom: 12, backgroundColor: '#D8D8DE' },
    omCalendarHeader: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    omCalendarArrow: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
    omCalendarArrowText: { color: '#EC1358', fontFamily: 'Poppins_700Bold', fontSize: 22 },
    omCalendarTitle: { color: '#0F1025', fontFamily: 'Poppins_700Bold', fontSize: 13 },
    omCalendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    omCalendarDay: { width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
    omCalendarDaySelected: { backgroundColor: '#EC1358' },
    omCalendarDayText: { color: '#343440', fontFamily: 'Poppins_500Medium', fontSize: 9 },
    omCalendarDayTextSelected: { color: '#FFFFFF', fontFamily: 'Poppins_700Bold' },
    omCalendarDayDisabled: { color: '#C9C9C9' },
    omApplyButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 10, borderRadius: 24, backgroundColor: '#EC1358' },
    omApplyText: { color: '#FFFFFF', fontFamily: 'Poppins_700Bold', fontSize: 11 },
    omBranchSheetTitle: { color: '#0F1025', fontFamily: 'Poppins_700Bold', fontSize: 16, textAlign: 'center', marginBottom: 14 },
    omBranchOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, marginBottom: 8, borderRadius: 12, backgroundColor: '#F5F5F7' },
    omBranchOptionSelected: { backgroundColor: '#EC1358' },
    omBranchOptionText: { color: '#343440', fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
    omBranchOptionTextSelected: { color: '#FFFFFF' },
    omBranchCheck: { color: '#FFFFFF', fontFamily: 'Poppins_700Bold', fontSize: 12 },
    omBranchDivider: { height: 1, width: '120%', marginLeft: '-10%', backgroundColor: DAILY_SALES_THEME.border, marginBottom: 8 },
    omBranchSubTabRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 10 },
    omBranchSubTab: { minHeight: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#F5F5F7' },
    omBranchSubTabSelected: { backgroundColor: DAILY_SALES_THEME.primary },
    omBranchSubTabText: { color: DAILY_SALES_THEME.navy, fontFamily: DAILY_SALES_THEME.font.medium, fontSize: 9 },
    omBranchSubTabTextSelected: { color: DAILY_SALES_THEME.white, fontFamily: DAILY_SALES_THEME.font.semibold },
    omBranchCard: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 8, borderRadius: DAILY_SALES_THEME.radius.card, backgroundColor: DAILY_SALES_THEME.neutral },
    omBranchIconTile: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8, marginRight: 9, backgroundColor: DAILY_SALES_THEME.warning },
    omBranchPin: { color: DAILY_SALES_THEME.navy, fontFamily: DAILY_SALES_THEME.font.bold, fontSize: 14 },
    omBranchCopy: { flex: 1, minWidth: 0 },
    omBranchName: { color: DAILY_SALES_THEME.navy, fontFamily: DAILY_SALES_THEME.font.bold, fontSize: 11 },
    omBranchSupporting: { color: DAILY_SALES_THEME.secondaryText, fontFamily: DAILY_SALES_THEME.font.regular, fontSize: 8, marginTop: 2 },
    omBranchAmount: { color: DAILY_SALES_THEME.navy, fontFamily: DAILY_SALES_THEME.font.bold, fontSize: 10, marginLeft: 6 },
    omMonthSheet: { paddingBottom: 18 },
    omMonthHeader: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    omMonthArrow: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    omMonthArrowDisabled: { opacity: 0.35 },
    omMonthArrowText: { color: DAILY_SALES_THEME.navy, fontFamily: DAILY_SALES_THEME.font.bold, fontSize: 20 },
    omMonthYear: { minWidth: 86, color: DAILY_SALES_THEME.navy, fontFamily: DAILY_SALES_THEME.font.bold, fontSize: 13, textAlign: 'center' },
    omMonthGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
    omMonthButton: { width: '31.5%', height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: DAILY_SALES_THEME.neutral },
    omMonthButtonSelected: { backgroundColor: DAILY_SALES_THEME.primary },
    omMonthButtonDisabled: { backgroundColor: DAILY_SALES_THEME.neutral, opacity: 0.72 },
    omMonthButtonText: { color: DAILY_SALES_THEME.navy, fontFamily: DAILY_SALES_THEME.font.semibold, fontSize: 10 },
    omMonthButtonTextSelected: { color: DAILY_SALES_THEME.white, fontFamily: DAILY_SALES_THEME.font.bold },
    omMonthButtonTextDisabled: { color: DAILY_SALES_THEME.disabledText },
    omWeekSheet: { paddingBottom: 18 },
    omWeekOption: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, marginBottom: 8, borderRadius: 12, backgroundColor: '#F5F5F7' },
    omWeekOptionSelected: { backgroundColor: '#EC1358' },
    omWeekCopy: { flex: 1 },
    omWeekTitle: { color: '#0F1025', fontFamily: 'Poppins_700Bold', fontSize: 10 },
    omWeekTitleSelected: { color: '#FFFFFF' },
    omWeekSubtitle: { color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 8, marginTop: 2 },
    omWeekSubtitleSelected: { color: '#FFFFFF' },
    omWeekCheck: { color: '#FFFFFF', fontFamily: 'Poppins_700Bold', fontSize: 13, marginLeft: 8 },
    omHeader: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    omBackButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    omBackText: { color: '#EC1358', fontFamily: 'Poppins_700Bold', fontSize: 28, lineHeight: 30 },
    omHeaderTitle: { color: '#0F1025', fontFamily: 'Poppins_700Bold', fontSize: 16 },
    omHeaderSpacer: { width: 38 },
    omDetailCard: { padding: 14, marginBottom: 10, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EEEEF1' },
    omDetailTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EEEEF1' },
    omDetailReference: { color: '#0F1025', fontFamily: 'Poppins_700Bold', fontSize: 12 },
    omRecordedBadge: { minHeight: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 12, backgroundColor: '#E8F6EC' },
    omRecordedText: { color: '#589144', fontFamily: 'Poppins_600SemiBold', fontSize: 8 },
    omDetailRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: '#EEEEF1' },
    omDetailLabel: { color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 8 },
    omDetailValue: { flex: 1, color: '#343440', fontFamily: 'Poppins_600SemiBold', fontSize: 8, textAlign: 'right' },
    omDetailSectionTitle: { color: '#0F1025', fontFamily: 'Poppins_700Bold', fontSize: 12, marginBottom: 5 },
    omItemRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#EEEEF1' },
    omItemCopy: { flex: 1 },
    omItemName: { color: '#343440', fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
    omItemMeta: { color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 8, marginTop: 2 },
    omItemAmount: { color: '#343440', fontFamily: 'Poppins_700Bold', fontSize: 9 },
    omItemTotalRow: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    omItemTotalLabel: { color: '#0F1025', fontFamily: 'Poppins_700Bold', fontSize: 11 },
    omItemTotalAmount: { color: '#0F1025', fontFamily: 'Poppins_700Bold', fontSize: 12 },
    omDetailUnavailable: { color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 8, lineHeight: 12, marginTop: 7 },
    omReadOnly: { height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    omReadOnlyText: { color: '#858591', fontFamily: 'Poppins_500Medium', fontSize: 8, marginLeft: 6 },
    pageHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    pageHeadingCopy: { flex: 1, paddingRight: 10 },
    subtitle: { color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 10, lineHeight: 15, marginTop: 2 },
    headingActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    refreshButton: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FCE3EB' },
    refreshText: { color: ownerColors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: 22, lineHeight: 25 },
    filterCard: { padding: 14, marginBottom: 14, borderRadius: 16, borderWidth: 1, borderColor: '#EEEEF1', backgroundColor: '#FFFFFF' },
    filterLabel: { color: '#555563', fontFamily: 'Poppins_600SemiBold', fontSize: 10, marginBottom: 7 },
    chipRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 8, backgroundColor: '#F5F5F7', borderWidth: 1, borderColor: '#EEEEF1' },
    chipSelected: { backgroundColor: '#FCE3EB', borderColor: '#F4B6C8' },
    chipText: { color: '#626270', fontFamily: 'Poppins_500Medium', fontSize: 9 },
    chipTextSelected: { color: ownerColors.primary, fontFamily: 'Poppins_600SemiBold' },
    dateRow: { flexDirection: 'column', gap: 10, marginTop: 13 },
    dateRowWide: { flexDirection: 'row' },
    dateField: { flex: 1 },
    input: { minHeight: 40, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, borderColor: '#E9E9ED', backgroundColor: '#EEEEEF', color: '#171724', fontFamily: 'Poppins_400Regular', fontSize: 10 },
    branchLabel: { marginTop: 13 },
    rangeHint: { color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 9, marginTop: 10 },
    primaryButton: { minHeight: 48, borderRadius: 8, backgroundColor: ownerColors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 13, paddingHorizontal: 18 },
    primaryButtonText: { color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
    secondaryButton: { minHeight: 40, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: ownerColors.primary, backgroundColor: '#FFFFFF' },
    secondaryButtonText: { color: ownerColors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
    pressed: { opacity: 0.76 },
    disabled: { opacity: 0.5 },
    errorBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, marginBottom: 13, borderRadius: 12, backgroundColor: '#FCE9EB' },
    errorText: { flex: 1, color: '#C92F3C', fontFamily: 'Poppins_500Medium', fontSize: 9, lineHeight: 14 },
    retryText: { color: ownerColors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
    reconciliationBanner: { padding: 12, marginBottom: 13, borderRadius: 12, borderWidth: 1, borderColor: '#F8D28A', backgroundColor: '#FFF8E7' },
    reconciliationTitle: { color: '#8A5A00', fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
    reconciliationText: { color: '#8A5A00', fontFamily: 'Poppins_400Regular', fontSize: 8, lineHeight: 13, marginTop: 4 },
    reportMeta: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 5, marginBottom: 11 },
    reportMetaText: { color: '#777783', fontFamily: 'Poppins_400Regular', fontSize: 9 },
    loadingCard: { minHeight: 105, alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 16, borderWidth: 1, borderColor: '#EEEEF1', backgroundColor: '#FFFFFF' },
    emptyCard: { minHeight: 105, justifyContent: 'center', padding: 17, borderRadius: 16, borderWidth: 1, borderColor: '#EEEEF1', backgroundColor: '#FFFFFF' },
    bodyText: { color: '#777783', fontFamily: 'Poppins_400Regular', fontSize: 9, lineHeight: 15, marginTop: 8 },
    bentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
    heroCard: { minHeight: 132, justifyContent: 'center', padding: 18, borderRadius: 18, backgroundColor: ownerColors.navy },
    heroEyebrow: { color: ownerColors.orange, fontFamily: 'Poppins_600SemiBold', fontSize: 8, letterSpacing: 0.5 },
    heroValue: { color: '#FFFFFF', fontFamily: 'Poppins_700Bold', fontSize: 30, lineHeight: 39, marginTop: 5 },
    heroDetail: { color: '#D5D5DF', fontFamily: 'Poppins_400Regular', fontSize: 9, marginTop: 4 },
    metricCard: { minHeight: 94, justifyContent: 'center', padding: 13, borderRadius: 16, borderWidth: 1, borderColor: '#EEEEF1', backgroundColor: '#FFFFFF' },
    transactionMetric: { borderColor: '#F4B6C8', backgroundColor: '#FFF5F8' },
    metricLabel: { color: '#777783', fontFamily: 'Poppins_500Medium', fontSize: 9, lineHeight: 13 },
    metricValue: { color: ownerColors.navy, fontFamily: 'Poppins_700Bold', fontSize: 19, lineHeight: 25, marginTop: 3 },
    metricValueSmall: { color: ownerColors.navy, fontFamily: 'Poppins_600SemiBold', fontSize: 12, lineHeight: 18, marginTop: 5 },
    metricHint: { color: '#9797A2', fontFamily: 'Poppins_400Regular', fontSize: 8, lineHeight: 12, marginTop: 3 },
    panel: { padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#EEEEF1', backgroundColor: '#FFFFFF', marginBottom: 12 },
    panelHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
    panelTitle: { color: ownerColors.navy, fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
    panelCaption: { color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 8, lineHeight: 13, marginTop: 2 },
    selectedTrend: { color: ownerColors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: 9, marginTop: 9 },
    chart: { height: 174, flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 12, paddingHorizontal: 2, marginTop: 8 },
    chartColumn: { width: 44, height: 158, alignItems: 'center', justifyContent: 'flex-end' },
    chartAmount: { width: 54, height: 14, textAlign: 'center', color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 6 },
    chartTrack: { width: 22, height: 108, justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 7, backgroundColor: '#F5F5F7', marginTop: 4 },
    chartBar: { width: '100%', minHeight: 0, borderTopLeftRadius: 7, borderTopRightRadius: 7, backgroundColor: ownerColors.primary },
    chartBarSelected: { backgroundColor: ownerColors.orange },
    chartLabel: { color: '#777783', fontFamily: 'Poppins_400Regular', fontSize: 7, marginTop: 5 },
    branchRow: { marginTop: 14 },
    branchRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    branchName: { flex: 1, color: '#343440', fontFamily: 'Poppins_500Medium', fontSize: 9 },
    branchTotal: { color: ownerColors.navy, fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
    progressTrack: { height: 6, overflow: 'hidden', borderRadius: 4, backgroundColor: '#F0F0F3', marginTop: 6 },
    progressBar: { height: '100%', borderRadius: 4, backgroundColor: ownerColors.orange },
    productBar: { backgroundColor: ownerColors.primary },
    paymentBar: { backgroundColor: '#595EC0' },
    productRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 },
    rank: { width: 22, color: ownerColors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
    productCopy: { flex: 1 },
    productName: { flex: 1, color: '#343440', fontFamily: 'Poppins_500Medium', fontSize: 9 },
    productSales: { color: '#777783', fontFamily: 'Poppins_500Medium', fontSize: 8 },
    linkText: { color: ownerColors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
    paymentRow: { marginTop: 13 },
    tableHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    tableTitleGroup: { flex: 1 },
    tableTools: { flexDirection: 'column', alignItems: 'stretch', gap: 9, marginVertical: 12 },
    tableToolsWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    searchInput: { flex: 1, minWidth: 200 },
    sortButtons: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    table: { minWidth: 900 },
    tableRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#EEEEF1' },
    tableHeaderRow: { minHeight: 36, backgroundColor: '#F5F5F7', borderRadius: 8, borderBottomWidth: 0 },
    expandedRow: { backgroundColor: '#FFF5F8' },
    tableHeader: { color: '#858591', fontFamily: 'Poppins_600SemiBold', fontSize: 7, paddingHorizontal: 8 },
    tableCell: { color: '#343440', fontFamily: 'Poppins_400Regular', fontSize: 8, lineHeight: 12, paddingHorizontal: 8, paddingVertical: 6 },
    referenceColumn: { width: 145 },
    dateColumn: { width: 135 },
    branchColumn: { width: 115 },
    summaryColumn: { width: 220 },
    quantityColumn: { width: 60, textAlign: 'center' },
    paymentColumn: { width: 100 },
    amountColumn: { width: 115, textAlign: 'right' },
    mobileTransactionList: { gap: 8, marginTop: 11 },
    mobileTransaction: { padding: 12, borderWidth: 1, borderColor: '#EEEEF1', borderRadius: 13, backgroundColor: '#FFFFFF' },
    transactionTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
    transactionReference: { flex: 1, color: ownerColors.navy, fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
    transactionTotal: { color: ownerColors.navy, fontFamily: 'Poppins_700Bold', fontSize: 10 },
    transactionMeta: { color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 8, lineHeight: 13, marginTop: 4 },
    transactionProducts: { color: '#343440', fontFamily: 'Poppins_500Medium', fontSize: 8, lineHeight: 13, marginTop: 7 },
    transactionBottomLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7, marginTop: 3 },
    completedStatus: { color: '#2F8C57', fontFamily: 'Poppins_600SemiBold', fontSize: 8 },
    pendingStatus: { color: '#D98600', fontFamily: 'Poppins_600SemiBold', fontSize: 8 },
    failedStatus: { color: '#C3224A', fontFamily: 'Poppins_600SemiBold', fontSize: 8 },
    transactionDetails: { marginTop: 9, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#EEEEF1', gap: 7 },
    transactionDetailRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    transactionDetailName: { flex: 1, color: '#555563', fontFamily: 'Poppins_400Regular', fontSize: 8, lineHeight: 12 },
    transactionDetailSubtotal: { color: '#343440', fontFamily: 'Poppins_600SemiBold', fontSize: 8 },
    pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 },
    paginationButtons: { flexDirection: 'row', gap: 7 },
    pageButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 16, backgroundColor: '#F5F5F7' },
    pageButtonText: { color: '#555563', fontFamily: 'Poppins_500Medium', fontSize: 8 },
  }, theme)), [theme]);
}
