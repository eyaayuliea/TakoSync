import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import OwnerSalesWorkspace from './OwnerSalesWorkspace';
import OwnerIngredientsRecipes from './OwnerIngredientsRecipes';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import {
  createProduct,
  loadOwnerActivityData,
  loadOwnerInventory,
  loadProducts,
  updateProduct,
  type AppUser,
  type ProductMenuItem,
  type OwnerSalesData,
} from '../services/takosync';

type OwnerPeriod = 'Today' | 'This Week' | 'This Month' | 'Custom';
type OwnerPage = 'Dashboard' | 'Sales' | 'Reports' | 'Inventory' | 'Alerts' | 'More' | 'Products' | 'Ingredients' | 'Discrepancies' | 'Records' | 'Profile';
type OwnerData = Awaited<ReturnType<typeof loadOwnerInventory>>;
type ActivityData = Awaited<ReturnType<typeof loadOwnerActivityData>>;
type Branch = OwnerData['branches'][number];
type ProductRecord = ProductMenuItem;

const colors = {
  pink: '#F20D55',
  navy: '#101027',
  orange: '#FF9418',
  ink: '#171724',
  muted: '#858591',
  pale: '#F5F5F7',
  line: '#EEEEF1',
  white: '#FFFFFF',
  green: '#2F8C57',
  paleGreen: '#E8F6EC',
  red: '#C92F3C',
  paleRed: '#FCE9EB',
  yellow: '#FFF2C4',
  paleOrange: '#FFF1D8',
} as const;

const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

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
    hour: 'numeric',
    minute: '2-digit',
  });
}

function daysUntil(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function inventoryStatus(quantity: number, minimum: number) {
  if (quantity <= 0) return { label: 'Out of stock', tone: 'low' as const };
  if (minimum > 0 && quantity <= minimum) return { label: 'Low stock', tone: 'low' as const };
  return { label: 'In stock', tone: 'good' as const };
}

function StatusBadge({ label, tone }: { label: string; tone: 'low' | 'good' | 'warning' }) {
  const styles = useStyles();
  return (
    <View style={[styles.statusBadge, tone === 'low' ? styles.lowBadge : tone === 'warning' ? styles.warningBadge : styles.goodBadge]}>
      <Text style={[styles.statusBadgeText, tone === 'low' ? styles.lowBadgeText : tone === 'warning' ? styles.warningBadgeText : styles.goodBadgeText]}>
        {label}
      </Text>
    </View>
  );
}

function SectionHeading({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction && (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.sectionActionButton}>
          <Text style={styles.sectionActionText}>{action} ›</Text>
        </Pressable>
      )}
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  const styles = useStyles();
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>{text}</Text>
    </View>
  );
}

