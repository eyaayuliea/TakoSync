import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
  loadOwnerSalesData,
  type OwnerSale,
  type OwnerSaleItem,
  type OwnerSalesData,
} from '../services/takosync';

type Branch = { id: string; name: string };
type SalesMode = 'monitoring' | 'reports';
type Period = 'Today' | 'Daily' | 'Weekly' | 'Monthly' | 'Custom';
type DateRange = { start: Date; end: Date; startText: string; endText: string };
type ProductSummary = { id: string; name: string; quantity: number; total: number };
type PaymentSummary = { name: string; transactions: number; total: number };

const periods: Period[] = ['Today', 'Daily', 'Weekly', 'Monthly', 'Custom'];
const PAGE_SIZE = 10;

function localDateText(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

function getDateRange(period: Period, fromText: string, toText: string): DateRange | null {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let end = new Date(start);
  if (period === 'Today' || period === 'Daily') {
    end.setDate(end.getDate() + 1);
  } else if (period === 'Weekly') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end = new Date(start);
    end.setDate(end.getDate() + 7);
  } else if (period === 'Monthly') {
    start.setDate(1);
    end = new Date(start);
    end.setMonth(end.getMonth() + 1);
  } else {
    const parsedStart = parseLocalDate(fromText);
    const parsedEnd = parseLocalDate(toText);
    if (!parsedStart || !parsedEnd || parsedStart > parsedEnd) return null;
    return {
      start: parsedStart,
      end: new Date(parsedEnd.getFullYear(), parsedEnd.getMonth(), parsedEnd.getDate() + 1),
      startText: fromText,
      endText: toText,
    };
  }
  return {
    start,
    end,
    startText: localDateText(start),
    endText: localDateText(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1)),
  };
}

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

