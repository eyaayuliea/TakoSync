import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
        { number: 3, label: 'Order' },
      ].map((step, index) => {
        const complete = step.number <= active;
        return (
          <React.Fragment key={step.number}>
            {index > 0 ? <View style={[styles.progressLine, step.number <= active && styles.progressLineActive]} /> : null}
            <View style={styles.progressStep}>
              <View style={[styles.progressCircle, complete && styles.progressCircleActive]}>
                <Text style={[styles.progressNumber, complete && styles.progressNumberActive]}>
                  {step.number < active ? '✓' : step.number}
                </Text>
              </View>
              <Text style={[styles.progressLabel, complete && styles.progressLabelActive]}>{step.label}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

function ScreenHeader({ title, onBack }: {
  title: string;
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
        accessibilityState={{ disabled: !variant.isAvailable }}
        disabled={!variant.isAvailable}
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
  const [cashReceived, setCashReceived] = useState('');
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [saleSubmitting, setSaleSubmitting] = useState(false);
  const [saleError, setSaleError] = useState('');
  const [saleRetryAvailable, setSaleRetryAvailable] = useState(false);
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
  const cancelOrder = () => {
    if (saleSubmitting) return;
    setCashReceived('');
    setSelectedAddonIds([]);
    setSaleError('');
    onCancelOrder();
    onSetPage('menu');
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
        <ScreenHeader title="Cart" onBack={() => onSetPage('menu')} />
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
          <Text style={styles.previewNotice}>Cart is saved while you review checkout. No inventory changes occur yet.</Text>
        </ScrollView>
        <View style={styles.totalFooter}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{money(totals.total)}</Text>
          </View>
          <View style={styles.footerActions}>
            <Pressable accessibilityRole="button" onPress={() => onSetPage('menu')} style={styles.footerSecondary}>
              <Text style={styles.footerSecondaryText}>Go back to menu</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (emptyOrderMessage !== '') return;
                onSetPage('checkout');
              }}
              style={[styles.placeOrderButton, emptyOrderMessage !== '' && styles.disabledButton]}
            >
            <Text style={styles.placeOrderText}>Proceed to Payment</Text>
            </Pressable>
          </View>
          {emptyOrderMessage !== '' ? <Text style={styles.paymentError}>{emptyOrderMessage}</Text> : null}
          <Pressable accessibilityRole="button" onPress={cancelOrder} style={styles.checkoutBackButton}>
            <Text style={styles.checkoutBackText}>Cancel order</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (page === 'checkout') {
    return (
      <View style={[styles.screen, isDark && { backgroundColor: themeColors.background }]}>
        <ScreenHeader title="Order" onBack={() => onSetPage('cart')} />
        <ProgressSteps active={3} />
          <ScrollView style={styles.checkoutScroll} contentContainerStyle={styles.checkoutContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.checkoutTitle}>Review transaction</Text>
          {cartProducts.map(({ product, quantity }) => (
            <View key={product.id} style={[styles.checkoutLine, darkSecondarySurface]}>
              <View style={styles.checkoutLineCopy}>
              <Text style={[styles.checkoutLineName, darkSecondaryText]}>{product.name}</Text>
              <Text style={[styles.checkoutLineMeta, darkSecondaryText]}>{quantity} × {money(product.price)}</Text>
              </View>
              <Text style={styles.checkoutLineTotal}>{money(product.price * quantity)}</Text>
            </View>
          ))}
          <View style={styles.checkoutTotalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{money(checkoutTotal)}</Text>
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
          <Text style={styles.paymentLabel}>Payment method</Text>
          <Text style={styles.paymentMessage}>
            The selected payment method is recorded with the sale after the transaction is saved.
          </Text>
          <View style={styles.paymentOptions}>
            {(['Cash', 'QR'] as const).map((method) => (
              <Pressable
                key={method}
                accessibilityRole="button"
                accessibilityState={{ selected: paymentMethod === method }}
                onPress={() => setPaymentMethod(method)}
                style={[styles.paymentOption, paymentMethod === method && styles.paymentOptionSelected]}
              >
                <Text style={[styles.paymentOptionText, paymentMethod === method && styles.paymentOptionTextSelected]}>{method}</Text>
              </Pressable>
            ))}
          </View>
          {paymentMethod === 'Cash' ? (
            <View>
              <Text style={styles.paymentLabel}>Cash received</Text>
              <TextInput
                accessibilityLabel="Cash received"
                value={cashReceived}
                onChangeText={setCashReceived}
                keyboardType="decimal-pad"
                placeholder="Enter amount"
                placeholderTextColor={colors.secondary}
                style={[styles.paymentInput, cashReceived !== '' && !cashValid && styles.paymentInputError]}
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
                  <Text style={styles.retryCheckoutText}>{saleSubmitting ? 'Retrying…' : 'Retry checkout'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <View style={styles.checkoutUnavailableBox}>
            <Text style={styles.checkoutUnavailableTitle}>Sale and inventory status</Text>
            <Text style={styles.checkoutMessage}>
              A recorded sale may need inventory processing or recovery. The receipt keeps the sale details and inventory status separate.
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => onSetPage('cart')} style={styles.checkoutBackButton}>
            <Text style={styles.checkoutBackText}>Return to cart</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Confirm transaction"
            disabled={!checkoutValid || saleSubmitting}
            onPress={() => void submitCheckout()}
            style={[styles.placeOrderButton, (!checkoutValid || saleSubmitting) && styles.disabledButton]}
          >
            <Text style={styles.placeOrderText}>{saleSubmitting ? 'Recording…' : 'Confirm Transaction'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={saleSubmitting} onPress={cancelOrder} style={styles.checkoutBackButton}>
            <Text style={styles.checkoutBackText}>Cancel order</Text>
          </Pressable>
        </ScrollView>
        <View style={styles.totalFooter}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{money(checkoutTotal)}</Text>
          </View>
          <View style={styles.footerActions}>
            <Text style={styles.previewNotice}>No order was placed</Text>
          </View>
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
            <Text style={styles.viewMenuText}>View Menu</Text>
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
                  <Text style={styles.sizeGroupTitle}>{index === 0 ? 'REGULAR' : 'COMBO + CHEESE'}</Text>
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
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.addonPills}
                >
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
                </ScrollView>
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
      <View style={[styles.currentOrderPanel, darkSecondarySurface]}>
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
          <Text style={[styles.currentOrderEmpty, darkSecondaryText]}>Your order is empty. Select a size to begin.</Text>
        )}
        <View style={styles.currentOrderTotalRow}>
          <Text style={[styles.currentOrderTotalLabel, darkSecondaryText]}>Total</Text>
          <Text style={[styles.currentOrderTotalValue, darkSecondaryText]}>{money(checkoutTotal)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Proceed to Payment"
          disabled={cartProducts.length === 0 || catalogLoading || Boolean(catalogError)}
          onPress={() => {
            if (cartProducts.length > 0) onSetPage('checkout');
          }}
          style={({ pressed }) => [
            styles.proceedPaymentButton,
            (cartProducts.length === 0 || catalogLoading || Boolean(catalogError)) && styles.proceedPaymentDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.proceedPaymentText}>Proceed to Payment</Text>
        </Pressable>
      </View>
      <Modal
        visible={infoProducts !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoProducts(null)}
      >
        <View style={styles.infoModalBackdrop}>
          <View style={[styles.infoModalCard, isDark && { backgroundColor: colors.navy }]}>
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
            <Pressable
              accessibilityRole="button"
              onPress={() => setInfoProducts(null)}
              style={[styles.infoModalClose, { backgroundColor: colors.pink }]}
            >
              <Text style={styles.infoModalCloseText}>Close</Text>
            </Pressable>
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
  headerTitle: { color: colors.text, fontFamily: font.bold, fontSize: 21 },
  posScreen: { flex: 1, minHeight: 0, backgroundColor: colors.white },
  posHeader: { paddingHorizontal: 16, paddingTop: 9, paddingBottom: 7 },
  posHeaderTitle: { color: colors.white, fontFamily: font.bold, fontSize: 16 },
  posHeaderStaff: { color: colors.white, fontFamily: font.medium, fontSize: 8, marginTop: 2, opacity: 0.9 },
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
  flavorLabel: { color: colors.white, fontFamily: font.medium, fontSize: 8, marginTop: 4, opacity: 0.85 },
  flavorLabelSelected: { fontFamily: font.bold, opacity: 1 },
  selectedProductBar: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginBottom: 0, paddingHorizontal: 0, paddingVertical: 7,
  },
  selectedProductCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  selectedProductTitle: { color: colors.white, fontFamily: font.bold, fontSize: 11 },
  selectedProductSubtitle: { color: colors.white, fontFamily: font.regular, fontSize: 7, marginTop: 2, opacity: 0.9 },
  viewMenuButton: { minHeight: 28, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  viewMenuText: { color: colors.white, fontFamily: font.semibold, fontSize: 8 },
  posProductScroll: { flex: 1, minHeight: 0 },
  posProductList: { gap: 10, paddingHorizontal: 12, paddingTop: 5, paddingBottom: 11 },
  sizeGroup: { gap: 7 },
  sizeGroupHeading: { minHeight: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sizeGroupTitle: { color: colors.white, fontFamily: font.bold, fontSize: 9, letterSpacing: 0.5 },
  sizeGroupProduct: { flex: 1, color: colors.white, fontFamily: font.medium, fontSize: 7, textAlign: 'right', opacity: 0.9 },
  sizeOptionRow: { flexDirection: 'row', gap: 7 },
  sizeOptionCard: {
    flex: 1, minWidth: 0, minHeight: 75, paddingHorizontal: 7, paddingVertical: 6,
    borderRadius: 11, backgroundColor: colors.white,
  },
  sizeOptionCardUnavailable: { backgroundColor: '#F3F3F5', opacity: 0.72 },
  sizeOptionHeader: { minHeight: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sizeOptionLabel: { color: colors.text, fontFamily: font.semibold, fontSize: 7 },
  sizeInfoButton: {
    width: 17, height: 17, alignItems: 'center', justifyContent: 'center',
    borderRadius: 9, backgroundColor: '#F4F4F7',
  },
  sizeInfoButtonText: { color: colors.secondary, fontFamily: font.bold, fontSize: 9 },
  sizeOptionAction: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sizeOptionPrice: { color: colors.navy, fontFamily: font.bold, fontSize: 12, marginTop: 2 },
  availabilityLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  availabilityDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#38A169' },
  availabilityDotOff: { backgroundColor: colors.secondary },
  availabilityLabel: { color: '#2F8C57', fontFamily: font.medium, fontSize: 6 },
  unavailableText: { color: colors.secondary },
  addonSection: { gap: 6, paddingTop: 2 },
  addonSectionTitle: { color: colors.white, fontFamily: font.bold, fontSize: 10 },
  addonPills: { gap: 7, paddingRight: 10 },
  addonPill: {
    minHeight: 29, justifyContent: 'center', paddingHorizontal: 10,
    borderRadius: 16, backgroundColor: colors.white,
  },
  addonPillSelected: { backgroundColor: colors.navy },
  addonPillText: { color: colors.text, fontFamily: font.medium, fontSize: 7 },
  addonPillTextSelected: { color: colors.white, fontFamily: font.semibold },
  addonUnavailableText: { color: colors.white, fontFamily: font.regular, fontSize: 7, lineHeight: 11, opacity: 0.9 },
  currentOrderPanel: {
    flexShrink: 0, maxHeight: '44%', gap: 5, paddingHorizontal: 13, paddingTop: 9, paddingBottom: 10,
    borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: colors.white,
  },
  currentOrderHeader: { minHeight: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  currentOrderHeadingCopy: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  currentOrderTitle: { color: colors.navy, fontFamily: font.bold, fontSize: 11 },
  currentOrderCount: { color: colors.secondary, fontFamily: font.medium, fontSize: 7 },
  clearOrderButton: { minHeight: 28, justifyContent: 'center', paddingHorizontal: 7 },
  clearOrderText: { color: colors.pink, fontFamily: font.semibold, fontSize: 8 },
  clearOrderDisabled: { color: '#B8B8C0' },
  currentOrderItems: { flexGrow: 0, maxHeight: 120 },
  currentOrderItemsContent: { gap: 3, paddingVertical: 1 },
  currentOrderLine: {
    minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#F0F0F3',
  },
  currentOrderCopy: { flex: 1, minWidth: 0 },
  currentOrderName: { color: colors.text, fontFamily: font.semibold, fontSize: 7 },
  currentOrderUnit: { color: colors.secondary, fontFamily: font.regular, fontSize: 6, marginTop: 1 },
  currentOrderLineTotal: { width: 43, color: colors.navy, fontFamily: font.bold, fontSize: 7, textAlign: 'right' },
  currentOrderQuantity: { height: 23, flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: '#F3F3F6' },
  currentOrderQuantityButton: { width: 21, height: 23, alignItems: 'center', justifyContent: 'center' },
  currentOrderQuantityText: { color: colors.pink, fontFamily: font.semibold, fontSize: 12 },
  currentOrderQuantityValue: { minWidth: 13, color: colors.text, fontFamily: font.semibold, fontSize: 7, textAlign: 'center' },
  currentOrderRemove: { width: REMOVE_BUTTON_SIZE.width, height: REMOVE_BUTTON_SIZE.height, alignItems: 'center', justifyContent: 'center' },
  currentOrderRemoveText: { color: colors.error, fontFamily: font.medium, fontSize: 15 },
  currentAddonLine: {
    minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: '#F0F0F3',
  },
  currentAddonName: { flex: 1, color: colors.text, fontFamily: font.medium, fontSize: 7 },
  currentAddonPrice: { width: 43, color: colors.navy, fontFamily: font.semibold, fontSize: 7, textAlign: 'right' },
  currentOrderEmpty: { color: colors.secondary, fontFamily: font.regular, fontSize: 7, textAlign: 'center', paddingVertical: 7 },
  currentOrderTotalRow: {
    minHeight: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4,
  },
  currentOrderTotalLabel: { color: colors.text, fontFamily: font.semibold, fontSize: 9 },
  currentOrderTotalValue: { color: colors.navy, fontFamily: font.bold, fontSize: 12 },
  proceedPaymentButton: {
    minHeight: 36, alignItems: 'center', justifyContent: 'center',
    borderRadius: 18, backgroundColor: colors.pink,
  },
  proceedPaymentDisabled: { opacity: 0.5 },
  proceedPaymentText: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
  feedbackBanner: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 11, marginBottom: 6,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.warning,
  },
  feedbackMessagePressable: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, gap: 8 },
  retryInventoryButton: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.pink },
  retryInventoryText: { color: colors.white, fontFamily: font.semibold, fontSize: 8 },
  feedbackText: { flex: 1, color: colors.navy, fontFamily: font.medium, fontSize: 8 },
  feedbackDismiss: { color: colors.navy, fontFamily: font.bold, fontSize: 16, paddingLeft: 8 },
  stateCard: {
    alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 22,
    borderRadius: 15, backgroundColor: colors.white,
  },
  retryButton: {
    minHeight: 34, justifyContent: 'center', paddingHorizontal: 18,
    borderRadius: 12, backgroundColor: colors.pink, marginTop: 7,
  },
  retryText: { color: colors.white, fontFamily: font.semibold, fontSize: 8 },
  retryCheckoutButton: {
    minHeight: 38, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.pink, marginTop: 8,
  },
  retryCheckoutText: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
  pressed: { opacity: 0.8 },
  productArtwork: {
    width: 56, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', borderRadius: 10, backgroundColor: '#F7F7FA',
  },
  singleProductImage: { width: 50, height: 50 },
  comboProductImage: { width: 25, height: 46 },
  infoModalTitleCopy: { flex: 1, minWidth: 0 },
  infoModalBackdrop: { flex: 1, backgroundColor: 'rgba(16,16,39,0.45)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  infoModalCard: { width: '100%', maxWidth: 360, maxHeight: '85%', borderRadius: 18, backgroundColor: colors.white, padding: 16 },
  infoModalScroll: { flexShrink: 1 },
  infoModalContent: { gap: 14 },
  infoModalGroup: { gap: 5 },
  infoModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoModalTitle: { color: colors.text, fontFamily: font.bold, fontSize: 18 },
  infoModalSectionLabel: { color: colors.navy, fontFamily: font.semibold, fontSize: 9, marginTop: 6 },
  infoVariantRow: { minHeight: 35, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  infoVariantSize: { flex: 1, color: colors.text, fontFamily: font.medium, fontSize: 8 },
  infoVariantPrice: { color: colors.navy, fontFamily: font.semibold, fontSize: 8, marginRight: 9 },
  infoVariantStatus: { width: 75, flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoVariantAvailability: { color: '#2F8C57', fontFamily: font.medium, fontSize: 7 },
  infoModalDescription: { color: colors.secondary, fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 3 },
  infoModalClose: { minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.navy, marginTop: 10 },
  infoModalCloseText: { color: colors.white, fontFamily: font.semibold, fontSize: 11 },
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
  progressNumber: { color: colors.secondary, fontFamily: font.semibold, fontSize: 9 },
  progressNumberActive: { color: colors.white },
  progressLabel: { color: colors.secondary, fontFamily: font.regular, fontSize: 7, marginTop: 4 },
  progressLabelActive: { color: colors.navy, fontFamily: font.semibold },
  progressLine: { flex: 1, height: 2, backgroundColor: '#D8D8DE', marginTop: 13 },
  progressLineActive: { backgroundColor: colors.navy },
  cartScroll: { flex: 1, minHeight: 0 },
  cartList: { gap: 9, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 18 },
  sectionHeading: { color: colors.navy, fontFamily: font.semibold, fontSize: 14, marginBottom: 1 },
  itemCount: { color: colors.secondary, fontFamily: font.regular, fontSize: 10 },
  cartItem: {
    minHeight: 104, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    paddingVertical: 11, borderRadius: 15, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
  },
  cartItemCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  cartItemName: { color: colors.text, fontFamily: font.semibold, fontSize: 10 },
  cartItemDetail: { color: colors.secondary, fontFamily: font.regular, fontSize: 8, marginTop: 4 },
  cartItemPrice: { color: colors.navy, fontFamily: font.medium, fontSize: 8, marginTop: 5 },
  cartItemActions: { minWidth: 91, alignItems: 'flex-end' },
  cartLineTotal: { color: colors.navy, fontFamily: font.bold, fontSize: 11, marginBottom: 5 },
  quantityControl: {
    minHeight: 28, flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, backgroundColor: colors.background,
  },
  quantityButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  quantityButtonText: { color: colors.pink, fontFamily: font.semibold, fontSize: 16 },
  quantityValue: { minWidth: 20, color: colors.text, fontFamily: font.semibold, fontSize: 9, textAlign: 'center' },
  removeItem: { color: colors.error, fontFamily: font.medium, fontSize: 7, marginTop: 4 },
  emptyCard: {
    alignItems: 'center', paddingHorizontal: 16, paddingVertical: 22,
    borderRadius: 15, backgroundColor: colors.white,
  },
  emptyTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 11 },
  emptyCopy: { color: colors.secondary, fontFamily: font.regular, fontSize: 8, textAlign: 'center', marginTop: 4 },
  addMoreButton: {
    minHeight: 42, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.pink, borderRadius: 13, backgroundColor: colors.white,
  },
  addMoreText: { color: colors.pink, fontFamily: font.semibold, fontSize: 9 },
  previewNotice: { color: colors.secondary, fontFamily: font.regular, fontSize: 7, textAlign: 'center' },
  totalFooter: {
    paddingHorizontal: 16, paddingTop: 11, paddingBottom: 13,
    borderTopLeftRadius: 21, borderTopRightRadius: 21, backgroundColor: colors.pink,
  },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  totalLabel: { color: colors.white, fontFamily: font.medium, fontSize: 10 },
  totalValue: { color: colors.white, fontFamily: font.bold, fontSize: 17 },
  footerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  footerSecondary: { paddingVertical: 8, paddingHorizontal: 3 },
  footerSecondaryText: { color: colors.white, fontFamily: font.medium, fontSize: 8 },
  placeOrderButton: {
    minWidth: 132, minHeight: 40, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, borderRadius: 13, backgroundColor: colors.white,
  },
  disabledButton: { opacity: 0.65 },
  placeOrderText: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
  checkoutContent: {
    paddingHorizontal: 16, paddingBottom: 20,
  },
  checkoutScroll: { flex: 1, minHeight: 0 },
  checkoutLine: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 13,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, marginBottom: 7,
  },
  checkoutLineCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  checkoutLineName: { color: colors.text, fontFamily: font.semibold, fontSize: 10 },
  checkoutLineMeta: { color: colors.secondary, fontFamily: font.regular, fontSize: 8, marginTop: 3 },
  checkoutLineTotal: { color: colors.navy, fontFamily: font.bold, fontSize: 10 },
  addonOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, marginBottom: 6,
  },
  addonOptionText: { color: colors.text, fontFamily: font.medium, fontSize: 9 },
  addonOptionPrice: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
  checkoutTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 12,
  },
  paymentLabel: { color: colors.navy, fontFamily: font.semibold, fontSize: 10, marginTop: 8, marginBottom: 7 },
  paymentOptions: { flexDirection: 'row', gap: 8 },
  paymentOption: {
    minWidth: 84, minHeight: 36, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  paymentOptionSelected: { borderColor: colors.navy, backgroundColor: colors.navy },
  paymentOptionText: { color: colors.secondary, fontFamily: font.medium, fontSize: 9 },
  paymentOptionTextSelected: { color: colors.white, fontFamily: font.semibold },
  paymentInput: {
    height: 42, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.white, color: colors.text,
    fontFamily: font.regular, fontSize: 10,
  },
  paymentInputError: { borderColor: colors.error },
  paymentError: { color: colors.error, fontFamily: font.medium, fontSize: 8, marginTop: 5 },
  changeText: { color: colors.navy, fontFamily: font.semibold, fontSize: 9, marginTop: 7 },
  paymentMessage: { color: colors.secondary, fontFamily: font.regular, fontSize: 8, lineHeight: 13 },
  checkoutUnavailableBox: {
    padding: 12, borderRadius: 13, backgroundColor: colors.warning, marginTop: 16,
  },
  checkoutUnavailableTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
  checkoutIcon: {
    width: 53, height: 53, alignItems: 'center', justifyContent: 'center',
    borderRadius: 27, backgroundColor: colors.warning, marginBottom: 14,
  },
  checkoutIconText: { color: colors.navy, fontFamily: font.bold, fontSize: 25 },
  checkoutTitle: { color: colors.navy, fontFamily: font.bold, fontSize: 15, textAlign: 'center' },
  checkoutMessage: {
    maxWidth: 330, color: colors.secondary, fontFamily: font.regular,
    fontSize: 9, lineHeight: 15, textAlign: 'center', marginTop: 8,
  },
  checkoutSummary: { color: colors.navy, fontFamily: font.semibold, fontSize: 9, marginTop: 15 },
  checkoutBackButton: {
    minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 13,
    backgroundColor: colors.pink, marginTop: 17,
  },
  checkoutBackText: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
});