export default function OwnerMobileWorkspace({
  user,
  availableWidth,
  onLogout,
  data,
  inventoryLoading,
  inventoryError,
  salesData,
  salesLoading,
  salesError,
  activityData,
  activityLoading,
  activityError,
  branchId,
  onBranchChange,
  period,
  onPeriodChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  onApplyCustomRange,
  onRefresh,
  refreshing,
  loggingOut,
}: {
  user: AppUser;
  availableWidth: number;
  onLogout: () => void;
  data: OwnerData | null;
  inventoryLoading: boolean;
  inventoryError: string;
  salesData: OwnerSalesData | null;
  salesLoading: boolean;
  salesError: string;
  activityData: ActivityData | null;
  activityLoading: boolean;
  activityError: string;
  branchId: string | null;
  onBranchChange: (branchId: string | null) => void;
  period: OwnerPeriod;
  onPeriodChange: (period: OwnerPeriod) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  onApplyCustomRange: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  loggingOut: boolean;
}) {
  const styles = useStyles();
  const { colors: themeColors, isDark, setMode } = useTheme();
  const contentWidth = availableWidth;
  const [page, setPage] = useState<OwnerPage>('Dashboard');
  const [inventorySearch, setInventorySearch] = useState('');
  const [alertCategory, setAlertCategory] = useState<'Low stock' | 'Expiring soon' | 'Expired'>('Low stock');
  const [recordType, setRecordType] = useState<'All' | 'Sales' | 'Inventory' | 'Counts' | 'Audit'>('All');
  const [productRecords, setProductRecords] = useState<ProductRecord[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productEditorMode, setProductEditorMode] = useState<'add' | 'edit' | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [productForm, setProductForm] = useState({
    product_name: '',
    description: '',
    price: '',
    is_available: true,
  });
  const [productFormErrors, setProductFormErrors] = useState<Partial<Record<'product_name' | 'description' | 'price', string>>>({});
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');
  const [productSaving, setProductSaving] = useState(false);
  const [productFeedback, setProductFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const branches = data?.branches ?? [];
  const branchNames = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches]);
  const ingredients = useMemo(() => new Map((data?.ingredients ?? []).map((ingredient) => [ingredient.id, ingredient])), [data?.ingredients]);
  const categories = useMemo(() => new Map((data?.categories ?? []).map((category) => [category.id, category.name])), [data?.categories]);
  const selectedInventory = (data?.inventory ?? []).filter((item) => !branchId || item.branch_id === branchId);
  const inventoryRows = selectedInventory.flatMap((record) => {
    const ingredient = ingredients.get(record.ingredient_id);
    if (!ingredient) return [];
    const quantity = Number(record.quantity);
    const minimumStock = Number(record.minimum_stock);
    const batch = (data?.batches ?? []).find((item) =>
      item.branch_id === record.branch_id && item.ingredient_id === record.ingredient_id,
    );
    return [{
      id: `${record.branch_id}:${record.ingredient_id}`,
      ingredientId: record.ingredient_id,
      branchId: record.branch_id,
      branch: branchNames.get(record.branch_id) ?? 'Branch unavailable',
      name: ingredient.name,
      category: categories.get(ingredient.category_id) ?? 'Other',
      quantity,
      minimumStock,
      unit: ingredient.unit,
      expirationTracking: ingredient.expiration_tracking,
      nextExpiration: batch?.expiration_date ?? null,
    }];
  });
  const lowStock = inventoryRows.filter((item) => item.quantity <= 0 || (item.minimumStock > 0 && item.quantity <= item.minimumStock));
  const expirationItems = (data?.batches ?? []).flatMap((batch) => {
    if (!batch.expiration_date || Number(batch.quantity_remaining) <= 0 || (branchId && branchId !== batch.branch_id)) return [];
    const ingredient = ingredients.get(batch.ingredient_id);
    if (!ingredient?.expiration_tracking) return [];
    const days = daysUntil(batch.expiration_date);
    return days <= 7
      ? [{
          id: batch.id,
          ingredientId: batch.ingredient_id,
          name: ingredient.name,
          branchId: batch.branch_id,
          branch: branchNames.get(batch.branch_id) ?? 'Branch unavailable',
          quantity: Number(batch.quantity_remaining),
          unit: ingredient.unit,
          expirationDate: batch.expiration_date,
          reference: batch.batch_reference,
          days,
        }]
      : [];
  });
  const expiringSoon = expirationItems.filter((item) => item.days >= 0);
  const expired = expirationItems.filter((item) => item.days < 0);
  const selectedSales = salesData?.sales ?? [];
  const todaySales = salesData?.todaySales ?? [];
  const totalToday = todaySales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const totalSelectedSales = selectedSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const averageTransaction = selectedSales.length ? totalSelectedSales / selectedSales.length : 0;
  const branchMetrics = branches
    .filter((branch) => !branchId || branch.id === branchId)
    .map((branch) => {
      const sales = selectedSales.filter((sale) => sale.branch_id === branch.id);
      return {
        ...branch,
        total: sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0),
        transactions: sales.length,
      };
    });
  const bestBranch = branchMetrics.filter((branch) => branch.transactions > 0)
    .sort((a, b) => b.total - a.total)[0];
  const pendingChecks = (activityData?.dailyChecks ?? []).filter((check) => check.status === 'pending_owner_review');
  const discrepancies = (activityData?.countLines ?? []).flatMap((line) => {
    if (Number(line.difference) === 0) return [];
    const check = pendingChecks.find((item) => item.id === line.daily_stock_check_id);
    if (!check) return [];
    return [{
      id: `${check.id}:${line.ingredient_id}`,
      ingredient: ingredients.get(line.ingredient_id)?.name ?? line.ingredient_id,
      branch: branchNames.get(check.branch_id) ?? 'Branch unavailable',
      expected: Number(line.recorded_quantity),
      actual: Number(line.physical_quantity),
      difference: Number(line.difference),
      unit: line.unit,
      reference: check.reference,
      submittedAt: check.created_at,
      remarks: check.remarks,
      status: check.status,
    }];
  });
  const activities = [
    ...(activityData?.transactions ?? []).map((item) => ({
      id: item.id,
      category: 'Inventory' as const,
      type: ({
        stock_in: 'Stock-In',
        stock_out: 'Stock-Out',
        usage: 'Usage',
        waste: 'Waste',
        spoilage: 'Spoilage',
        sales_consumption: 'Sales Consumption',
        transfer_in: 'Branch Transfer In',
        transfer_out: 'Branch Transfer Out',
        adjustment: 'Authorized Adjustment',
      } as Record<string, string>)[item.type] ?? item.type,
      detail: `${ingredients.get(item.ingredient_id)?.name ?? item.ingredient_id} · ${Number(item.quantity)} ${item.unit}`,
      branchId: item.branch_id,
      reference: item.reference,
      date: item.transaction_date,
      amount: null as number | null,
    })),
    ...selectedSales.map((item) => ({
      id: item.id,
      category: 'Sales' as const,
      type: 'Completed Sale',
      detail: currency(Number(item.total_amount)),
      branchId: item.branch_id,
      reference: item.transaction_reference,
      date: item.created_at,
      amount: Number(item.total_amount),
    })),
    ...(activityData?.dailyChecks ?? []).map((item) => ({
      id: item.id,
      category: 'Counts' as const,
      type: 'Physical Inventory Count',
      detail: item.remarks || `Submitted for review · ${item.check_date}`,
      branchId: item.branch_id,
      reference: item.reference,
      date: item.created_at,
      amount: null as number | null,
    })),
    ...(activityData?.auditLogs ?? []).map((item) => ({
      id: item.id,
      category: 'Audit' as const,
      type: item.action,
      detail: item.description || 'No description recorded.',
      branchId: item.branch_id ?? '',
      reference: null as string | null,
      date: item.created_at,
      amount: null as number | null,
    })),
    ...discrepancies.map((item) => ({
      id: item.id,
      category: 'Counts' as const,
      type: 'Inventory Discrepancy',
      detail: `${item.ingredient} · Expected ${item.expected} ${item.unit}, counted ${item.actual} ${item.unit}`,
      branchId: pendingChecks.find((check) => check.reference === item.reference)?.branch_id ?? '',
      reference: item.reference,
      date: item.submittedAt,
      amount: null as number | null,
    })),
  ].filter((item) => recordType === 'All' || item.category === recordType)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const filteredInventory = inventoryRows.filter((item) =>
    `${item.name} ${item.category} ${item.branch}`.toLowerCase().includes(inventorySearch.trim().toLowerCase()),
  );
  const filteredAlerts = alertCategory === 'Expired' ? expired : expiringSoon;
  const visibleProducts = productRecords.filter((product) =>
    `${product.product_name} ${product.description}`.toLowerCase().includes(productSearch.trim().toLowerCase()),
  );
  const availableProductCount = productRecords.filter((product) => product.is_available).length;
  const unavailableProductCount = productRecords.length - availableProductCount;

  const refreshProducts = async () => {
    setProductsLoading(true);
    setProductsError('');
    try {
      const nextProducts = await loadProducts();
      setProductRecords(nextProducts);
    } catch (error) {
      setProductsError(error instanceof Error ? error.message : 'Unable to load products and menu items.');
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    if (page !== 'Products') return;
    void refreshProducts();
  }, [page]);

  const resetProductForm = (mode: 'add' | 'edit', product?: ProductRecord) => {
    setProductEditorMode(mode);
    setProductFeedback(null);
    setProductFormErrors({});
    setSelectedProduct(product ?? null);
    setProductForm({
      product_name: product?.product_name ?? '',
      description: product?.description ?? '',
      price: product ? String(product.price) : '',
      is_available: product?.is_available ?? true,
    });
  };

  const submitProductForm = async () => {
    const errors: Partial<Record<'product_name' | 'description' | 'price', string>> = {};
    const name = productForm.product_name.trim();
    const description = productForm.description.trim();
    const price = Number(productForm.price);
    if (!name) errors.product_name = 'Product name is required.';
    if (!description) errors.description = 'Product description is required.';
    if (!Number.isFinite(price) || price < 0) errors.price = 'Enter a valid selling price greater than or equal to zero.';
    if (Object.keys(errors).length) {
      setProductFormErrors(errors);
      return;
    }

    setProductSaving(true);
    setProductFormErrors({});
    try {
      const payload = {
        product_name: name,
        description,
        price,
        is_available: productForm.is_available,
      };
      const nextProduct = productEditorMode === 'edit' && selectedProduct
        ? await updateProduct(selectedProduct.id, payload)
        : await createProduct(payload);

      setProductRecords((current) => {
        const next = productEditorMode === 'edit' && selectedProduct
          ? current.map((product) => (product.id === nextProduct.id ? nextProduct : product))
          : [...current.filter((product) => product.id !== nextProduct.id), nextProduct].sort((a, b) => a.product_name.localeCompare(b.product_name));
        return next;
      });
      setProductFeedback({
        type: 'success',
        text: productEditorMode === 'edit' ? 'Product updated successfully.' : 'Product added successfully.',
      });
      setProductEditorMode(null);
      setSelectedProduct(nextProduct);
      setProductForm({
        product_name: nextProduct.product_name,
        description: nextProduct.description,
        price: String(nextProduct.price),
        is_available: nextProduct.is_available,
      });
    } catch (error) {
      setProductFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Unable to save this product right now.',
      });
    } finally {
      setProductSaving(false);
    }
  };

  const activePrimaryPage = page === 'Reports' ? 'Sales'
    : page === 'Discrepancies' || page === 'Records' || page === 'Profile' || page === 'Products' || page === 'Ingredients' ? 'More' : page;

  const showError = (message: string) => (
    <View style={styles.errorCard} accessibilityRole="alert">
      <Text style={styles.errorText}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onRefresh} style={styles.retryAction}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );

  const renderInventoryRow = (item: (typeof inventoryRows)[number]) => {
    const status = inventoryStatus(item.quantity, item.minimumStock);
    return (
      <View key={item.id} style={styles.listCard}>
        <View style={[styles.itemMark, status.tone === 'low' ? styles.itemMarkLow : styles.itemMarkGood]}>
          <Text style={styles.itemMarkText}>{item.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.listCopy}>
          <Text style={styles.listTitle} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.listMeta} numberOfLines={2}>
            {item.branch} · {item.category} · Minimum {item.minimumStock} {item.unit}
            {item.nextExpiration && item.expirationTracking ? ` · Batch exp. ${new Date(`${item.nextExpiration}T00:00:00`).toLocaleDateString('en-PH')}` : ''}
          </Text>
        </View>
        <View style={styles.listTrailing}>
          <Text style={styles.quantityText}>{item.quantity} {item.unit}</Text>
          <StatusBadge label={status.label} tone={status.tone} />
        </View>
      </View>
    );
  };

  const renderActivity = (item: (typeof activities)[number]) => (
    <View key={`${item.category}:${item.id}`} style={styles.activityCard}>
      <View style={[styles.activityIcon, item.category === 'Sales' ? styles.activitySalesIcon : styles.activityInventoryIcon]}>
        <Text style={styles.activityIconText}>{item.category === 'Sales' ? '₱' : item.category === 'Counts' ? '✓' : item.category === 'Audit' ? '•' : '↗'}</Text>
      </View>
      <View style={styles.listCopy}>
        <Text style={styles.listTitle}>{item.type}</Text>
        <Text style={styles.listMeta}>{item.detail}</Text>
        <Text style={styles.listMeta}>
          {item.branchId ? branchNames.get(item.branchId) ?? 'Branch unavailable' : 'All branches'} · {compactDate(item.date)}
          {item.reference ? ` · Ref ${item.reference}` : ''}
        </Text>
      </View>
    </View>
  );

  const renderProducts = () => (
    <>
      <View style={styles.productOverviewGrid}>
        <View style={styles.bentoSummaryCard}>
          <Text style={styles.bentoLabel}>Total products</Text>
          <Text style={styles.bentoValue}>{productRecords.length}</Text>
        </View>
        <View style={styles.bentoSummaryCard}>
          <Text style={styles.bentoLabel}>Available</Text>
          <Text style={[styles.bentoValue, styles.bentoValueSuccess]}>{availableProductCount}</Text>
        </View>
        <View style={styles.bentoSummaryCard}>
          <Text style={styles.bentoLabel}>Unavailable</Text>
          <Text style={[styles.bentoValue, styles.bentoValueMuted]}>{unavailableProductCount}</Text>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchGlyph}>⌕</Text>
        <TextInput
          value={productSearch}
          onChangeText={setProductSearch}
          placeholder="Search products"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          accessibilityLabel="Search products by name"
          returnKeyType="search"
        />
        {productSearch ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear product search" onPress={() => setProductSearch('')}>
            <Text style={styles.clearSearch}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable accessibilityRole="button" onPress={() => resetProductForm('add')} style={styles.primaryActionButton}>
        <Text style={styles.primaryActionText}>+ Add Product</Text>
      </Pressable>

      {productsError ? showError(productsError) : productsLoading && productRecords.length === 0 ? (
        <View style={styles.loadingCard}><ActivityIndicator color={colors.pink} /><Text style={styles.loadingText}>Loading products…</Text></View>
      ) : visibleProducts.length ? (
        visibleProducts.map((product) => (
          <Pressable key={product.id} accessibilityRole="button" onPress={() => setSelectedProduct(product)} style={styles.productCard}>
            <View style={styles.productMetaRow}>
              <View style={styles.productCopy}>
                <Text style={styles.productName}>{product.product_name}</Text>
                <Text style={styles.productDescription} numberOfLines={2}>{product.description || 'No description provided.'}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${product.product_name}`}
                onPress={(event) => {
                  event.stopPropagation();
                  resetProductForm('edit', product);
                }}
                style={styles.editActionButton}
              >
                <Text style={styles.editActionText}>Edit</Text>
              </Pressable>
            </View>
            <View style={styles.productFooterRow}>
              <View>
                <Text style={styles.productPriceLabel}>Selling price</Text>
                <Text style={styles.productPriceValue}>{currency(product.price)}</Text>
              </View>
              <View style={[styles.availabilityPill, product.is_available ? styles.availabilityAvailable : styles.availabilityUnavailable]}>
                <Text style={[styles.availabilityText, !product.is_available && styles.availabilityTextMuted]}>{product.is_available ? 'Available' : 'Unavailable'}</Text>
              </View>
            </View>
          </Pressable>
        ))
      ) : (
        <EmptyState text={productRecords.length ? 'No products match your current search.' : 'No menu products are available yet. Add the first product to start managing your menu.'} />
      )}

      {selectedProduct && !productEditorMode && (
        <View style={styles.productDetailSheet}>
          <View style={styles.productDetailHeader}>
            <Text style={styles.productName}>{selectedProduct.product_name}</Text>
            <Pressable accessibilityRole="button" onPress={() => setSelectedProduct(null)} style={styles.closeActionButton}>
              <Text style={styles.closeActionText}>×</Text>
            </Pressable>
          </View>
          <Text style={styles.productDetailLabel}>Description</Text>
          <Text style={styles.productDetailText}>{selectedProduct.description || 'No description provided.'}</Text>
          <View style={styles.productDetailGrid}>
            <View style={styles.detailStatBox}>
              <Text style={styles.productDetailLabel}>Selling price</Text>
              <Text style={styles.productDetailValue}>{currency(selectedProduct.price)}</Text>
            </View>
            <View style={styles.detailStatBox}>
              <Text style={styles.productDetailLabel}>Availability</Text>
              <Text style={styles.productDetailValue}>{selectedProduct.is_available ? 'Available' : 'Unavailable'}</Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={() => resetProductForm('edit', selectedProduct)} style={styles.secondaryActionButton}>
            <Text style={styles.secondaryActionText}>Edit Product</Text>
          </Pressable>
        </View>
      )}

      {productEditorMode && (
        <View style={styles.productModalBackdrop}>
          <View style={styles.productModalCard}>
            <View style={styles.productModalHeader}>
              <Text style={styles.productModalTitle}>{productEditorMode === 'edit' ? 'Edit Product' : 'Add Product'}</Text>
              <Pressable accessibilityRole="button" onPress={() => { setProductEditorMode(null); setProductFeedback(null); }} style={styles.closeActionButton}>
                <Text style={styles.closeActionText}>×</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Product name</Text>
            <TextInput
              value={productForm.product_name}
              onChangeText={(value) => setProductForm((current) => ({ ...current, product_name: value }))}
              placeholder="e.g. Takoyaki Special"
              placeholderTextColor={colors.muted}
              style={[styles.textInput, productFormErrors.product_name && styles.textInputError]}
              accessibilityLabel="Product name"
            />
            {productFormErrors.product_name ? <Text style={styles.fieldError}>{productFormErrors.product_name}</Text> : null}

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              value={productForm.description}
              onChangeText={(value) => setProductForm((current) => ({ ...current, description: value }))}
              placeholder="Describe the product"
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.textInput, styles.textArea, productFormErrors.description && styles.textInputError]}
              accessibilityLabel="Product description"
            />
            {productFormErrors.description ? <Text style={styles.fieldError}>{productFormErrors.description}</Text> : null}

            <Text style={styles.fieldLabel}>Selling price</Text>
            <TextInput
              value={productForm.price}
              onChangeText={(value) => setProductForm((current) => ({ ...current, price: value }))}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.muted}
              style={[styles.textInput, productFormErrors.price && styles.textInputError]}
              accessibilityLabel="Product selling price"
            />
            {productFormErrors.price ? <Text style={styles.fieldError}>{productFormErrors.price}</Text> : null}

            <Text style={styles.fieldLabel}>Availability</Text>
            <View style={styles.segmentedRow}>
              {(['Available', 'Unavailable'] as const).map((status) => {
                const selected = productForm.is_available === (status === 'Available');
                return (
                  <Pressable
                    key={status}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setProductForm((current) => ({ ...current, is_available: status === 'Available' }))}
                    style={[styles.segmentButton, selected && styles.segmentButtonSelected]}
                  >
                    <Text style={[styles.segmentButtonText, selected && styles.segmentButtonTextSelected]}>{status}</Text>
                  </Pressable>
                );
              })}
            </View>

            {productFeedback ? (
              <Text style={[styles.feedbackText, productFeedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess]}>{productFeedback.text}</Text>
            ) : null}

            <Pressable accessibilityRole="button" disabled={productSaving} onPress={submitProductForm} style={styles.primaryActionButton}>
              <Text style={styles.primaryActionText}>{productSaving ? 'Saving…' : productEditorMode === 'edit' ? 'Save Changes' : 'Add Product'}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </>
  );

  const renderDashboard = () => (
    <>
      <View style={styles.welcomePanel}>
        <View style={styles.welcomeCopy}>
          <Text style={styles.eyebrow}>BUSINESS OVERVIEW</Text>
          <Text style={styles.welcomeTitle}>Welcome back, {user.displayName.split(' ')[0]}</Text>
          <Text style={styles.welcomeSubtext}>
            Monitoring {branchId ? branchNames.get(branchId) : 'all active branches'} · {new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>
        <View style={styles.welcomeMark}><Text style={styles.welcomeMarkText}>T</Text></View>
      </View>

      <View style={styles.periodRow}>
        {(['Today', 'This Week', 'This Month', 'Custom'] as const).map((value) => {
          const selected = period === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onPeriodChange(value)}
              style={[styles.periodChip, selected && styles.periodChipSelected]}
            >
              <Text style={[styles.periodText, selected && styles.periodTextSelected]}>{value === 'This Week' ? 'Week' : value === 'This Month' ? 'Month' : value}</Text>
            </Pressable>
          );
        })}
      </View>
      {period === 'Custom' && (
        <View style={styles.customRange}>
          <TextInput value={customStart} onChangeText={onCustomStartChange} placeholder="YYYY-MM-DD" accessibilityLabel="Custom period start date" style={styles.dateInput} />
          <Text style={styles.dateSeparator}>to</Text>
          <TextInput value={customEnd} onChangeText={onCustomEndChange} placeholder="YYYY-MM-DD" accessibilityLabel="Custom period end date" style={styles.dateInput} />
          <Pressable accessibilityRole="button" onPress={onApplyCustomRange} style={styles.applyButton}>
            <Text style={styles.applyButtonText}>Apply</Text>
          </Pressable>
        </View>
      )}

      <SectionHeading title="Sales at a glance" action="Sales" onAction={() => setPage('Sales')} />
      {salesError ? showError(salesError) : salesLoading && !salesData ? (
        <View style={styles.loadingCard}><ActivityIndicator color={colors.pink} /><Text style={styles.loadingText}>Loading sales…</Text></View>
      ) : (
        <View style={styles.metricGrid}>
          <View style={[styles.metricCard, styles.metricCardFeatured]}>
            <Text style={styles.metricLabel}>Sales today</Text>
            <Text style={[styles.metricValue, styles.metricValueFeatured]} numberOfLines={1} adjustsFontSizeToFit>{currency(totalToday)}</Text>
            <Text style={[styles.metricCaption, styles.metricCaptionFeatured]}>Completed transactions only</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>{period} transactions</Text>
            <Text style={styles.metricValue}>{salesLoading ? '—' : selectedSales.length}</Text>
            <Text style={styles.metricCaption}>Completed sales</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Average transaction</Text>
            <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{salesLoading || !selectedSales.length ? '—' : currency(averageTransaction)}</Text>
            <Text style={styles.metricCaption}>Selected period</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Best branch</Text>
            <Text style={styles.bestBranchValue} numberOfLines={1}>{salesLoading ? '—' : bestBranch?.name ?? 'No sales yet'}</Text>
            <Text style={styles.metricCaption}>{bestBranch ? currency(bestBranch.total) : 'Selected period'}</Text>
          </View>
        </View>
      )}

      <SectionHeading title="Branch sales" action="View details" onAction={() => setPage('Sales')} />
      {salesLoading && !salesData ? (
        <View style={styles.loadingCard}><ActivityIndicator color={colors.pink} /><Text style={styles.loadingText}>Loading branch sales…</Text></View>
      ) : salesError ? showError(salesError) : branchMetrics.length ? (
        <View style={styles.panel}>
          {branchMetrics.map((branch) => {
            const max = Math.max(...branchMetrics.map((item) => item.total), 0);
            return (
              <Pressable
                key={branch.id}
                accessibilityRole="button"
                onPress={() => {
                  onBranchChange(branch.id);
                  setPage('Sales');
                }}
                style={styles.branchMetric}
              >
                <View style={styles.branchMetricHeading}>
                  <Text style={styles.branchName} numberOfLines={1}>{branch.name}</Text>
                  <Text style={styles.branchTotal}>{currency(branch.total)}</Text>
                </View>
                <Text style={styles.branchMeta}>{branch.transactions} completed transactions · {period.toLowerCase()}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${max ? branch.total / max * 100 : 0}%` }]} />
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : <EmptyState text="No branches are available." />}

      <SectionHeading title="Expected inventory" action="Inventory" onAction={() => setPage('Inventory')} />
      {inventoryError ? showError(inventoryError) : inventoryLoading && !data ? (
        <View style={styles.loadingCard}><ActivityIndicator color={colors.pink} /><Text style={styles.loadingText}>Loading inventory…</Text></View>
      ) : (
        <View style={styles.inventorySummary}>
          {[
            { label: 'Tracked', value: inventoryRows.length },
            { label: 'Sufficient', value: inventoryRows.length - lowStock.length },
            { label: 'Low stock', value: lowStock.length, tone: 'low' },
            { label: 'Expiring / expired', value: expirationItems.length, tone: 'warning' },
          ].map((item) => (
            <View key={item.label} style={styles.inventorySummaryItem}>
              <Text style={[styles.inventorySummaryValue, item.tone === 'low' && styles.lowText, item.tone === 'warning' && styles.warningText]}>{item.value}</Text>
              <Text style={styles.inventorySummaryLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      )}

      <SectionHeading title="Low-stock ingredients" action="View all" onAction={() => { setAlertCategory('Low stock'); setPage('Alerts'); }} />
      {inventoryError ? showError(inventoryError) : lowStock.length ? lowStock.slice(0, 4).map((item) => renderInventoryRow(item)) : (
        <EmptyState text={inventoryLoading ? 'Loading expected inventory…' : 'No ingredients are at or below their configured minimum.'} />
      )}

      <SectionHeading title="Expiration alerts" action="View all" onAction={() => { setAlertCategory('Expiring soon'); setPage('Alerts'); }} />
      {inventoryError ? showError(inventoryError) : expirationItems.length ? expirationItems.slice(0, 4).map((item) => (
        <View key={item.id} style={styles.listCard}>
          <View style={[styles.itemMark, item.days < 0 ? styles.itemMarkLow : styles.itemMarkWarning]}>
            <Text style={styles.itemMarkText}>!</Text>
          </View>
          <View style={styles.listCopy}>
            <Text style={styles.listTitle}>{item.name}</Text>
            <Text style={styles.listMeta}>{item.branch} · {item.quantity} {item.unit} · Batch {item.reference}</Text>
            <Text style={styles.listMeta}>Expires {new Date(`${item.expirationDate}T00:00:00`).toLocaleDateString('en-PH')}</Text>
          </View>
          <StatusBadge label={item.days < 0 ? 'Expired' : item.days === 0 ? 'Today' : `${item.days}d left`} tone={item.days < 0 ? 'low' : 'warning'} />
        </View>
      )) : <EmptyState text={inventoryLoading ? 'Loading expiration dates…' : 'No tracked batches are expiring within 7 days.'} />}

      <SectionHeading title="Recent activities" action="View all" onAction={() => setPage('Records')} />
      {activityError ? showError(activityError) : activityLoading && !activityData ? (
        <View style={styles.loadingCard}><ActivityIndicator color={colors.pink} /><Text style={styles.loadingText}>Loading activities…</Text></View>
      ) : activities.length ? activities.slice(0, 5).map(renderActivity) : (
        <EmptyState text="No recorded activity in the selected period." />
      )}
      {discrepancies.length > 0 && (
        <>
          <SectionHeading title="Discrepancies awaiting review" action="Review" onAction={() => setPage('Discrepancies')} />
          {discrepancies.slice(0, 3).map((item) => (
            <View key={item.id} style={styles.listCard}>
              <View style={[styles.itemMark, styles.itemMarkWarning]}><Text style={styles.itemMarkText}>!</Text></View>
              <View style={styles.listCopy}>
                <Text style={styles.listTitle}>{item.ingredient} · {item.branch}</Text>
                <Text style={styles.listMeta}>Expected {item.expected} {item.unit} · Counted {item.actual} {item.unit}</Text>
                <Text style={styles.listMeta}>Difference {item.difference > 0 ? '+' : ''}{item.difference} {item.unit} · {item.reference}</Text>
              </View>
              <StatusBadge label="Pending" tone="warning" />
            </View>
          ))}
        </>
      )}
    </>
  );

  const renderSales = () => (
    <OwnerSalesWorkspace
      mode="monitoring"
      branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
      initialData={salesData}
      initialLoading={salesLoading}
      initialPeriod={period === 'Today' ? 'Today' : period === 'This Week' ? 'Weekly' : period === 'Custom' ? 'Custom' : 'Monthly'}
      initialBranchId={branchId}
      initialStartDate={customStart}
      initialEndDate={customEnd}
      onOpenReports={() => setPage('Reports')}
      availableWidth={contentWidth - 36}
    />
  );

  const renderReports = () => (
    <OwnerSalesWorkspace
      mode="reports"
      branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
      initialPeriod={period === 'Today' ? 'Today' : period === 'This Week' ? 'Weekly' : period === 'Custom' ? 'Custom' : 'Monthly'}
      initialBranchId={branchId}
      initialStartDate={customStart}
      initialEndDate={customEnd}
      onBack={() => setPage('Sales')}
      availableWidth={contentWidth - 36}
    />
  );

  const renderInventory = () => (
    <>
      <View style={styles.searchBox}>
        <Text style={styles.searchGlyph}>⌕</Text>
        <TextInput
          value={inventorySearch}
          onChangeText={setInventorySearch}
          placeholder="Search ingredients or branches"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          accessibilityLabel="Search centralized inventory"
          returnKeyType="search"
        />
        {inventorySearch ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setInventorySearch('')}>
            <Text style={styles.clearSearch}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.dataDisclaimer}>Expected inventory from recorded transactions · View only</Text>
      {inventoryError ? showError(inventoryError) : inventoryLoading && !data ? (
        <View style={styles.loadingCard}><ActivityIndicator color={colors.pink} /><Text style={styles.loadingText}>Loading inventory…</Text></View>
      ) : filteredInventory.length ? filteredInventory.map(renderInventoryRow) : (
        <EmptyState text={inventoryRows.length ? 'No ingredients match your search.' : 'No inventory records are available for this branch.'} />
      )}
    </>
  );

  const renderAlerts = () => (
    <>
      <View style={styles.alertTabs}>
        {(['Low stock', 'Expiring soon', 'Expired'] as const).map((value) => {
          const selected = alertCategory === value;
          const count = value === 'Low stock' ? lowStock.length : value === 'Expired' ? expired.length : expiringSoon.length;
          return (
            <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setAlertCategory(value)} style={[styles.alertTab, selected && styles.alertTabSelected]}>
              <Text style={[styles.alertTabText, selected && styles.alertTabTextSelected]}>{value} · {count}</Text>
            </Pressable>
          );
        })}
      </View>
      {inventoryError ? showError(inventoryError) : inventoryLoading && !data ? (
        <View style={styles.loadingCard}><ActivityIndicator color={colors.pink} /><Text style={styles.loadingText}>Loading alerts…</Text></View>
      ) : alertCategory === 'Low stock' ? (
        lowStock.length ? lowStock.map((item) => renderInventoryRow(item)) : <EmptyState text="No low-stock ingredients in the selected branches." />
      ) : filteredAlerts.length ? filteredAlerts.map((item) => (
        <View key={item.id} style={styles.listCard}>
          <View style={[styles.itemMark, item.days < 0 ? styles.itemMarkLow : styles.itemMarkWarning]}><Text style={styles.itemMarkText}>!</Text></View>
          <View style={styles.listCopy}>
            <Text style={styles.listTitle}>{item.name}</Text>
            <Text style={styles.listMeta}>{item.branch} · {item.quantity} {item.unit} · Batch {item.reference}</Text>
            <Text style={styles.listMeta}>Expiration date: {new Date(`${item.expirationDate}T00:00:00`).toLocaleDateString('en-PH')}</Text>
          </View>
          <StatusBadge label={item.days < 0 ? 'Expired' : item.days === 0 ? 'Today' : `${item.days}d left`} tone={item.days < 0 ? 'low' : 'warning'} />
        </View>
      )) : <EmptyState text={alertCategory === 'Expired' ? 'No tracked batches have expired.' : 'No tracked batches expire within 7 days.'} />}
    </>
  );

  const renderDiscrepancies = () => (
    <>
      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>Pending owner review</Text>
        <Text style={styles.noticeText}>Physical counts are shown separately from expected inventory. Reviewing a count here does not adjust stock.</Text>
      </View>
      {activityError ? showError(activityError) : activityLoading && !activityData ? (
        <View style={styles.loadingCard}><ActivityIndicator color={colors.pink} /><Text style={styles.loadingText}>Loading count submissions…</Text></View>
      ) : discrepancies.length ? discrepancies.map((item) => (
        <View key={item.id} style={styles.discrepancyCard}>
          <View style={styles.discrepancyHeading}>
            <Text style={styles.listTitle}>{item.ingredient}</Text>
            <StatusBadge label="Pending" tone="warning" />
          </View>
          <Text style={styles.listMeta}>{item.branch} · Ref {item.reference}</Text>
          <View style={styles.quantityCompare}>
            <View><Text style={styles.compareLabel}>Expected</Text><Text style={styles.compareValue}>{item.expected} {item.unit}</Text></View>
            <View><Text style={styles.compareLabel}>Counted</Text><Text style={styles.compareValue}>{item.actual} {item.unit}</Text></View>
            <View><Text style={styles.compareLabel}>Difference</Text><Text style={[styles.compareValue, styles.lowText]}>{item.difference > 0 ? '+' : ''}{item.difference} {item.unit}</Text></View>
          </View>
          {item.remarks ? <Text style={styles.remarksText}>Staff remarks: {item.remarks}</Text> : <Text style={styles.remarksText}>No staff remarks recorded.</Text>}
          <Text style={styles.listMeta}>Submitted {compactDate(item.submittedAt)}</Text>
        </View>
      )) : <EmptyState text="No pending discrepancies require review." />}
      {discrepancies.length > 0 && (
        <Text style={styles.workflowUnavailable}>
          Approval and rejection controls are not available in the existing backend workflow. No inventory changes are made here.
        </Text>
      )}
    </>
  );

  const renderRecords = () => (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recordFilterRow}>
        {(['All', 'Sales', 'Inventory', 'Counts', 'Audit'] as const).map((value) => {
          const selected = recordType === value;
          return (
            <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setRecordType(value)} style={[styles.alertTab, styles.recordFilterTab, selected && styles.alertTabSelected]}>
              <Text style={[styles.alertTabText, selected && styles.alertTabTextSelected]}>{value}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {salesError ? showError(salesError) : null}
      {activityError ? showError(activityError) : null}
      {salesLoading || activityLoading ? (
        <View style={styles.loadingCard}><ActivityIndicator color={colors.pink} /><Text style={styles.loadingText}>Loading records…</Text></View>
      ) : activities.length ? activities.map(renderActivity) : (
        <EmptyState text="No sales or inventory records match the selected branch and period." />
      )}
    </>
  );

  const renderMore = () => (
    <>
      {[
        { title: 'Ingredients & Recipes', detail: 'Manage ingredient records and product recipes', page: 'Ingredients' as const, icon: '◈' },
        { title: 'Products & Menu', detail: 'Manage menu items, prices, and availability', page: 'Products' as const, icon: '▣' },
        { title: 'Discrepancy review', detail: `${discrepancies.length} pending count discrepancies`, page: 'Discrepancies' as const, icon: '!' },
        { title: 'Business records', detail: 'Sales, inventory movements, and counts', page: 'Records' as const, icon: '↻' },
        { title: 'Owner profile', detail: 'Account details and preferences', page: 'Profile' as const, icon: '●' },
      ].map((item) => (
        <Pressable key={item.page} accessibilityRole="button" onPress={() => setPage(item.page)} style={styles.moreCard}>
          <View style={styles.moreIcon}><Text style={styles.moreIconText}>{item.icon}</Text></View>
          <View style={styles.listCopy}><Text style={styles.listTitle}>{item.title}</Text><Text style={styles.listMeta}>{item.detail}</Text></View>
          <Text style={styles.moreChevron}>›</Text>
        </Pressable>
      ))}
      <View style={styles.moreCard}>
        <View style={[styles.moreIcon, styles.themeIcon]}><Text style={styles.moreIconText}>{isDark ? '☼' : '☾'}</Text></View>
        <View style={styles.listCopy}><Text style={styles.listTitle}>Appearance</Text><Text style={styles.listMeta}>Switch to {isDark ? 'light' : 'dark'} theme</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Switch to ${isDark ? 'light' : 'dark'} theme`} onPress={() => setMode(isDark ? 'light' : 'dark')} style={styles.themeSwitch}>
          <Text style={styles.themeSwitchText}>{isDark ? 'Light' : 'Dark'}</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" disabled={loggingOut} onPress={onLogout} style={styles.logoutCard}>
        <Text style={styles.logoutText}>{loggingOut ? 'Logging out…' : 'Log out'}</Text>
      </Pressable>
    </>
  );

  const renderProfile = () => (
    <>
      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}><Text style={styles.profileInitials}>{user.displayName.trim().slice(0, 1).toUpperCase() || 'O'}</Text></View>
        <Text style={styles.profileName}>{user.displayName}</Text>
        <Text style={styles.profileRole}>Owner account</Text>
      </View>
      <View style={styles.panel}>
        <View style={styles.profileRow}><Text style={styles.compareLabel}>Name</Text><Text style={styles.profileValue}>{user.displayName}</Text></View>
        <View style={styles.profileRow}><Text style={styles.compareLabel}>Email</Text><Text style={styles.profileValue}>{user.email}</Text></View>
        <View style={[styles.profileRow, styles.profileRowLast]}><Text style={styles.compareLabel}>Access</Text><Text style={styles.profileValue}>All active branches</Text></View>
      </View>
      <Text style={styles.workflowUnavailable}>Profile editing is not connected to an existing owner update workflow.</Text>
      <Pressable accessibilityRole="button" disabled={loggingOut} onPress={onLogout} style={styles.logoutCard}>
        <Text style={styles.logoutText}>{loggingOut ? 'Logging out…' : 'Log out securely'}</Text>
      </Pressable>
    </>
  );

  const pageTitle: Record<OwnerPage, string> = {
    Dashboard: 'Dashboard',
    Sales: 'Sales monitoring',
    Reports: 'Sales reports',
    Inventory: 'Inventory',
    Alerts: 'Alerts',
    More: 'More',
    Products: 'Products & Menu',
    Ingredients: 'Ingredients & Recipes',
    Discrepancies: 'Discrepancy review',
    Records: 'Business records',
    Profile: 'Owner profile',
  };

  return (
    <View style={[styles.screen, { maxWidth: contentWidth }]}>
      <View style={styles.topBar}>
        <View style={styles.topBarCopy}>
          <Text style={styles.appLabel}>TAKOSYNC · OWNER</Text>
          <Text style={styles.pageTitle}>{pageTitle[page]}</Text>
        </View>
        <View style={styles.topActions}>
          {page !== 'Sales' && page !== 'Reports' && (
            <Pressable accessibilityRole="button" accessibilityLabel="Refresh owner information" disabled={refreshing} onPress={onRefresh} style={styles.headerButton}>
              {refreshing ? <ActivityIndicator size="small" color={colors.navy} /> : <Text style={styles.headerButtonText}>↻</Text>}
            </Pressable>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Open alerts" onPress={() => setPage('Alerts')} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>!</Text>
            {lowStock.length + expirationItems.length > 0 && <View style={styles.notificationDot} />}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open owner profile" onPress={() => setPage('Profile')} style={styles.avatarButton}>
            <Text style={styles.avatarText}>{user.displayName.trim().slice(0, 1).toUpperCase() || 'O'}</Text>
          </Pressable>
        </View>
      </View>

      {page !== 'Sales' && page !== 'Reports' && page !== 'Profile' && page !== 'Ingredients' && (
        <View style={styles.branchFilterBlock}>
          <Text style={styles.filterLabel}>BRANCH</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: branchId === null }} onPress={() => onBranchChange(null)} style={[styles.branchChip, branchId === null && styles.branchChipSelected]}>
              <Text style={[styles.branchChipText, branchId === null && styles.branchChipTextSelected]}>All branches</Text>
            </Pressable>
            {branches.map((branch: Branch) => {
              const selected = branchId === branch.id;
              return (
                <Pressable key={branch.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onBranchChange(branch.id)} style={[styles.branchChip, selected && styles.branchChipSelected]}>
                  <Text style={[styles.branchChipText, selected && styles.branchChipTextSelected]} numberOfLines={1}>{branch.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {page === 'Dashboard' && renderDashboard()}
        {page === 'Sales' && renderSales()}
        {page === 'Reports' && renderReports()}
        {page === 'Inventory' && renderInventory()}
        {page === 'Alerts' && renderAlerts()}
        {page === 'More' && renderMore()}
        {page === 'Products' && renderProducts()}
        {page === 'Ingredients' && <OwnerIngredientsRecipes onManageProducts={() => setPage('Products')} />}
        {page === 'Discrepancies' && renderDiscrepancies()}
        {page === 'Records' && renderRecords()}
        {page === 'Profile' && renderProfile()}
      </ScrollView>

      <View style={styles.bottomBar}>
        {([
          { title: 'Dashboard', icon: '⌂' },
          { title: 'Sales', icon: '₱' },
          { title: 'Inventory', icon: '▣' },
          { title: 'Alerts', icon: '!' },
          { title: 'More', icon: '•••' },
        ] as const).map((tab) => {
          const selected = activePrimaryPage === tab.title;
          return (
            <Pressable
              key={tab.title}
              accessibilityRole="button"
              accessibilityLabel={tab.title}
              accessibilityState={{ selected }}
              onPress={() => setPage(tab.title)}
              style={styles.navItem}
            >
              <View style={[styles.navIconWrap, selected && styles.navIconWrapSelected]}>
                <Text style={[styles.navIcon, selected && styles.navIconSelected]}>{tab.icon}</Text>
              </View>
              <Text style={[styles.navLabel, selected && styles.navLabelSelected]}>{tab.title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function useStyles() {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(createThemedStyles({
    screen: { flex: 1, width: '100%', alignSelf: 'center', backgroundColor: colors.pale },
    topBar: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 7, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line },
    topBarCopy: { flex: 1, minWidth: 0 },
    appLabel: { color: colors.pink, fontFamily: font.bold, fontSize: 7, letterSpacing: 1 },
    pageTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 15, marginTop: 1 },
    topActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
    headerButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: colors.pale },
    headerButtonText: { color: colors.navy, fontFamily: font.semibold, fontSize: 16, lineHeight: 20 },
    notificationDot: { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.pink, borderWidth: 1, borderColor: colors.white },
    avatarButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#FCE3EB' },
    avatarText: { color: colors.pink, fontFamily: font.bold, fontSize: 13 },
    branchFilterBlock: { paddingTop: 9, paddingBottom: 10, paddingHorizontal: 18, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line },
    filterLabel: { color: colors.muted, fontFamily: font.semibold, fontSize: 7, letterSpacing: 0.8, marginBottom: 6 },
    chipRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingRight: 8 },
    branchChip: { maxWidth: 185, minHeight: 29, justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.pale },
    branchChipSelected: { backgroundColor: colors.pink, borderColor: colors.pink },
    branchChipText: { color: colors.ink, fontFamily: font.medium, fontSize: 8 },
    branchChipTextSelected: { color: colors.white, fontFamily: font.semibold },
    contentScroll: { flex: 1 },
    content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18 },
    welcomePanel: { minHeight: 98, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, marginBottom: 12, borderRadius: 19, backgroundColor: colors.navy, overflow: 'hidden' },
    welcomeCopy: { flex: 1, paddingRight: 8 },
    eyebrow: { color: colors.orange, fontFamily: font.semibold, fontSize: 7, letterSpacing: 1 },
    welcomeTitle: { color: colors.white, fontFamily: font.bold, fontSize: 16, marginTop: 5 },
    welcomeSubtext: { color: '#D5D5E0', fontFamily: font.regular, fontSize: 8, marginTop: 3 },
    welcomeMark: { width: 49, height: 49, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: colors.pink },
    welcomeMarkText: { color: colors.white, fontFamily: font.bold, fontSize: 23 },
    periodRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
    periodChip: { flex: 1, minHeight: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.white },
    periodChipSelected: { borderColor: colors.pink, backgroundColor: '#FCE3EB' },
    periodText: { color: colors.muted, fontFamily: font.medium, fontSize: 8 },
    periodTextSelected: { color: colors.pink, fontFamily: font.semibold },
    customRange: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4, marginBottom: 14 },
    dateInput: { flex: 1, height: 35, minWidth: 80, paddingHorizontal: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.white, color: colors.ink, fontFamily: font.regular, fontSize: 8 },
    dateSeparator: { color: colors.muted, fontFamily: font.regular, fontSize: 8 },
    applyButton: { minHeight: 35, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.pink },
    applyButtonText: { color: colors.white, fontFamily: font.semibold, fontSize: 8 },
    sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, marginBottom: 8 },
    sectionTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 11 },
    sectionActionButton: { minHeight: 28, justifyContent: 'center', paddingLeft: 8 },
    sectionActionText: { color: colors.pink, fontFamily: font.semibold, fontSize: 8 },
    metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginBottom: 5 },
    metricCard: { width: '48%', minHeight: 82, padding: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.white },
    metricCardFeatured: { width: '100%', minHeight: 79, backgroundColor: colors.pink, borderColor: colors.pink },
    metricLabel: { color: colors.muted, fontFamily: font.medium, fontSize: 8 },
    metricValue: { color: colors.navy, fontFamily: font.bold, fontSize: 17, marginTop: 5 },
    metricValueFeatured: { color: colors.white, fontSize: 22, marginTop: 1 },
    metricCaption: { color: colors.muted, fontFamily: font.regular, fontSize: 7, marginTop: 3 },
    metricCaptionFeatured: { color: '#FFE6EE' },
    bestBranchValue: { color: colors.navy, fontFamily: font.semibold, fontSize: 11, marginTop: 8 },
    panel: { paddingHorizontal: 12, paddingVertical: 5, marginBottom: 4, borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: colors.white },
    branchMetric: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
    branchMetricHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    branchName: { flex: 1, color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
    branchTotal: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
    branchMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 7, marginTop: 3 },
    barTrack: { height: 5, marginTop: 6, overflow: 'hidden', borderRadius: 4, backgroundColor: colors.pale },
    barFill: { height: '100%', borderRadius: 4, backgroundColor: colors.orange },
    inventorySummary: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 7, padding: 10, marginBottom: 4, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
    inventorySummaryItem: { width: '48%', minHeight: 42, justifyContent: 'center', paddingHorizontal: 5 },
    inventorySummaryValue: { color: colors.navy, fontFamily: font.bold, fontSize: 15 },
    inventorySummaryLabel: { color: colors.muted, fontFamily: font.regular, fontSize: 7 },
    listCard: { minHeight: 59, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 8, marginBottom: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.white },
    itemMark: { width: 30, height: 30, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 10, marginRight: 9 },
    itemMarkGood: { backgroundColor: colors.paleGreen },
    itemMarkLow: { backgroundColor: colors.paleRed },
    itemMarkWarning: { backgroundColor: colors.yellow },
    itemMarkText: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
    listCopy: { flex: 1, minWidth: 0 },
    listTitle: { color: colors.ink, fontFamily: font.semibold, fontSize: 8 },
    listMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 2 },
    listTrailing: { alignItems: 'flex-end', marginLeft: 6 },
    quantityText: { color: colors.navy, fontFamily: font.semibold, fontSize: 8, marginBottom: 3 },
    statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
    statusBadgeText: { fontFamily: font.semibold, fontSize: 6 },
    lowBadge: { backgroundColor: colors.paleRed },
    lowBadgeText: { color: colors.red },
    goodBadge: { backgroundColor: colors.paleGreen },
    goodBadgeText: { color: colors.green },
    warningBadge: { backgroundColor: colors.yellow },
    warningBadgeText: { color: '#8D6414' },
    activityCard: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 8, marginBottom: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.white },
    activityIcon: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 10, marginRight: 9 },
    activitySalesIcon: { backgroundColor: '#FCE3EB' },
    activityInventoryIcon: { backgroundColor: colors.pale },
    activityIconText: { color: colors.pink, fontFamily: font.semibold, fontSize: 10 },
    searchBox: { minHeight: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 7, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
    searchGlyph: { color: colors.muted, fontSize: 20, marginRight: 7 },
    searchInput: { flex: 1, height: 40, color: colors.ink, fontFamily: font.regular, fontSize: 8, paddingVertical: 0 },
    clearSearch: { color: colors.muted, fontSize: 20, paddingLeft: 8 },
    productOverviewGrid: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    bentoSummaryCard: { flex: 1, minHeight: 80, padding: 12, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
    bentoLabel: { color: colors.muted, fontFamily: font.medium, fontSize: 7 },
    bentoValue: { color: colors.navy, fontFamily: font.bold, fontSize: 18, marginTop: 8 },
    bentoValueSuccess: { color: colors.green },
    bentoValueMuted: { color: colors.red },
    primaryActionButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginBottom: 10, borderRadius: 12, backgroundColor: colors.pink },
    primaryActionText: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
    secondaryActionButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginTop: 10, borderRadius: 12, backgroundColor: '#FCE3EB' },
    secondaryActionText: { color: colors.pink, fontFamily: font.semibold, fontSize: 9 },
    productCard: { padding: 12, marginBottom: 8, borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
    productMetaRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    productCopy: { flex: 1, minWidth: 0 },
    productName: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
    productDescription: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 3 },
    productFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
    productPriceLabel: { color: colors.muted, fontFamily: font.regular, fontSize: 7 },
    productPriceValue: { color: colors.navy, fontFamily: font.bold, fontSize: 12, marginTop: 2 },
    availabilityPill: { minHeight: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 999, borderWidth: 1 },
    availabilityAvailable: { backgroundColor: colors.paleGreen, borderColor: '#CFE9D7' },
    availabilityUnavailable: { backgroundColor: colors.paleRed, borderColor: '#F4D5DA' },
    availabilityText: { color: colors.green, fontFamily: font.semibold, fontSize: 7 },
    availabilityTextMuted: { color: colors.red },
    editActionButton: { minHeight: 27, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 9, backgroundColor: '#FCE3EB' },
    editActionText: { color: colors.pink, fontFamily: font.semibold, fontSize: 7 },
    productDetailSheet: { padding: 12, marginTop: 10, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
    productDetailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    productDetailLabel: { color: colors.muted, fontFamily: font.medium, fontSize: 7, marginBottom: 4 },
    productDetailText: { color: colors.navy, fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginBottom: 10 },
    productDetailGrid: { flexDirection: 'row', gap: 8 },
    detailStatBox: { flex: 1, minHeight: 60, padding: 10, borderRadius: 12, backgroundColor: colors.pale, borderWidth: 1, borderColor: colors.line },
    productDetailValue: { color: colors.navy, fontFamily: font.semibold, fontSize: 11 },
    closeActionButton: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.pale },
    closeActionText: { color: colors.navy, fontFamily: font.bold, fontSize: 16 },
    productModalBackdrop: { position: 'absolute', inset: 0, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(16, 16, 39, 0.35)' },
    productModalCard: { maxWidth: 420, width: '100%', alignSelf: 'center', padding: 16, borderRadius: 18, backgroundColor: colors.white },
    productModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    productModalTitle: { color: colors.navy, fontFamily: font.bold, fontSize: 14 },
    fieldLabel: { color: colors.navy, fontFamily: font.semibold, fontSize: 8, marginTop: 8, marginBottom: 6 },
    textInput: { minHeight: 38, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, color: colors.ink, fontFamily: font.regular, fontSize: 8 },
    textArea: { minHeight: 74, textAlignVertical: 'top', paddingTop: 9 },
    textInputError: { borderColor: colors.red },
    fieldError: { color: colors.red, fontFamily: font.regular, fontSize: 7, marginTop: 4 },
    segmentedRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
    segmentButton: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
    segmentButtonSelected: { borderColor: colors.pink, backgroundColor: '#FCE3EB' },
    segmentButtonText: { color: colors.muted, fontFamily: font.medium, fontSize: 7 },
    segmentButtonTextSelected: { color: colors.pink, fontFamily: font.semibold },
    feedbackText: { marginTop: 8, fontFamily: font.medium, fontSize: 7 },
    feedbackSuccess: { color: colors.green },
    feedbackError: { color: colors.red },
    dataDisclaimer: { color: colors.muted, fontFamily: font.regular, fontSize: 7, marginBottom: 10 },
    alertTabs: { flexDirection: 'row', gap: 5, paddingVertical: 2, marginBottom: 10 },
    recordFilterRow: { flexDirection: 'row', gap: 5, paddingVertical: 2, marginBottom: 10 },
    recordFilterTab: { minWidth: 68, flex: 0, paddingHorizontal: 10 },
    alertTab: { flex: 1, minHeight: 35, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.white },
    alertTabSelected: { borderColor: colors.pink, backgroundColor: '#FCE3EB' },
    alertTabText: { color: colors.muted, fontFamily: font.medium, fontSize: 7, textAlign: 'center' },
    alertTabTextSelected: { color: colors.pink, fontFamily: font.semibold },
    noticeCard: { padding: 13, marginBottom: 10, borderRadius: 13, backgroundColor: '#FFF7E5', borderWidth: 1, borderColor: '#F7E5BC' },
    noticeTitle: { color: '#735518', fontFamily: font.semibold, fontSize: 9 },
    noticeText: { color: '#735518', fontFamily: font.regular, fontSize: 7, lineHeight: 12, marginTop: 4 },
    discrepancyCard: { padding: 12, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
    discrepancyHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    quantityCompare: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, marginTop: 8, borderTopWidth: 1, borderTopColor: colors.line, borderBottomWidth: 1, borderBottomColor: colors.line },
    compareLabel: { color: colors.muted, fontFamily: font.regular, fontSize: 7 },
    compareValue: { color: colors.navy, fontFamily: font.semibold, fontSize: 8, marginTop: 4 },
    remarksText: { color: colors.ink, fontFamily: font.regular, fontSize: 8, lineHeight: 13, marginVertical: 8 },
    workflowUnavailable: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, paddingHorizontal: 2, marginVertical: 10 },
    moreCard: { minHeight: 65, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, marginBottom: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.white },
    moreIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 11, marginRight: 10, backgroundColor: '#FCE3EB' },
    themeIcon: { backgroundColor: colors.pale },
    moreIconText: { color: colors.pink, fontFamily: font.semibold, fontSize: 13 },
    moreChevron: { color: colors.muted, fontSize: 20, marginLeft: 8 },
    themeSwitch: { minHeight: 29, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 15, backgroundColor: colors.pale },
    themeSwitchText: { color: colors.navy, fontFamily: font.medium, fontSize: 7 },
    logoutCard: { minHeight: 43, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderRadius: 13, backgroundColor: colors.paleRed },
    logoutText: { color: colors.red, fontFamily: font.semibold, fontSize: 9 },
    profileCard: { alignItems: 'center', paddingVertical: 22, marginBottom: 10, borderRadius: 18, backgroundColor: colors.white },
    profileAvatar: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 31, backgroundColor: '#FCE3EB' },
    profileInitials: { color: colors.pink, fontFamily: font.bold, fontSize: 24 },
    profileName: { color: colors.navy, fontFamily: font.semibold, fontSize: 12, marginTop: 9 },
    profileRole: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 2 },
    profileRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.line },
    profileRowLast: { borderBottomWidth: 0 },
    profileValue: { maxWidth: '67%', color: colors.navy, fontFamily: font.medium, fontSize: 8, textAlign: 'right' },
    errorCard: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 11, paddingVertical: 8, marginBottom: 8, borderRadius: 12, backgroundColor: colors.paleRed },
    errorText: { flex: 1, color: colors.red, fontFamily: font.medium, fontSize: 8, lineHeight: 12 },
    retryAction: { paddingHorizontal: 9, paddingVertical: 6, marginLeft: 7, borderRadius: 9, backgroundColor: colors.white },
    retryText: { color: colors.pink, fontFamily: font.semibold, fontSize: 8 },
    loadingCard: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.white },
    loadingText: { color: colors.muted, fontFamily: font.regular, fontSize: 8 },
    emptyState: { minHeight: 55, justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 12, marginBottom: 8, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
    emptyStateText: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 12 },
    lowText: { color: colors.red },
    warningText: { color: '#8D6414' },
    bottomBar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginHorizontal: 14, marginTop: 8, marginBottom: 11, paddingHorizontal: 6, paddingVertical: 6, borderRadius: 24, backgroundColor: colors.white },
    navItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
    navIconWrap: { minWidth: 34, height: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, borderRadius: 16 },
    navIconWrapSelected: { backgroundColor: colors.navy },
    navIcon: { color: colors.muted, fontFamily: font.semibold, fontSize: 14, lineHeight: 18 },
    navIconSelected: { color: colors.white },
    navLabel: { color: colors.muted, fontFamily: font.medium, fontSize: 6, marginTop: 2 },
    navLabelSelected: { color: colors.pink, fontFamily: font.semibold },
  }, theme)), [theme]);
}