function summarizeProducts(items: OwnerSaleItem[]): ProductSummary[] {
  const grouped = new Map<string, ProductSummary>();
  for (const item of items) {
    const existing = grouped.get(item.product_id) ?? {
      id: item.product_id,
      name: item.product_name,
      quantity: 0,
      total: 0,
    };
    existing.quantity += Number(item.quantity);
    existing.total += Number(item.subtotal);
    grouped.set(item.product_id, existing);
  }
  return [...grouped.values()].sort((a, b) => b.quantity - a.quantity || b.total - a.total);
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
  availableWidth: number;
}) {
  const styles = useStyles();
  const wide = availableWidth >= 900;
  const medium = availableWidth >= 620;
  const contentWidth = Math.max(0, availableWidth);
  const twoColumnWidth = medium ? (contentWidth - 12) / 2 : contentWidth;
  const detailLeftWidth = wide ? contentWidth * 0.62 - 8 : twoColumnWidth;
  const detailRightWidth = wide ? contentWidth * 0.38 - 8 : twoColumnWidth;
  const today = localDateText(new Date());
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [fromText, setFromText] = useState(() => initialStartDate ?? localDateText(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
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
  const [page, setPage] = useState(0);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const compact = availableWidth < 620;

  const activeBranchId = mode === 'reports' && reportData ? reportBranchId : branchId;
  const range = mode === 'reports' && reportData ? reportRange : getDateRange(period, fromText, toText);
  const matchesInitialCustomRange = period !== 'Custom' ||
    (fromText === initialStartDate && toText === initialEndDate);

  useEffect(() => {
    if (mode !== 'monitoring') return undefined;
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
    const requestedRange = getDateRange(period, fromText, toText);
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
  }, [branchId, fromText, initialBranchId, initialData, initialLoading, initialPeriod, initialEndDate, initialStartDate, matchesInitialCustomRange, mode, period, retry, toText]);

  const generateReport = async () => {
    const requestedRange = getDateRange(period, fromText, toText);
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
  const items = data?.items ?? [];
  const products = useMemo(() => summarizeProducts(items), [items]);
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
          : new Date(b.sale.created_at).getTime() - new Date(a.sale.created_at).getTime());
  }, [branches, productBySale, sales, sortBy]);
  const transactionRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allTransactionRows.filter((row) =>
      !term || row.searchText.includes(term) || row.branch.toLowerCase().includes(term),
    );
  }, [allTransactionRows, search]);
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

  return (
    <View style={styles.workspace}>
      <View style={styles.pageHeading}>
        <View style={styles.pageHeadingCopy}>
          <Text style={styles.subtitle}>
            {mode === 'monitoring'
              ? 'Completed sales across your branches, from recorded transactions.'
              : 'Generate and export a branch- and date-filtered sales report.'}
          </Text>
        </View>
        {mode === 'monitoring' && (
          <View style={styles.headingActions}>
            {onOpenReports && (
              <Pressable
                accessibilityRole="button"
                onPress={onOpenReports}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryButtonText}>Reports</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh sales data"
              disabled={loading}
              onPress={() => setRetry((value) => value + 1)}
              style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed, loading && styles.disabled]}
            >
              {loading ? <ActivityIndicator size="small" color="#F20D55" /> : <Text style={styles.refreshText}>↻</Text>}
            </Pressable>
          </View>
        )}
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
          {mode === 'monitoring' && (
            <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          )}
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
          <ActivityIndicator size="small" color="#F20D55" />
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
            <ActivityIndicator size="small" color="#F20D55" />
            <Text style={styles.bodyText}>Loading recorded sales…</Text>
          </View>
        ) : null
      ) : (
        <>
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
                <Text style={styles.bodyText}>No product line items are available for completed sales in this period.</Text>
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
                        <Text style={styles.completedStatus}>Completed · {expanded ? 'Hide details' : 'View details'}</Text>
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
                            <Text style={styles.completedStatus}>Completed</Text>
                          </View>
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
                          {expanded ? `${summary} · ${sale.payment_method} · Completed` : summary}
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
    pageHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    pageHeadingCopy: { flex: 1, paddingRight: 10 },
    subtitle: { color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 10, lineHeight: 15, marginTop: 2 },
    headingActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    refreshButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FCE3EB' },
    refreshText: { color: '#F20D55', fontFamily: 'Poppins_600SemiBold', fontSize: 22, lineHeight: 25 },
    filterCard: { padding: 14, marginBottom: 14, borderRadius: 16, borderWidth: 1, borderColor: '#EEEEF1', backgroundColor: '#FFFFFF' },
    filterLabel: { color: '#555563', fontFamily: 'Poppins_600SemiBold', fontSize: 10, marginBottom: 7 },
    chipRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    chip: { minHeight: 31, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 16, backgroundColor: '#F5F5F7', borderWidth: 1, borderColor: '#EEEEF1' },
    chipSelected: { backgroundColor: '#FCE3EB', borderColor: '#F4B6C8' },
    chipText: { color: '#626270', fontFamily: 'Poppins_500Medium', fontSize: 9 },
    chipTextSelected: { color: '#F20D55', fontFamily: 'Poppins_600SemiBold' },
    dateRow: { flexDirection: 'column', gap: 10, marginTop: 13 },
    dateRowWide: { flexDirection: 'row' },
    dateField: { flex: 1 },
    input: { minHeight: 40, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: '#E9E9ED', backgroundColor: '#EEEEEF', color: '#171724', fontFamily: 'Poppins_400Regular', fontSize: 10 },
    branchLabel: { marginTop: 13 },
    rangeHint: { color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 9, marginTop: 10 },
    primaryButton: { minHeight: 42, borderRadius: 22, backgroundColor: '#F20D55', alignItems: 'center', justifyContent: 'center', marginTop: 13, paddingHorizontal: 18 },
    primaryButtonText: { color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
    secondaryButton: { minHeight: 35, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: '#F20D55', backgroundColor: '#FFFFFF' },
    secondaryButtonText: { color: '#F20D55', fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
    pressed: { opacity: 0.76 },
    disabled: { opacity: 0.5 },
    errorBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, marginBottom: 13, borderRadius: 12, backgroundColor: '#FCE9EB' },
    errorText: { flex: 1, color: '#C92F3C', fontFamily: 'Poppins_500Medium', fontSize: 9, lineHeight: 14 },
    retryText: { color: '#F20D55', fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
    reportMeta: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 5, marginBottom: 11 },
    reportMetaText: { color: '#777783', fontFamily: 'Poppins_400Regular', fontSize: 9 },
    loadingCard: { minHeight: 105, alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 16, borderWidth: 1, borderColor: '#EEEEF1', backgroundColor: '#FFFFFF' },
    emptyCard: { minHeight: 105, justifyContent: 'center', padding: 17, borderRadius: 16, borderWidth: 1, borderColor: '#EEEEF1', backgroundColor: '#FFFFFF' },
    bodyText: { color: '#777783', fontFamily: 'Poppins_400Regular', fontSize: 9, lineHeight: 15, marginTop: 8 },
    bentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
    heroCard: { minHeight: 132, justifyContent: 'center', padding: 18, borderRadius: 18, backgroundColor: '#101027' },
    heroEyebrow: { color: '#FF9418', fontFamily: 'Poppins_600SemiBold', fontSize: 8, letterSpacing: 0.5 },
    heroValue: { color: '#FFFFFF', fontFamily: 'Poppins_700Bold', fontSize: 30, lineHeight: 39, marginTop: 5 },
    heroDetail: { color: '#D5D5DF', fontFamily: 'Poppins_400Regular', fontSize: 9, marginTop: 4 },
    metricCard: { minHeight: 94, justifyContent: 'center', padding: 13, borderRadius: 16, borderWidth: 1, borderColor: '#EEEEF1', backgroundColor: '#FFFFFF' },
    transactionMetric: { borderColor: '#F4B6C8', backgroundColor: '#FFF5F8' },
    metricLabel: { color: '#777783', fontFamily: 'Poppins_500Medium', fontSize: 9, lineHeight: 13 },
    metricValue: { color: '#101027', fontFamily: 'Poppins_700Bold', fontSize: 19, lineHeight: 25, marginTop: 3 },
    metricValueSmall: { color: '#101027', fontFamily: 'Poppins_600SemiBold', fontSize: 12, lineHeight: 18, marginTop: 5 },
    metricHint: { color: '#9797A2', fontFamily: 'Poppins_400Regular', fontSize: 8, lineHeight: 12, marginTop: 3 },
    panel: { padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#EEEEF1', backgroundColor: '#FFFFFF', marginBottom: 12 },
    panelHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
    panelTitle: { color: '#101027', fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
    panelCaption: { color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 8, lineHeight: 13, marginTop: 2 },
    selectedTrend: { color: '#F20D55', fontFamily: 'Poppins_600SemiBold', fontSize: 9, marginTop: 9 },
    chart: { height: 174, flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 12, paddingHorizontal: 2, marginTop: 8 },
    chartColumn: { width: 44, height: 158, alignItems: 'center', justifyContent: 'flex-end' },
    chartAmount: { width: 54, height: 14, textAlign: 'center', color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 6 },
    chartTrack: { width: 22, height: 108, justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 7, backgroundColor: '#F5F5F7', marginTop: 4 },
    chartBar: { width: '100%', minHeight: 0, borderTopLeftRadius: 7, borderTopRightRadius: 7, backgroundColor: '#F20D55' },
    chartBarSelected: { backgroundColor: '#FF9418' },
    chartLabel: { color: '#777783', fontFamily: 'Poppins_400Regular', fontSize: 7, marginTop: 5 },
    branchRow: { marginTop: 14 },
    branchRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    branchName: { flex: 1, color: '#343440', fontFamily: 'Poppins_500Medium', fontSize: 9 },
    branchTotal: { color: '#101027', fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
    progressTrack: { height: 6, overflow: 'hidden', borderRadius: 4, backgroundColor: '#F0F0F3', marginTop: 6 },
    progressBar: { height: '100%', borderRadius: 4, backgroundColor: '#FF9418' },
    productBar: { backgroundColor: '#F20D55' },
    paymentBar: { backgroundColor: '#595EC0' },
    productRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 },
    rank: { width: 22, color: '#F20D55', fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
    productCopy: { flex: 1 },
    productName: { flex: 1, color: '#343440', fontFamily: 'Poppins_500Medium', fontSize: 9 },
    productSales: { color: '#777783', fontFamily: 'Poppins_500Medium', fontSize: 8 },
    linkText: { color: '#F20D55', fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
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
    transactionReference: { flex: 1, color: '#101027', fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
    transactionTotal: { color: '#101027', fontFamily: 'Poppins_700Bold', fontSize: 10 },
    transactionMeta: { color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 8, lineHeight: 13, marginTop: 4 },
    transactionProducts: { color: '#343440', fontFamily: 'Poppins_500Medium', fontSize: 8, lineHeight: 13, marginTop: 7 },
    transactionBottomLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7, marginTop: 3 },
    completedStatus: { color: '#2F8C57', fontFamily: 'Poppins_600SemiBold', fontSize: 8 },
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
