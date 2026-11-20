import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Modal from '../SessionProtectedModal';
import type { ImageSourcePropType } from 'react-native';
import type { SaleSubmission, StaffMenuAddon, StaffMenuCatalogItem } from '../services/takosync';
import { isRetryableSaleSubmissionError } from '../services/ownerSalesStatus';
import { useTheme } from '../theme/ThemeProvider';
import { ownerColors } from '../owner/shared/ownerTokens';
import type { MenuCartLine, MenuProduct, MenuProductGroup } from './menuPreviewData';
import { resolveMenuAddons } from './menuAddons';
import {
  calculateSelectedAddonTotal,
  hitSlopForTarget,
  calculateMenuCart,
  groupMenuProducts,
  menuOrderValidationMessage,
  selectFlavorMenuProducts,
  shouldOfferCheckoutRetry,
} from './menuPreviewData';

type MenuPage = 'menu' | 'cart' | 'checkout';

type MenuWorkspaceProps = {
  visible: boolean;
  page: MenuPage;
  staffName: string;
  assignedBranch: string;
  cart: MenuCartLine[];
  onSetPage: (page: MenuPage) => void;
  onAddProduct: (productId: string) => void;
  onIncreaseQuantity: (productId: string) => void;
  onDecreaseQuantity: (productId: string) => void;
  onRemoveProduct: (productId: string) => void;
  onCancelOrder: () => void;
  onSubmitSale: (input: Omit<SaleSubmission, 'branchId' | 'transactionReference'>) => Promise<void>;
  catalog: StaffMenuCatalogItem[];
  addons: StaffMenuAddon[];
  catalogLoading: boolean;
  catalogError: string;
  onRetryCatalog: () => void;
  feedbackMessage?: string;
  onDismissFeedback?: () => void;
  onRetryInventory?: () => void;
};

const colors = {
  pink: ownerColors.primary,
  navy: ownerColors.navy,
  background: '#F5F5F5',
  white: '#FFFFFF',
  text: '#171717',
  secondary: '#8D8D98',
  border: '#E8E8ED',
  warning: '#FFF2C4',
  error: '#F52F2E',
} as const;

const REMOVE_BUTTON_SIZE = { width: 22, height: 23 } as const;
// The visual "×" stays compact; the touch area is padded out to at least 44 x 44.
const REMOVE_BUTTON_HIT_SLOP = hitSlopForTarget(REMOVE_BUTTON_SIZE.width, REMOVE_BUTTON_SIZE.height);

const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

const typeScale = {
  micro: 8,
  caption: 10,
  body: 12,
  section: 14,
  heading: 16,
  title: 18,
} as const;

const money = (value: number) => `₱${value.toLocaleString('en-PH')}`;

type FlavorOption = {
  id: string;
  label: string;
  productName: string;
  comboName?: string;
  image: ImageSourcePropType;
};

const flavorOptions: FlavorOption[] = [
  {
    id: 'octobits',
    label: 'Octobits',
    productName: 'Octobits Takoyaki',
    comboName: 'Octobits / Cheese',
    image: require('../../assets/OCTOBITS.png'),
  },
  {
    id: 'cheese',
    label: 'Cheese',
    productName: 'Cheese Takoyaki',
    image: require('../../assets/CHEESE.png'),
  },
  {
    id: 'crab',
    label: 'Crab',
    productName: 'Crab Takoyaki',
    comboName: 'Crab / Cheese',
    image: require('../../assets/CRAB.png'),
  },
  {
    id: 'bacon',
    label: 'BaconBits',
    productName: 'BaconBits Takoyaki',
    comboName: 'Bacon / Cheese',
    image: require('../../assets/BACON.png'),
  },
];

const productArtwork: Record<string, ImageSourcePropType[]> = {
  'Octobits Takoyaki': [require('../../assets/OCTOBITS.png')],
  'Cheese Takoyaki': [require('../../assets/CHEESE.png')],
  'Crab Takoyaki': [require('../../assets/CRAB.png')],
  'BaconBits Takoyaki': [require('../../assets/BACON.png')],
  'Octobits / Cheese': [require('../../assets/CHEESEY.png')],
  'Bacon / Cheese': [require('../../assets/CHEESEY.png')],
  'Crab / Cheese': [require('../../assets/CHEESEY.png')],
};

function ProductArtwork({ name }: { name: string }) {
  const { isDark } = useTheme();
  const images = productArtwork[name] ?? [];
  return (
    <View style={[styles.productArtwork, isDark && { backgroundColor: colors.navy }]}>
      {images.map((source, index) => (
        <Image
          key={`${name}-${index}`}
          source={source}
          resizeMode="contain"
          style={images.length === 1 ? styles.singleProductImage : styles.comboProductImage}
        />
      ))}
    </View>
  );
}

function ProgressSteps({ active }: { active: 1 | 2 | 3 }) {
  return (
    <View style={styles.progress}>
      {[
        { number: 1, label: 'Menu' },
        { number: 2, label: 'Cart' },
        { number: 3, label: 'Payment' },
      ].map((step, index) => {
        const complete = step.number < active;
        const current = step.number === active;
        return (
          <React.Fragment key={step.number}>
            {index > 0 ? <View style={[styles.progressLine, step.number <= active && styles.progressLineActive]} /> : null}
            <View style={styles.progressStep}>
              <View style={[
                styles.progressCircle,
                complete && styles.progressCircleActive,
                current && styles.progressCircleCurrent,
              ]}>
                <Text style={[
                  styles.progressNumber,
                  complete && styles.progressNumberActive,
                  current && styles.progressNumberCurrent,
                ]}>
                  {step.number < active ? '✓' : step.number}
                </Text>
              </View>
              <Text style={[
                styles.progressLabel,
                complete && styles.progressLabelActive,
                current && styles.progressLabelCurrent,
              ]}>{step.label}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

function ScreenHeader({ title, subtitle, onBack }: {
  title: string;
  subtitle?: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTitleRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function SizeOptionCard({
  productName,
  variant,
  onAdd,
  onViewInfo,
}: {
  productName: string;
  variant: MenuProduct;
  onAdd: () => void;
  onViewInfo: () => void;
}) {
  const { isDark } = useTheme();
  return (
    <View style={[styles.sizeOptionCard, isDark && { backgroundColor: '#0F1025' }, !variant.isAvailable && styles.sizeOptionCardUnavailable]}>
      <View style={styles.sizeOptionHeader}>
        <Text style={[styles.sizeOptionLabel, isDark && { color: '#FFFFFF' }]}>{variant.sizeLabel}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View information for ${productName}`}
          onPress={onViewInfo}
          style={styles.sizeInfoButton}
        >
          <Text style={styles.sizeInfoButtonText}>i</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${variant.isAvailable ? 'Add' : 'Unavailable'} ${productName}, ${variant.sizeLabel}, ${money(variant.price)}`}
        accessibilityHint={variant.isAvailable ? undefined : 'Shows that this item is currently unavailable'}
        onPress={onAdd}
        style={({ pressed }) => [styles.sizeOptionAction, pressed && styles.pressed]}
      >
        <Text style={[styles.sizeOptionPrice, isDark && { color: '#FFFFFF' }]}>{money(variant.price)}</Text>
        <View style={styles.availabilityLine}>
          <View style={[styles.availabilityDot, !variant.isAvailable && styles.availabilityDotOff]} />
          <Text style={[styles.availabilityLabel, !variant.isAvailable && styles.unavailableText]}>
            {variant.isAvailable ? 'Available' : 'Unavailable'}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function CartItemCard({
  product,
  quantity,
  onIncrease,
  onDecrease,
  onRemove,
}: {
  product: MenuProduct;
  quantity: number;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
}) {
  const { isDark } = useTheme();
  return (
    <View style={[styles.cartItem, isDark && { backgroundColor: '#0F1025' }]}>
      <ProductArtwork name={product.productName} />
      <View style={styles.cartItemCopy}>
        <Text style={[styles.cartItemName, isDark && { color: '#FFFFFF' }]} numberOfLines={2}>{product.name}</Text>
        <Text style={[styles.cartItemDetail, isDark && { color: '#B2B3C4' }]} numberOfLines={2}>{product.description || 'No description available'}</Text>
        <Text style={[styles.cartItemPrice, isDark && { color: '#FFFFFF' }]}>{money(product.price)} each</Text>
      </View>
      <View style={styles.cartItemActions}>
        <Text style={styles.cartLineTotal}>{money(product.price * quantity)}</Text>
        <View style={styles.quantityControl}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${product.name} quantity`}
            onPress={onDecrease}
            style={styles.quantityButton}
          >
            <Text style={styles.quantityButtonText}>−</Text>
          </Pressable>
          <Text style={styles.quantityValue}>{quantity}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Increase ${product.name} quantity`}
            onPress={onIncrease}
            style={styles.quantityButton}
          >
            <Text style={styles.quantityButtonText}>+</Text>
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${product.name}`} hitSlop={REMOVE_BUTTON_HIT_SLOP} onPress={onRemove}>
          <Text style={styles.removeItem}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CurrentOrderLine({
  product,
  quantity,
  onIncrease,
  onDecrease,
  onRemove,
}: {
  product: MenuProduct;
  quantity: number;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
}) {
  const { isDark } = useTheme();
  const darkText = isDark ? { color: '#FFFFFF' } : undefined;
  const darkQuantityText = isDark ? { color: '#0F1025' } : undefined;
  return (
    <View style={styles.currentOrderLine}>
      <View style={styles.currentOrderCopy}>
        <Text style={[styles.currentOrderName, darkText]} numberOfLines={1}>{product.name}</Text>
        <Text style={[styles.currentOrderUnit, darkText]}>{money(product.price)} each</Text>
      </View>
      <Text style={[styles.currentOrderLineTotal, darkText]}>{money(product.price * quantity)}</Text>
      <View style={styles.currentOrderQuantity}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${product.name} quantity`}
          onPress={onDecrease}
          style={styles.currentOrderQuantityButton}
        >
          <Text style={styles.currentOrderQuantityText}>−</Text>
        </Pressable>
        <Text style={[styles.currentOrderQuantityValue, darkQuantityText]}>{quantity}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${product.name} quantity`}
          onPress={onIncrease}
          style={styles.currentOrderQuantityButton}
        >
          <Text style={styles.currentOrderQuantityText}>+</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${product.name}`}
        hitSlop={REMOVE_BUTTON_HIT_SLOP}
        onPress={onRemove}
        style={styles.currentOrderRemove}
      >
        <Text style={styles.currentOrderRemoveText}>×</Text>
      </Pressable>
    </View>
  );
}

export default function MenuWorkspace({
  visible,
  page,
  staffName,
  assignedBranch,
  cart,
  onSetPage,
  onAddProduct,
  onIncreaseQuantity,
  onDecreaseQuantity,
  onRemoveProduct,
  onCancelOrder,
  onSubmitSale,
  catalog,
  addons,
  catalogLoading,
  catalogError,
  onRetryCatalog,
  feedbackMessage = '',
  onDismissFeedback,
  onRetryInventory,
}: MenuWorkspaceProps) {
  const { isDark, colors: themeColors } = useTheme();
  const darkSecondarySurface = isDark ? { backgroundColor: '#0F1025' } : undefined;
  const darkSecondaryText = isDark ? { color: '#FFFFFF' } : undefined;
  const darkWarningText = isDark ? { color: '#0F1025' } : undefined;
  const [selectedFlavorId, setSelectedFlavorId] = useState('octobits');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'QR'>('Cash');
  const [paymentMenuOpen, setPaymentMenuOpen] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [saleSubmitting, setSaleSubmitting] = useState(false);
  const [saleError, setSaleError] = useState('');
  const [saleRetryAvailable, setSaleRetryAvailable] = useState(false);
  const [proceedBlocked, setProceedBlocked] = useState(false);
  const [infoProducts, setInfoProducts] = useState<MenuProductGroup[] | null>(null);
  const selectedFlavor = flavorOptions.find((flavor) => flavor.id === selectedFlavorId) ?? flavorOptions[0];
  const products: MenuProduct[] = useMemo(
    () => catalog.map((product) => ({
      id: product.id,
      productId: product.productId,
      productName: product.name,
      sizeLabel: product.sizeLabel,
      pieceCount: product.pieceCount,
      category: product.category,
      name: `${product.name} - ${product.sizeLabel}`,
      description: product.description,
      price: product.price,
      isAvailable: product.isAvailable,
    })),
    [catalog],
  );
  const productGroups = useMemo(() => groupMenuProducts(products), [products]);
  const selectedProductGroups = useMemo(
    () => selectFlavorMenuProducts(productGroups, selectedFlavor.productName, selectedFlavor.comboName),
    [productGroups, selectedFlavor],
  );

  useEffect(() => {
    if (catalogLoading || catalogError) return;
    const availableIds = new Set(products.filter((product) => product.isAvailable).map((product) => product.id));
    for (const line of cart) {
      if (!availableIds.has(line.productId)) onRemoveProduct(line.productId);
    }
  }, [catalogLoading, catalogError, products]);

  const totals = calculateMenuCart(cart, products);
  const { available: displayAddons, missingLabels: missingAddonNames } = useMemo(
    () => resolveMenuAddons(addons),
    [addons],
  );
  const selectedAddons = displayAddons.filter((addon) => selectedAddonIds.includes(addon.id));
  const addonsTotal = calculateSelectedAddonTotal(displayAddons, selectedAddonIds);
  const checkoutTotal = Math.round((totals.total + addonsTotal) * 100) / 100;
  const cartProducts = useMemo(() => cart.flatMap((line) => {
    const product = products.find((item) => item.id === line.productId);
    return product ? [{ product, quantity: line.quantity }] : [];
  }), [cart, products]);
  const parsedCash = Number(cashReceived);
  const cashValid = paymentMethod !== 'Cash' || (cashReceived.trim() !== '' && Number.isFinite(parsedCash) && parsedCash >= checkoutTotal);
  const checkoutValid = cartProducts.length > 0 && cartProducts.every(({ product, quantity }) => product.isAvailable && Number.isInteger(quantity) && quantity > 0) && cashValid;
  const emptyOrderMessage = menuOrderValidationMessage(cartProducts.length);
  const discardOrder = () => {
    setCashReceived('');
    setPaymentMenuOpen(false);
    setSelectedAddonIds([]);
    setSaleError('');
    setSaleRetryAvailable(false);
    setPaymentMenuOpen(false);
    setProceedBlocked(false);
    onCancelOrder();
    onSetPage('menu');
  };
  const cancelOrder = () => {
    if (saleSubmitting) return;
    Alert.alert('Cancel order?', 'The current order will be cleared. No sale will be saved.', [
      { text: 'Keep order', style: 'cancel' },
      { text: 'Cancel Order', style: 'destructive', onPress: discardOrder },
    ]);
  };
  const clearCurrentOrder = () => {
    if (totals.count === 0 && selectedAddonIds.length === 0) return;
    Alert.alert('Clear current order?', 'This will remove all items and selected add-ons.', [
      { text: 'Keep order', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          onCancelOrder();
          setSelectedAddonIds([]);
          setCashReceived('');
          setSaleError('');
          setSaleRetryAvailable(false);
        },
      },
    ]);
  };
  const branchSegments = assignedBranch.split(' · ');
  const branchName = branchSegments[0] || assignedBranch;
  const branchCode = branchSegments.slice(1).join(' · ') || assignedBranch;
  const submitCheckout = async () => {
    if (!checkoutValid || saleSubmitting) return;
    setSaleSubmitting(true);
    setSaleError('');
    setSaleRetryAvailable(false);
    try {
      await onSubmitSale({
        paymentMethod,
        totalAmount: checkoutTotal,
        items: cartProducts.map(({ product, quantity }) => ({
          variantId: product.id,
          quantity,
          unitPrice: product.price,
        })),
        addons: selectedAddons.map((addon) => ({ addonId: addon.id, unitPrice: addon.price })),
      });
      setCashReceived('');
      setSelectedAddonIds([]);
    } catch (error) {
      setSaleError(error instanceof Error ? error.message : 'The sale could not be recorded. Your cart was preserved.');
      setSaleRetryAvailable(isRetryableSaleSubmissionError(error));
    } finally {
      setSaleSubmitting(false);
    }
  };

  if (!visible) return <View style={styles.hidden} />;

  if (page === 'cart') {
    return (
      <View style={[styles.screen, isDark && { backgroundColor: themeColors.background }]}>
        <ScreenHeader title="Current Order Summary" onBack={() => onSetPage('menu')} />
        <ProgressSteps active={2} />
        <ScrollView
          style={styles.cartScroll}
          contentContainerStyle={styles.cartList}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionHeading}>Your items <Text style={styles.itemCount}>({totals.count})</Text></Text>
          {cartProducts.map(({ product, quantity }) => (
            <CartItemCard
              key={product.id}
              product={product}
              quantity={quantity}
              onIncrease={() => onIncreaseQuantity(product.id)}
              onDecrease={() => onDecreaseQuantity(product.id)}
              onRemove={() => onRemoveProduct(product.id)}
            />
          ))}
          {selectedAddons.map((addon) => (
            <View key={addon.id} style={styles.currentAddonLine}>
              <Text style={[styles.currentAddonName, darkSecondaryText]}>{addon.name}</Text>
              <Text style={[styles.currentAddonPrice, darkSecondaryText]}>{money(addon.price)}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Remove ' + addon.name}
                onPress={() => setSelectedAddonIds((current) => current.filter((id) => id !== addon.id))}
                style={styles.currentOrderRemove}
              >
                <Text style={styles.currentOrderRemoveText}>×</Text>
              </Pressable>
            </View>
          ))}
          {cartProducts.length === 0 ? (
            <View style={[styles.emptyCard, darkSecondarySurface]}>
              <Text style={styles.emptyTitle}>Your cart is empty</Text>
              <Text style={styles.emptyCopy}>Add menu items to review a preview total.</Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => onSetPage('menu')}
            style={styles.addMoreButton}
          >
            <Text style={styles.addMoreText}>＋  Add more items</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={cancelOrder} style={styles.cancelCartButton}>
            <Text style={styles.cancelCartText}>Cancel order</Text>
          </Pressable>
          <Text style={styles.previewNotice}>Inventory updates after you confirm the transaction.</Text>
        </ScrollView>
        <View style={[styles.cartTotalFooter, isDark && { backgroundColor: '#0F1025', borderColor: '#292A43' }]}>
          <View style={styles.cartTotalRow}>
            <Text style={[styles.cartTotalLabel, isDark && { color: '#FFFFFF' }]}>Total</Text>
            <Text style={styles.cartTotalValue}>{money(checkoutTotal)}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Proceed to Payment"
            disabled={emptyOrderMessage !== ''}
            onPress={() => {
              if (emptyOrderMessage !== '') return;
              onSetPage('checkout');
            }}
            style={({ pressed }) => [
              styles.cartProceedButton,
              emptyOrderMessage !== '' && styles.disabledButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.cartProceedText}>Proceed to Payment</Text>
          </Pressable>
          {emptyOrderMessage !== '' ? <Text style={styles.paymentError}>{emptyOrderMessage}</Text> : null}
        </View>
      </View>
    );
  }

  if (page === 'checkout') {
    return (
      <View style={[styles.screen, isDark && { backgroundColor: themeColors.background }]}>
        <ScreenHeader
          title="Payment"
          subtitle={`${branchName} · ${staffName}`}
          onBack={() => onSetPage('cart')}
        />
        <ProgressSteps active={3} />
        <ScrollView
          style={styles.checkoutScroll}
          contentContainerStyle={styles.checkoutContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.paymentSummaryCard, isDark && { backgroundColor: '#0F1025', borderColor: '#292A43' }]}>
            <Text style={[styles.paymentSummaryTitle, isDark && { color: '#FFFFFF' }]}>Order Summary</Text>
            {cartProducts.map(({ product, quantity }) => (
              <View key={product.id} style={styles.paymentSummaryLine}>
                <View style={styles.paymentSummaryCopy}>
                  <Text style={[styles.paymentSummaryName, isDark && { color: '#FFFFFF' }]}>{product.name}</Text>
                  <Text style={[styles.paymentSummaryMeta, isDark && { color: '#B8B8C5' }]}>{quantity} × {money(product.price)}</Text>
                </View>
                <Text style={[styles.paymentSummaryLineTotal, isDark && { color: '#FFFFFF' }]}>{money(product.price * quantity)}</Text>
              </View>
            ))}
            {selectedAddons.map((addon) => (
              <View key={addon.id} style={styles.paymentSummaryLine}>
                <View style={styles.paymentSummaryCopy}>
                  <Text style={[styles.paymentSummaryName, isDark && { color: '#FFFFFF' }]}>{addon.name}</Text>
                  <Text style={[styles.paymentSummaryMeta, isDark && { color: '#B8B8C5' }]}>Add-on</Text>
                </View>
                <Text style={[styles.paymentSummaryLineTotal, isDark && { color: '#FFFFFF' }]}>{money(addon.price)}</Text>
              </View>
            ))}
            <View style={styles.paymentSummaryTotalRow}>
              <Text style={[styles.paymentSummaryTotalLabel, isDark && { color: '#B8B8C5' }]}>Total</Text>
              <Text style={[styles.paymentSummaryTotalValue, isDark && { color: '#FFFFFF' }]}>{money(checkoutTotal)}</Text>
            </View>
          </View>
          <Text style={styles.paymentLabel}>Add-ons</Text>
          {displayAddons.length === 0 ? (
            <Text style={styles.paymentMessage}>No add-ons are currently available.</Text>
          ) : displayAddons.map((addon) => {
            const selected = selectedAddonIds.includes(addon.id);
            return (
              <Pressable
                key={addon.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => setSelectedAddonIds((current) => selected
                  ? current.filter((id) => id !== addon.id)
                  : [...current, addon.id])}
                style={[styles.addonOption, darkSecondarySurface]}
              >
                <Text style={[styles.addonOptionText, darkSecondaryText]}>{selected ? '✓ ' : ''}{addon.name}</Text>
                <Text style={[styles.addonOptionPrice, darkSecondaryText]}>{money(addon.price)}</Text>
              </Pressable>
            );
          })}
          {selectedAddons.length > 0 ? (
            <View style={styles.checkoutTotalRow}>
              <Text style={styles.checkoutSummary}>Add-ons total</Text>
              <Text style={styles.checkoutLineTotal}>{money(addonsTotal)}</Text>
            </View>
          ) : null}

          <Text style={styles.paymentLabel}>Payment Method</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: paymentMenuOpen }}
            onPress={() => setPaymentMenuOpen((open) => !open)}
            style={[styles.paymentSelect, isDark && { backgroundColor: '#0F1025', borderColor: '#292A43' }]}
          >
            <Text style={[styles.paymentSelectText, isDark && { color: '#FFFFFF' }]}>{paymentMethod === 'Cash' ? 'Cash' : 'G-Cash'}</Text>
            <Text style={[styles.paymentSelectChevron, isDark && { color: '#FFFFFF' }]}>{paymentMenuOpen ? '⌃' : '⌄'}</Text>
          </Pressable>
          {paymentMenuOpen ? (
            <View style={[styles.paymentMenu, isDark && { backgroundColor: '#0F1025', borderColor: '#292A43' }]}>
              {(['Cash', 'QR'] as const).map((method) => (
                <Pressable
                  key={method}
                  accessibilityRole="button"
                  accessibilityState={{ selected: paymentMethod === method }}
                  onPress={() => {
                    setPaymentMethod(method);
                    setPaymentMenuOpen(false);
                    if (method === 'QR') setCashReceived('');
                  }}
                  style={[
                    styles.paymentMenuOption,
                    paymentMethod === method && styles.paymentMenuOptionSelected,
                  ]}
                >
                  <Text style={[
                    styles.paymentMenuOptionText,
                    paymentMethod === method && styles.paymentMenuOptionTextSelected,
                  ]}>
                    {method === 'Cash' ? 'Cash' : 'G-Cash'}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {paymentMethod === 'Cash' ? (
            <View style={styles.cashSection}>
              <Text style={styles.paymentLabel}>Cash Received</Text>
              <TextInput
                accessibilityLabel="Cash received"
                value={cashReceived}
                onChangeText={setCashReceived}
                keyboardType="decimal-pad"
                placeholder="Enter amount"
                placeholderTextColor={colors.secondary}
                style={[
                  styles.paymentInput,
                  isDark && { backgroundColor: '#0F1025', borderColor: '#292A43', color: '#FFFFFF' },
                  cashReceived !== '' && !cashValid && styles.paymentInputError,
                ]}
              />
              {cashReceived !== '' && !cashValid ? <Text style={styles.paymentError}>Cash received must cover the total.</Text> : null}
              {cashValid && cashReceived !== '' ? <Text style={styles.changeText}>Change: {money(parsedCash - checkoutTotal)}</Text> : null}
            </View>
          ) : (
            <Text style={styles.paymentMessage}>QR is recorded as the selected payment method; payment is not automatically verified.</Text>
          )}
          {!checkoutValid && cartProducts.length > 0 ? (
            <Text style={styles.paymentError}>Complete the required payment information before confirming.</Text>
          ) : null}
          {saleError !== '' ? (
            <View accessibilityRole="alert">
              <Text style={styles.paymentError}>{saleError}</Text>
              {shouldOfferCheckoutRetry(saleRetryAvailable, cartProducts.length) ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={saleSubmitting}
                  onPress={() => void submitCheckout()}
                  style={styles.retryCheckoutButton}
                >
                  <Text style={styles.retryCheckoutText}>{saleSubmitting ? 'Saving…' : 'Retry'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
        <View style={[styles.paymentFooter, isDark && { backgroundColor: '#0F1025', borderColor: '#292A43' }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Confirm transaction"
            disabled={!checkoutValid || saleSubmitting}
            onPress={() => void submitCheckout()}
            style={[styles.reviewOrderButton, (!checkoutValid || saleSubmitting) && styles.disabledButton]}
          >
            <Text style={styles.reviewOrderText}>{saleSubmitting ? 'Saving…' : 'Confirm Transaction'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={saleSubmitting}
            onPress={cancelOrder}
            style={styles.checkoutBackButton}
          >
            <Text style={styles.checkoutBackText}>Cancel order</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.posScreen, isDark && { backgroundColor: '#0F1025' }]}>
      <View style={[styles.posHeader, { backgroundColor: colors.white }]}>
        <Text style={[styles.posHeaderTitle, { color: colors.navy }]}>POS · {branchName}</Text>
        <Text style={[styles.posHeaderStaff, { color: colors.secondary }]} numberOfLines={1}>{staffName} · {branchCode}</Text>
      </View>
      <View style={styles.productSelectionSection}>
        <ScrollView
          horizontal
          style={styles.flavorSelector}
          contentContainerStyle={styles.flavorSelectorContent}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          {flavorOptions.map((flavor) => {
            const selected = flavor.id === selectedFlavor.id;
            const circleBackground = selected
              ? (isDark ? colors.white : colors.navy)
              : (isDark ? colors.navy : colors.white);
            return (
              <Pressable
                key={flavor.id}
                accessibilityRole="button"
                accessibilityLabel={`Select ${flavor.label} flavor`}
                accessibilityState={{ selected }}
                onPress={() => setSelectedFlavorId(flavor.id)}
                style={styles.flavorOption}
              >
                <View style={[styles.flavorImageFrame, { backgroundColor: circleBackground }, selected && styles.flavorImageFrameSelected]}>
                  <Image source={flavor.image} resizeMode="cover" style={styles.flavorImage} />
                </View>
                <Text style={[styles.flavorLabel, selected && styles.flavorLabelSelected]}>{flavor.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.selectedProductBar}>
          <View style={styles.selectedProductCopy}>
            <Text style={styles.selectedProductTitle} numberOfLines={1}>{selectedFlavor.productName}</Text>
            <Text style={styles.selectedProductSubtitle}>Choose a size to add to your order</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View menu information for ${selectedFlavor.productName}`}
            accessibilityState={{ disabled: selectedProductGroups.length === 0 }}
            disabled={selectedProductGroups.length === 0}
            onPress={() => setInfoProducts(selectedProductGroups)}
            style={({ pressed }) => [styles.viewMenuButton, pressed && styles.pressed]}
          >
            <Text style={styles.viewMenuText}>View menu</Text>
          </Pressable>
        </View>
        <ScrollView
          style={styles.posProductScroll}
          contentContainerStyle={styles.posProductList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        {feedbackMessage !== '' ? (
              <View style={styles.feedbackBanner} accessibilityRole="alert">
            <Pressable onPress={onDismissFeedback} style={styles.feedbackMessagePressable}>
                <Text style={[styles.feedbackText, darkWarningText]}>{feedbackMessage}</Text>
              <Text style={[styles.feedbackDismiss, darkWarningText]}>×</Text>
            </Pressable>
            {onRetryInventory ? (
              <Pressable onPress={onRetryInventory} style={styles.retryInventoryButton} accessibilityRole="button">
                <Text style={styles.retryInventoryText}>Retry inventory</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {catalogLoading ? (
          <View style={[styles.stateCard, darkSecondarySurface]}>
            <ActivityIndicator color={colors.pink} />
            <Text style={styles.emptyCopy}>Loading menu…</Text>
          </View>
        ) : catalogError ? (
          <View style={[styles.stateCard, darkSecondarySurface]}>
            <Text style={styles.emptyTitle}>Unable to load menu</Text>
            <Text style={styles.emptyCopy}>{catalogError}</Text>
            <Pressable onPress={onRetryCatalog} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : selectedProductGroups.length === 0 ? (
          <View style={[styles.stateCard, darkSecondarySurface]}>
            <Text style={styles.emptyTitle}>
              {products.length === 0 ? 'No products available' : 'No menu for this flavor'}
            </Text>
            <Text style={styles.emptyCopy}>
              {products.length === 0
                ? 'The assigned branch has no visible products in the live catalog.'
                : 'This product is not available in the assigned branch catalog.'}
            </Text>
          </View>
        ) : (
          <>
            {selectedProductGroups.map((group, index) => (
              <View key={group.id} style={styles.sizeGroup}>
                <View style={styles.sizeGroupHeading}>
                  <Text style={styles.sizeGroupTitle}>{index === 0 ? 'Regular' : 'Combo + cheese'}</Text>
                  <Text style={styles.sizeGroupProduct} numberOfLines={1}>{group.name}</Text>
                </View>
                <View style={styles.sizeOptionRow}>
                  {group.variants.map((variant) => (
                    <SizeOptionCard
                      key={variant.id}
                      productName={group.name}
                      variant={variant}
                      onAdd={() => onAddProduct(variant.id)}
                      onViewInfo={() => setInfoProducts([group])}
                    />
                  ))}
                </View>
              </View>
            ))}
            <View style={styles.addonSection}>
              <Text style={styles.addonSectionTitle}>Add-ons</Text>
              {displayAddons.length > 0 ? (
                <View style={styles.addonPills}>
                  {displayAddons.map((addon) => {
                    const selected = selectedAddonIds.includes(addon.id);
                    return (
                      <Pressable
                        key={addon.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        onPress={() => setSelectedAddonIds((current) => selected
                          ? current.filter((id) => id !== addon.id)
                          : [...current, addon.id])}
                        style={[styles.addonPill, isDark && darkSecondarySurface, selected && styles.addonPillSelected]}
                      >
                        <Text style={[styles.addonPillText, isDark && darkSecondaryText, selected && styles.addonPillTextSelected]}>
                          {addon.name} · +{money(addon.price)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.addonUnavailableText}>No add-ons are configured in the live catalog.</Text>
              )}
              {missingAddonNames.length > 0 ? (
                <Text style={styles.addonUnavailableText}>
                  Not configured in the live catalog: {missingAddonNames.join(', ')}.
                </Text>
              ) : null}
            </View>
          </>
        )}
        </ScrollView>
      </View>
      <View style={[
        styles.currentOrderPanel,
        darkSecondarySurface,
        isDark && { borderColor: '#292A43' },
      ]}>
        <View style={styles.currentOrderHeader}>
          <View style={styles.currentOrderHeadingCopy}>
            <Text style={[styles.currentOrderTitle, darkSecondaryText]}>Current Order</Text>
            <Text style={[styles.currentOrderCount, darkSecondaryText]}>{totals.count} {totals.count === 1 ? 'item' : 'items'}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear current order"
            disabled={totals.count === 0 && selectedAddonIds.length === 0}
            onPress={clearCurrentOrder}
            style={styles.clearOrderButton}
          >
            <Text style={[
              styles.clearOrderText,
              totals.count === 0 && selectedAddonIds.length === 0 && styles.clearOrderDisabled,
            ]}>Clear</Text>
          </Pressable>
        </View>
        {cartProducts.length > 0 || selectedAddons.length > 0 ? (
          <ScrollView
            style={styles.currentOrderItems}
            contentContainerStyle={styles.currentOrderItemsContent}
            showsVerticalScrollIndicator={false}
          >
            {cartProducts.map(({ product, quantity }) => (
              <CurrentOrderLine
                key={product.id}
                product={product}
                quantity={quantity}
                onIncrease={() => onIncreaseQuantity(product.id)}
                onDecrease={() => onDecreaseQuantity(product.id)}
                onRemove={() => onRemoveProduct(product.id)}
              />
            ))}
            {selectedAddons.map((addon) => (
              <View key={addon.id} style={styles.currentAddonLine}>
              <Text style={[styles.currentAddonName, darkSecondaryText]} numberOfLines={1}>{addon.name}</Text>
              <Text style={[styles.currentAddonPrice, darkSecondaryText]}>{money(addon.price)}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${addon.name}`}
                  hitSlop={REMOVE_BUTTON_HIT_SLOP}
                  onPress={() => setSelectedAddonIds((current) => current.filter((id) => id !== addon.id))}
                  style={styles.currentOrderRemove}
                >
                  <Text style={styles.currentOrderRemoveText}>×</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.currentOrderEmpty}>
            <Text style={[styles.currentOrderEmptyTitle, darkSecondaryText]}>Your order is empty</Text>
            <Text style={styles.currentOrderEmptyMessage}>Tap a product above to start an order.</Text>
          </View>
        )}
        <View style={styles.currentOrderTotalRow}>
          <Text style={[styles.currentOrderTotalLabel, darkSecondaryText]}>Total</Text>
          <Text style={[styles.currentOrderTotalValue, darkSecondaryText]}>{money(checkoutTotal)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Proceed to Payment"
          disabled={catalogLoading || Boolean(catalogError)}
          onPress={() => {
            if (cartProducts.length > 0) {
              setProceedBlocked(false);
              onSetPage('checkout');
            } else {
              setProceedBlocked(true);
            }
          }}
          style={({ pressed }) => [
            styles.proceedPaymentButton,
            cartProducts.length > 0 && styles.proceedPaymentButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[
            styles.proceedPaymentText,
            cartProducts.length > 0 && styles.proceedPaymentTextActive,
          ]}>Proceed to Payment</Text>
        </Pressable>
        {proceedBlocked && cartProducts.length === 0 ? (
          <Text style={styles.paymentError} accessibilityRole="alert">{emptyOrderMessage}</Text>
        ) : null}
      </View>
      <Modal
        visible={infoProducts !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoProducts(null)}
      >
        <View style={styles.infoModalBackdrop}>
          <View style={[styles.infoModalCard, isDark && { backgroundColor: colors.navy }]}>
            <View style={styles.infoModalTopBar}>
              <Text style={styles.infoModalTopBarTitle}>Product Details</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close product details"
                onPress={() => setInfoProducts(null)}
                style={({ pressed }) => [styles.infoModalTopBarClose, pressed && styles.pressed]}
              >
                <Text style={styles.infoModalTopBarCloseText}>×</Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.infoModalScroll}
              contentContainerStyle={styles.infoModalContent}
              showsVerticalScrollIndicator={false}
            >
              {infoProducts?.map((group) => (
                <View key={group.id} style={styles.infoModalGroup}>
                  <View style={styles.infoModalHeader}>
                    <ProductArtwork name={group.name} />
                    <View style={styles.infoModalTitleCopy}>
                      <Text style={[styles.infoModalTitle, isDark && { color: colors.white }]}>{group.name}</Text>
                      <Text style={[styles.infoModalDescription, isDark && { color: colors.white }]}>
                        {group.description || 'No description available.'}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.infoModalSectionLabel, isDark && { color: colors.white }]}>Sizes and prices</Text>
                  {group.variants.map((variant) => (
                    <View key={variant.id} style={styles.infoVariantRow}>
                      <Text style={[styles.infoVariantSize, isDark && { color: colors.white }]}>{variant.sizeLabel}</Text>
                      <Text style={[styles.infoVariantPrice, isDark && { color: colors.white }]}>{money(variant.price)}</Text>
                      <View style={styles.infoVariantStatus}>
                        <View style={[
                          styles.availabilityDot,
                          !variant.isAvailable && styles.availabilityDotOff,
                        ]} />
                        <Text style={[
                          styles.infoVariantAvailability,
                          !variant.isAvailable && styles.unavailableText,
                        ]}>
                          {variant.isAvailable ? 'Available' : 'Unavailable'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
            <View style={[styles.infoModalFooter, isDark && { backgroundColor: '#0F1025' }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close product details"
                onPress={() => setInfoProducts(null)}
                style={({ pressed }) => [styles.infoModalClose, pressed && styles.pressed]}
              >
                <Text style={styles.infoModalCloseText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { display: 'none' },
  screen: { flex: 1, minHeight: 0, backgroundColor: colors.background },
  header: { paddingHorizontal: 17, paddingTop: 10, paddingBottom: 12, backgroundColor: colors.background },
  headerTitleRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: 7 },
  backGlyph: { color: colors.navy, fontFamily: font.regular, fontSize: 33, lineHeight: 37, marginTop: -4 },
  headerTitle: { color: colors.text, fontFamily: font.bold, fontSize: typeScale.title },
  headerSubtitle: { color: colors.secondary, fontFamily: font.regular, fontSize: typeScale.caption, marginTop: -5, textAlign: 'center' },
  posScreen: { flex: 1, minHeight: 0, backgroundColor: colors.white },
  posHeader: { paddingHorizontal: 16, paddingTop: 9, paddingBottom: 7 },
  posHeaderTitle: { color: colors.white, fontFamily: font.bold, fontSize: typeScale.heading },
  posHeaderStaff: { color: colors.white, fontFamily: font.medium, fontSize: typeScale.caption, marginTop: 2, opacity: 0.9 },
  productSelectionSection: {
    flex: 1, minHeight: 0, backgroundColor: colors.pink,
    borderTopLeftRadius: 40, borderTopRightRadius: 40, overflow: 'hidden',
  },
  flavorSelector: { flexGrow: 0, flexShrink: 0, maxHeight: 87 },
  flavorSelectorContent: {
    minWidth: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 22, paddingTop: 3, paddingBottom: 9,
  },
  flavorOption: { width: 62, alignItems: 'center' },
  flavorImageFrame: {
    width: 54, height: 54, alignItems: 'center', justifyContent: 'center',
    borderRadius: 27, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.65)',
    backgroundColor: colors.white, overflow: 'hidden',
  },
  flavorImageFrameSelected: { borderWidth: 3, borderColor: colors.white },
  flavorImage: { width: 50, height: 50, borderRadius: 25 },
  flavorLabel: { color: colors.white, fontFamily: font.medium, fontSize: typeScale.caption, marginTop: 4, opacity: 0.85 },
  flavorLabelSelected: { fontFamily: font.bold, opacity: 1 },
  selectedProductBar: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginBottom: 0, paddingHorizontal: 0, paddingVertical: 7,
  },
  selectedProductCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  selectedProductTitle: { color: colors.white, fontFamily: font.bold, fontSize: typeScale.section },
  selectedProductSubtitle: { color: colors.white, fontFamily: font.regular, fontSize: typeScale.caption, marginTop: 2, opacity: 0.9 },
  viewMenuButton: { minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  viewMenuText: { color: colors.white, fontFamily: font.semibold, fontSize: typeScale.caption },
  posProductScroll: { flex: 1, minHeight: 0 },
  posProductList: { gap: 10, paddingHorizontal: 12, paddingTop: 5, paddingBottom: 11 },
  sizeGroup: { gap: 7 },
  sizeGroupHeading: { minHeight: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sizeGroupTitle: { color: colors.white, fontFamily: font.bold, fontSize: typeScale.body, letterSpacing: 0.5 },
  sizeGroupProduct: { flex: 1, color: colors.white, fontFamily: font.medium, fontSize: typeScale.caption, textAlign: 'right', opacity: 0.9 },
  sizeOptionRow: { flexDirection: 'row', gap: 7 },
  sizeOptionCard: {
    flex: 1, minWidth: 0, minHeight: 75, paddingHorizontal: 7, paddingVertical: 6,
    borderRadius: 11, backgroundColor: colors.white,
  },
  sizeOptionCardUnavailable: { backgroundColor: '#F3F3F5', opacity: 0.72 },
  sizeOptionHeader: { minHeight: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sizeOptionLabel: { color: colors.text, fontFamily: font.semibold, fontSize: typeScale.caption },
  sizeInfoButton: {
    width: 17, height: 17, alignItems: 'center', justifyContent: 'center',
    borderRadius: 9, backgroundColor: '#F4F4F7',
  },
  sizeInfoButtonText: { color: colors.secondary, fontFamily: font.bold, fontSize: typeScale.micro },
  sizeOptionAction: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sizeOptionPrice: { color: colors.navy, fontFamily: font.semibold, fontSize: typeScale.title, marginTop: 2 },
  availabilityLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  availabilityDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#38A169' },
  availabilityDotOff: { backgroundColor: colors.secondary },
  availabilityLabel: { color: '#2F8C57', fontFamily: font.medium, fontSize: typeScale.micro },
  unavailableText: { color: colors.secondary },
  addonSection: { gap: 6, paddingTop: 2 },
  addonSectionTitle: { color: colors.white, fontFamily: font.bold, fontSize: typeScale.body },
  addonPills: {
    width: '100%', flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', gap: 7,
  },
  addonPill: {
    minHeight: 29, maxWidth: '100%', justifyContent: 'center', paddingHorizontal: 10,
    borderRadius: 16, backgroundColor: colors.white,
  },
  addonPillSelected: { backgroundColor: colors.navy },
  addonPillText: { flexShrink: 1, color: colors.text, fontFamily: font.medium, fontSize: typeScale.caption, textAlign: 'center' },
  addonPillTextSelected: { color: colors.white, fontFamily: font.semibold },
  addonUnavailableText: { color: colors.white, fontFamily: font.regular, fontSize: typeScale.caption, lineHeight: 16, opacity: 0.9 },
  currentOrderPanel: {
    flexShrink: 0, maxHeight: '44%', paddingHorizontal: 19, paddingTop: 14, paddingBottom: 8,
    borderWidth: 1, borderColor: '#EEE9EC',
    borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.white,
  },
  currentOrderHeader: {
    minHeight: 35, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6,
  },
  currentOrderHeadingCopy: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  currentOrderTitle: { color: '#171729', fontFamily: font.bold, fontSize: typeScale.section },
  currentOrderCount: { color: colors.secondary, fontFamily: font.medium, fontSize: typeScale.caption },
  clearOrderButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 7 },
  clearOrderText: { color: colors.pink, fontFamily: font.semibold, fontSize: typeScale.caption },
  clearOrderDisabled: { color: '#B8B8C0' },
  currentOrderItems: { flexGrow: 0, maxHeight: 120 },
  currentOrderItemsContent: { gap: 4, paddingVertical: 0 },
  currentOrderLine: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 5,
  },
  currentOrderCopy: { flex: 1, minWidth: 0 },
  currentOrderName: { color: '#171729', fontFamily: font.semibold, fontSize: typeScale.body },
  currentOrderUnit: { color: colors.secondary, fontFamily: font.regular, fontSize: typeScale.caption, marginTop: 2 },
  currentOrderLineTotal: { width: 52, color: '#171729', fontFamily: font.bold, fontSize: typeScale.body, textAlign: 'right' },
  currentOrderQuantity: { height: 44, flexDirection: 'row', alignItems: 'center', borderRadius: 14, backgroundColor: '#F3F3F6' },
  currentOrderQuantityButton: { width: 24, height: 44, alignItems: 'center', justifyContent: 'center' },
  currentOrderQuantityText: { color: colors.pink, fontFamily: font.semibold, fontSize: 14 },
  currentOrderQuantityValue: { minWidth: 16, color: colors.text, fontFamily: font.semibold, fontSize: typeScale.caption, textAlign: 'center' },
  currentOrderRemove: { width: REMOVE_BUTTON_SIZE.width, height: REMOVE_BUTTON_SIZE.height, alignItems: 'center', justifyContent: 'center' },
  currentOrderRemoveText: { color: colors.error, fontFamily: font.medium, fontSize: 18 },
  currentAddonLine: {
    minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 4,
  },
  currentAddonName: { flex: 1, color: colors.text, fontFamily: font.medium, fontSize: typeScale.caption },
  currentAddonPrice: { width: 52, color: colors.navy, fontFamily: font.semibold, fontSize: typeScale.caption, textAlign: 'right' },
  currentOrderEmpty: {
    minHeight: 52, alignItems: 'center', gap: 8,
  },
  currentOrderEmptyTitle: { color: '#171729', fontFamily: font.semibold, fontSize: typeScale.section, textAlign: 'center' },
  currentOrderEmptyMessage: { color: '#92929B', fontFamily: font.regular, fontSize: typeScale.body, textAlign: 'center' },
  currentOrderTotalRow: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: '#EEE9EC', paddingTop: 8,
  },
  currentOrderTotalLabel: { color: '#171729', fontFamily: font.semibold, fontSize: typeScale.section },
  currentOrderTotalValue: { color: '#171729', fontFamily: font.bold, fontSize: typeScale.heading },
  proceedPaymentButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center',
    marginTop: 6, borderRadius: 14, backgroundColor: '#FFE1EB',
  },
  proceedPaymentButtonActive: { backgroundColor: colors.pink },
  proceedPaymentText: { color: '#171729', fontFamily: font.semibold, fontSize: typeScale.section },
  proceedPaymentTextActive: { color: colors.white },
  feedbackBanner: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 11, marginBottom: 6,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.warning,
  },
  feedbackMessagePressable: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, gap: 8 },
  retryInventoryButton: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.pink },
  retryInventoryText: { color: colors.white, fontFamily: font.semibold, fontSize: typeScale.caption },
  feedbackText: { flex: 1, color: colors.navy, fontFamily: font.medium, fontSize: typeScale.caption },
  feedbackDismiss: { color: colors.navy, fontFamily: font.bold, fontSize: 16, paddingLeft: 8 },
  stateCard: {
    alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 22,
    borderRadius: 15, backgroundColor: colors.white,
  },
  retryButton: {
    minHeight: 34, justifyContent: 'center', paddingHorizontal: 18,
    borderRadius: 12, backgroundColor: colors.pink, marginTop: 7,
  },
  retryText: { color: colors.white, fontFamily: font.semibold, fontSize: typeScale.caption },
  retryCheckoutButton: {
    minHeight: 38, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.pink, marginTop: 8,
  },
  retryCheckoutText: { color: colors.white, fontFamily: font.semibold, fontSize: typeScale.caption },
  pressed: { opacity: 0.8 },
  productArtwork: {
    width: 56, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', borderRadius: 10, backgroundColor: '#F7F7FA',
  },
  singleProductImage: { width: 50, height: 50 },
  comboProductImage: { width: 25, height: 46 },
  infoModalTitleCopy: { flex: 1, minWidth: 0 },
  infoModalBackdrop: { flex: 1, backgroundColor: 'rgba(16,16,39,0.45)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  infoModalCard: { width: '100%', maxWidth: 390, maxHeight: '85%', borderRadius: 18, backgroundColor: colors.white, overflow: 'hidden' },
  infoModalTopBar: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, backgroundColor: colors.pink },
  infoModalTopBarTitle: { color: colors.white, fontFamily: font.bold, fontSize: typeScale.title },
  infoModalTopBarClose: { width: 42, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#E6E6EB', backgroundColor: '#F5F5F7' },
  infoModalTopBarCloseText: { color: colors.text, fontFamily: font.medium, fontSize: typeScale.heading, lineHeight: 22 },
  infoModalScroll: { flexShrink: 1 },
  infoModalContent: { gap: 14, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 },
  infoModalGroup: { gap: 5 },
  infoModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoModalTitle: { color: colors.text, fontFamily: font.bold, fontSize: typeScale.title },
  infoModalSectionLabel: { color: colors.navy, fontFamily: font.semibold, fontSize: typeScale.section, marginTop: 6 },
  infoVariantRow: { minHeight: 35, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  infoVariantSize: { flex: 1, color: colors.text, fontFamily: font.medium, fontSize: typeScale.body },
  infoVariantPrice: { color: colors.navy, fontFamily: font.semibold, fontSize: typeScale.body, marginRight: 9 },
  infoVariantStatus: { width: 75, flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoVariantAvailability: { color: '#2F8C57', fontFamily: font.medium, fontSize: typeScale.caption },
  infoModalDescription: { color: colors.secondary, fontFamily: font.regular, fontSize: typeScale.body, lineHeight: 20, marginTop: 3 },
  infoModalFooter: { minHeight: 64, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: '#F5F5F7' },
  infoModalClose: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.pink },
  infoModalCloseText: { color: colors.white, fontFamily: font.semibold, fontSize: typeScale.body },
  progress: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center',
    paddingHorizontal: 30, paddingTop: 8, paddingBottom: 17, backgroundColor: colors.background,
  },
  progressStep: { alignItems: 'center', minWidth: 38 },
  progressCircle: {
    width: 27, height: 27, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#C9C9D0', borderRadius: 14, backgroundColor: colors.white,
  },
  progressCircleActive: { borderColor: colors.navy, backgroundColor: colors.navy },
  progressCircleCurrent: { borderColor: colors.pink, backgroundColor: colors.pink },
  progressNumber: { color: colors.secondary, fontFamily: font.semibold, fontSize: typeScale.caption },
  progressNumberActive: { color: colors.white },
  progressNumberCurrent: { color: colors.white },
  progressLabel: { color: colors.secondary, fontFamily: font.regular, fontSize: typeScale.caption, marginTop: 4 },
  progressLabelActive: { color: colors.navy, fontFamily: font.semibold },
  progressLabelCurrent: { color: colors.pink, fontFamily: font.semibold },
  progressLine: { flex: 1, height: 2, backgroundColor: '#D8D8DE', marginTop: 13 },
  progressLineActive: { backgroundColor: colors.navy },
  cartScroll: { flex: 1, minHeight: 0 },
  cartList: { gap: 9, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 18 },
  sectionHeading: { color: colors.navy, fontFamily: font.semibold, fontSize: typeScale.section, marginBottom: 1 },
  itemCount: { color: colors.secondary, fontFamily: font.regular, fontSize: typeScale.caption },
  cartItem: {
    minHeight: 104, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    paddingVertical: 11, borderRadius: 15, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
  },
  cartItemCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  cartItemName: { color: colors.text, fontFamily: font.semibold, fontSize: typeScale.body },
  cartItemDetail: { color: colors.secondary, fontFamily: font.regular, fontSize: typeScale.caption, marginTop: 4 },
  cartItemPrice: { color: colors.navy, fontFamily: font.medium, fontSize: typeScale.caption, marginTop: 5 },
  cartItemActions: { minWidth: 91, alignItems: 'flex-end' },
  cartLineTotal: { color: colors.navy, fontFamily: font.bold, fontSize: typeScale.body, marginBottom: 5 },
  quantityControl: {
    minHeight: 28, flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, backgroundColor: colors.background,
  },
  quantityButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  quantityButtonText: { color: colors.pink, fontFamily: font.semibold, fontSize: 16 },
  quantityValue: { minWidth: 20, color: colors.text, fontFamily: font.semibold, fontSize: typeScale.caption, textAlign: 'center' },
  removeItem: { color: colors.error, fontFamily: font.medium, fontSize: typeScale.caption, marginTop: 4 },
  emptyCard: {
    alignItems: 'center', paddingHorizontal: 16, paddingVertical: 22,
    borderRadius: 15, backgroundColor: colors.white,
  },
  emptyTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: typeScale.body },
  emptyCopy: { color: colors.secondary, fontFamily: font.regular, fontSize: typeScale.caption, textAlign: 'center', marginTop: 4 },
  addMoreButton: {
    minHeight: 42, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.pink, borderRadius: 13, backgroundColor: colors.white,
  },
  addMoreText: { color: colors.pink, fontFamily: font.semibold, fontSize: typeScale.caption },
  cancelCartButton: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  cancelCartText: { color: colors.error, fontFamily: font.medium, fontSize: typeScale.caption },
  previewNotice: { color: colors.secondary, fontFamily: font.regular, fontSize: typeScale.caption, textAlign: 'center' },
  cartTotalFooter: {
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18,
    borderTopLeftRadius: 12, borderTopRightRadius: 12,
    borderWidth: 1, borderColor: '#F0E6EA', backgroundColor: colors.white,
  },
  cartTotalRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cartTotalLabel: { color: colors.text, fontFamily: font.semibold, fontSize: typeScale.section },
  cartTotalValue: { color: colors.pink, fontFamily: font.bold, fontSize: typeScale.heading },
  cartProceedButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, backgroundColor: colors.pink,
  },
  cartProceedText: { color: colors.white, fontFamily: font.semibold, fontSize: typeScale.section },
  disabledButton: { opacity: 0.65 },
  checkoutContent: {
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20,
  },
  checkoutScroll: { flex: 1, minHeight: 0 },
  paymentSummaryCard: {
    borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
  },
  paymentSummaryTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: typeScale.section, marginBottom: 9 },
  paymentSummaryLine: {
    minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: '#F0F0F3',
  },
  paymentSummaryCopy: { flex: 1, minWidth: 0, paddingRight: 10 },
  paymentSummaryName: { color: colors.text, fontFamily: font.semibold, fontSize: typeScale.body },
  paymentSummaryMeta: { color: colors.secondary, fontFamily: font.regular, fontSize: typeScale.caption, marginTop: 2 },
  paymentSummaryLineTotal: { color: colors.navy, fontFamily: font.bold, fontSize: typeScale.body },
  paymentSummaryTotalRow: {
    minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  paymentSummaryTotalLabel: { color: colors.secondary, fontFamily: font.semibold, fontSize: typeScale.body },
  paymentSummaryTotalValue: { color: colors.navy, fontFamily: font.bold, fontSize: typeScale.heading },
  paymentSelect: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  paymentSelectText: { color: colors.text, fontFamily: font.medium, fontSize: typeScale.body },
  paymentSelectChevron: { color: colors.text, fontFamily: font.medium, fontSize: typeScale.section },
  paymentMenu: {
    marginTop: 7, borderRadius: 13, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white, padding: 5, gap: 5,
  },
  paymentMenuOption: {
    minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10,
  },
  paymentMenuOptionSelected: { backgroundColor: '#FFE5ED' },
  paymentMenuOptionText: { color: colors.text, fontFamily: font.medium, fontSize: typeScale.body },
  paymentMenuOptionTextSelected: { color: colors.pink, fontFamily: font.semibold },
  cashSection: { marginTop: 1 },
  paymentFooter: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background,
  },
  reviewOrderButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, backgroundColor: colors.pink,
  },
  reviewOrderText: { color: colors.white, fontFamily: font.semibold, fontSize: typeScale.section },
  checkoutLineTotal: { color: colors.navy, fontFamily: font.bold, fontSize: typeScale.body },
  addonOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, marginBottom: 6,
  },
  addonOptionText: { color: colors.text, fontFamily: font.medium, fontSize: typeScale.body },
  addonOptionPrice: { color: colors.navy, fontFamily: font.semibold, fontSize: typeScale.body },
  checkoutTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 12,
  },
  paymentLabel: { color: colors.navy, fontFamily: font.semibold, fontSize: typeScale.body, marginTop: 16, marginBottom: 9 },
  paymentInput: {
    height: 42, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.white, color: colors.text,
    fontFamily: font.regular, fontSize: typeScale.body,
  },
  paymentInputError: { borderColor: colors.error },
  paymentError: { color: colors.error, fontFamily: font.medium, fontSize: typeScale.caption, marginTop: 5 },
  changeText: { color: colors.navy, fontFamily: font.semibold, fontSize: typeScale.caption, marginTop: 7 },
  paymentMessage: { color: colors.secondary, fontFamily: font.regular, fontSize: typeScale.caption, lineHeight: 18 },
  checkoutIcon: {
    width: 53, height: 53, alignItems: 'center', justifyContent: 'center',
    borderRadius: 27, backgroundColor: colors.warning, marginBottom: 14,
  },
  checkoutIconText: { color: colors.navy, fontFamily: font.bold, fontSize: 25 },
  checkoutSummary: { color: colors.navy, fontFamily: font.semibold, fontSize: typeScale.body, marginTop: 15 },
  checkoutBackButton: {
    minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 13,
    backgroundColor: colors.pink, marginTop: 17,
  },
  checkoutBackText: { color: colors.white, fontFamily: font.semibold, fontSize: typeScale.body },
});
