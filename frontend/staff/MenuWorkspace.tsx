import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { SaleSubmission, StaffMenuAddon, StaffMenuCatalogItem } from '../services/takosync';
import type { MenuCartLine, MenuFilter, MenuProduct } from './menuPreviewData';
import { calculateMenuCart, filterMenuProducts } from './menuPreviewData';

type MenuPage = 'menu' | 'cart' | 'checkout';

type MenuWorkspaceProps = {
  visible: boolean;
  page: MenuPage;
  cart: MenuCartLine[];
  onSetPage: (page: MenuPage | 'dashboard') => void;
  onAddProduct: (productId: string) => void;
  onIncreaseQuantity: (productId: string) => void;
  onDecreaseQuantity: (productId: string) => void;
  onRemoveProduct: (productId: string) => void;
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
  pink: '#F20D52',
  navy: '#111027',
  orange: '#FF941F',
  background: '#F5F5F5',
  white: '#FFFFFF',
  text: '#171717',
  secondary: '#8D8D98',
  border: '#E8E8ED',
  warning: '#FFF2C4',
  error: '#F52F2E',
} as const;

const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

const money = (value: number) => `₱${value.toLocaleString('en-PH')}`;

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

function ScreenHeader({
  title,
  onBack,
  search,
  onSearchChange,
}: {
  title: string;
  onBack: () => void;
  search?: string;
  onSearchChange?: (value: string) => void;
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
      {onSearchChange ? (
        <View style={styles.search}>
          <Text style={styles.searchGlyph}>⌕</Text>
          <TextInput
            accessibilityLabel="Search menu"
            value={search}
            onChangeText={onSearchChange}
            placeholder="Search menu"
            placeholderTextColor={colors.secondary}
            style={styles.searchInput}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {search ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear menu search"
              onPress={() => onSearchChange('')}
            >
              <Text style={styles.clearSearch}>×</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function MenuProductCard({
  product,
  selected,
  onAdd,
}: {
  product: MenuProduct;
  selected: boolean;
  onAdd: () => void;
}) {
  const available = product.isAvailable;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${money(product.price)}, ${available ? 'available' : 'unavailable'}${selected ? ', added to cart' : ', add to cart'}`}
      accessibilityState={{ selected }}
      disabled={selected || !available}
      onPress={onAdd}
      style={({ pressed }) => [
        styles.productCard,
        selected && styles.productCardSelected,
        !available && styles.productCardUnavailable,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.productCopy}>
        <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.productType} numberOfLines={2}>{product.description || 'No description available'}</Text>
      </View>
      <View style={styles.productPriceColumn}>
        <Text style={styles.productPrice}>{money(product.price)}</Text>
        <Text style={[styles.productAction, selected && styles.productActionSelected, !available && styles.unavailableText]}>
          {!available ? 'Unavailable' : selected ? 'Added' : 'Add'}
        </Text>
      </View>
      {selected ? (
        <View style={styles.selectedCheck}>
          <Text style={styles.selectedCheckText}>✓</Text>
        </View>
      ) : null}
    </Pressable>
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
  return (
    <View style={styles.cartItem}>
      <View style={styles.cartItemCopy}>
        <Text style={styles.cartItemName} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.cartItemDetail} numberOfLines={2}>{product.description || 'No description available'}</Text>
        <Text style={styles.cartItemPrice}>{money(product.price)} each</Text>
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
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${product.name}`} onPress={onRemove}>
          <Text style={styles.removeItem}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function MenuWorkspace({
  visible,
  page,
  cart,
  onSetPage,
  onAddProduct,
  onIncreaseQuantity,
  onDecreaseQuantity,
  onRemoveProduct,
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
  const [filter, setFilter] = useState<MenuFilter>('All');
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card'>('Cash');
  const [cashReceived, setCashReceived] = useState('');
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [saleSubmitting, setSaleSubmitting] = useState(false);
  const [saleError, setSaleError] = useState('');
  const products: MenuProduct[] = useMemo(
    () => catalog.map((product) => ({
      id: product.id,
      name: `${product.name} - ${product.sizeLabel}`,
      description: `${product.category} · ${product.description}`,
      price: product.price,
      isAvailable: product.isAvailable,
    })),
    [catalog],
  );

  useEffect(() => {
    if (catalogLoading || catalogError) return;
    const availableIds = new Set(products.filter((product) => product.isAvailable).map((product) => product.id));
    for (const line of cart) {
      if (!availableIds.has(line.productId)) onRemoveProduct(line.productId);
    }
  }, [catalogLoading, catalogError, products]);

  const totals = calculateMenuCart(cart, products);
  const selectedAddons = addons.filter((addon) => selectedAddonIds.includes(addon.id) && addon.isAvailable);
  const addonsTotal = selectedAddons.reduce((total, addon) => total + addon.price, 0);
  const checkoutTotal = totals.total + addonsTotal;
  const cartProducts = useMemo(() => cart.flatMap((line) => {
    const product = products.find((item) => item.id === line.productId);
    return product ? [{ product, quantity: line.quantity }] : [];
  }), [cart, products]);
  const visibleProducts = filterMenuProducts(products, filter, search);
  const parsedCash = Number(cashReceived);
  const cashValid = paymentMethod !== 'Cash' || (cashReceived.trim() !== '' && Number.isFinite(parsedCash) && parsedCash >= checkoutTotal);
  const checkoutValid = cartProducts.length > 0 && cartProducts.every(({ product, quantity }) => product.isAvailable && Number.isInteger(quantity) && quantity > 0) && cashValid;
  const submitCheckout = async () => {
    if (!checkoutValid || saleSubmitting) return;
    setSaleSubmitting(true);
    setSaleError('');
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
    } finally {
      setSaleSubmitting(false);
    }
  };

  if (!visible) return <View style={styles.hidden} />;

  if (page === 'cart') {
    return (
      <View style={styles.screen}>
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
            <View style={styles.emptyCard}>
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
              disabled={cart.length === 0}
              onPress={() => onSetPage('checkout')}
              style={[styles.placeOrderButton, cart.length === 0 && styles.disabledButton]}
            >
              <Text style={styles.placeOrderText}>Place order</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (page === 'checkout') {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Order" onBack={() => onSetPage('cart')} />
        <ProgressSteps active={3} />
        <ScrollView style={styles.checkoutScroll} contentContainerStyle={styles.checkoutContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.checkoutTitle}>Review transaction</Text>
          {cartProducts.map(({ product, quantity }) => (
            <View key={product.id} style={styles.checkoutLine}>
              <View style={styles.checkoutLineCopy}>
                <Text style={styles.checkoutLineName}>{product.name}</Text>
                <Text style={styles.checkoutLineMeta}>{quantity} × {money(product.price)}</Text>
              </View>
              <Text style={styles.checkoutLineTotal}>{money(product.price * quantity)}</Text>
            </View>
          ))}
          <View style={styles.checkoutTotalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{money(checkoutTotal)}</Text>
          </View>
          <Text style={styles.paymentLabel}>Add-ons (provisional menu selection)</Text>
          {addons.length === 0 ? (
            <Text style={styles.paymentMessage}>No add-ons are currently available.</Text>
          ) : addons.map((addon) => {
            const selected = selectedAddonIds.includes(addon.id);
            return (
              <Pressable
                key={addon.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => setSelectedAddonIds((current) => selected
                  ? current.filter((id) => id !== addon.id)
                  : [...current, addon.id])}
                style={styles.addonOption}
              >
                <Text style={styles.addonOptionText}>{selected ? '✓ ' : ''}{addon.name}</Text>
                <Text style={styles.addonOptionPrice}>{money(addon.price)}</Text>
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
            Cash and Card are recorded with the sale after the atomic backend transaction succeeds.
          </Text>
          <View style={styles.paymentOptions}>
            {(['Cash', 'Card'] as const).map((method) => (
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
            <Text style={styles.paymentMessage}>Card payment confirmation requires the approved sales service.</Text>
          )}
          {!checkoutValid && cartProducts.length > 0 ? (
            <Text style={styles.paymentError}>Complete the required payment information before confirming.</Text>
          ) : null}
          {saleError !== '' ? <Text style={styles.paymentError}>{saleError}</Text> : null}
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
        </ScrollView>
        <View style={styles.totalFooter}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{money(totals.total)}</Text>
          </View>
          <View style={styles.footerActions}>
            <Text style={styles.previewNotice}>No order was placed</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Menu"
        onBack={() => onSetPage('dashboard')}
        search={search}
        onSearchChange={setSearch}
      />
      <View style={styles.menuPanel}>
        {feedbackMessage !== '' ? (
          <View style={styles.feedbackBanner} accessibilityRole="alert">
            <Pressable onPress={onDismissFeedback} style={styles.feedbackMessagePressable}>
              <Text style={styles.feedbackText}>{feedbackMessage}</Text>
              <Text style={styles.feedbackDismiss}>×</Text>
            </Pressable>
            {onRetryInventory ? (
              <Pressable onPress={onRetryInventory} style={styles.retryInventoryButton} accessibilityRole="button">
                <Text style={styles.retryInventoryText}>Retry inventory</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <ScrollView
          horizontal
          style={styles.categoryScroll}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        >
          <Text style={styles.catalogLabel}>Live product catalog</Text>
        </ScrollView>
        <View style={styles.filterTabs}>
          {(['All', 'Available', 'Unavailable'] as const).map((item) => {
            const selected = filter === item;
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setFilter(item)}
                style={[styles.filterTab, selected && styles.filterTabSelected]}
              >
                <Text style={[styles.filterTabText, selected && styles.filterTabTextSelected]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>
        <ScrollView
          style={styles.productScroll}
          contentContainerStyle={styles.productList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.productSectionTitle}>{filter}</Text>
          {catalogLoading ? (
            <View style={styles.stateCard}><ActivityIndicator color={colors.pink} /><Text style={styles.emptyCopy}>Loading menu…</Text></View>
          ) : catalogError ? (
            <View style={styles.stateCard}><Text style={styles.emptyTitle}>Unable to load menu</Text><Text style={styles.emptyCopy}>{catalogError}</Text><Pressable onPress={onRetryCatalog} style={styles.retryButton}><Text style={styles.retryText}>Retry</Text></Pressable></View>
          ) : visibleProducts.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.emptyTitle}>{products.length === 0 ? 'No products available' : 'No matching products'}</Text><Text style={styles.emptyCopy}>{products.length === 0 ? 'The branch product catalog is empty.' : 'Try another search or filter.'}</Text></View>
          ) : null}
          {visibleProducts.map((product) => (
            <MenuProductCard
              key={product.id}
              product={product}
              selected={cart.some((line) => line.productId === product.id)}
              onAdd={() => product.isAvailable && onAddProduct(product.id)}
            />
          ))}
        </ScrollView>
        <View style={styles.cartSummaryOuter}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View cart, ${totals.count} items, ${money(totals.total)}`}
            onPress={() => onSetPage('cart')}
            style={({ pressed }) => [styles.cartSummaryButton, pressed && styles.pressed]}
          >
            <View style={styles.cartCount}>
              <Text style={styles.cartCountText}>{totals.count}</Text>
            </View>
            <View style={styles.cartSummaryCopy}>
              <Text style={styles.cartSummaryTitle}>View your cart</Text>
              <Text style={styles.cartSummarySubtitle}>Gelo's Takoyaki · preview</Text>
            </View>
            <Text style={styles.cartSummaryTotal}>{money(totals.total)}</Text>
          </Pressable>
        </View>
      </View>
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
  search: {
    height: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    borderRadius: 22, backgroundColor: colors.white,
  },
  catalogLabel: { color: colors.white, fontFamily: font.semibold, fontSize: 9, marginBottom: 2 },
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
  searchGlyph: { color: colors.secondary, fontSize: 23, marginRight: 7 },
  searchInput: { flex: 1, height: 42, color: colors.text, fontFamily: font.regular, fontSize: 10 },
  clearSearch: { color: colors.secondary, fontFamily: font.medium, fontSize: 21, paddingHorizontal: 3 },
  menuPanel: {
    flex: 1, minHeight: 0, marginHorizontal: 10, marginBottom: 4, overflow: 'hidden',
    paddingTop: 8, borderTopLeftRadius: 25, borderTopRightRadius: 25,
    backgroundColor: colors.pink,
  },
  categoryScroll: { height: 75, flexGrow: 0, flexShrink: 0 },
  categoryList: { gap: 14, paddingHorizontal: 13, alignItems: 'center' },
  categoryButton: { width: 66, alignItems: 'center' },
  categoryImageWrap: {
    width: 54, height: 54, overflow: 'hidden', borderRadius: 28,
    borderWidth: 2, borderColor: colors.white, backgroundColor: colors.white,
  },
  categoryImageWrapSelected: { borderWidth: 3, borderColor: colors.navy },
  categoryImage: { width: '100%', height: '100%' },
  categoryName: { maxWidth: 66, color: colors.white, fontFamily: font.medium, fontSize: 8, marginTop: 4 },
  categoryNameSelected: { fontFamily: font.bold },
  filterTabs: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    paddingHorizontal: 13, paddingTop: 1, paddingBottom: 7,
  },
  filterTab: {
    minWidth: 65, minHeight: 29, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, borderWidth: 1, borderColor: colors.white, borderRadius: 16,
  },
  filterTabSelected: { borderColor: colors.navy, backgroundColor: colors.navy },
  filterTabText: { color: colors.white, fontFamily: font.medium, fontSize: 8 },
  filterTabTextSelected: { color: colors.white, fontFamily: font.semibold },
  productScroll: { flex: 1, minHeight: 0 },
  productList: { gap: 8, paddingHorizontal: 11, paddingTop: 0, paddingBottom: 8 },
  productSectionTitle: {
    color: colors.white, fontFamily: font.semibold, fontSize: 12, marginBottom: 0,
  },
  productCard: {
    minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 9,
    borderWidth: 1.5, borderColor: 'transparent', borderRadius: 14, backgroundColor: colors.white,
  },
  productCardSelected: { borderColor: colors.navy, borderWidth: 2 },
  productCardUnavailable: { opacity: 0.58, borderColor: colors.border },
  pressed: { opacity: 0.8 },
  productCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  productName: { color: colors.text, fontFamily: font.bold, fontSize: 10 },
  productType: { color: colors.secondary, fontFamily: font.medium, fontSize: 8, marginTop: 2 },
  productPieces: { color: colors.secondary, fontFamily: font.regular, fontSize: 8, marginTop: 1 },
  productPriceColumn: { minWidth: 60, alignItems: 'flex-end' },
  productPrice: { color: colors.navy, fontFamily: font.bold, fontSize: 13 },
  productAction: { color: colors.pink, fontFamily: font.semibold, fontSize: 8, marginTop: 3 },
  productActionSelected: { color: colors.navy },
  unavailableText: { color: colors.secondary },
  selectedCheck: {
    position: 'absolute', top: -7, right: -5, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.navy,
  },
  selectedCheckText: { color: colors.white, fontFamily: font.bold, fontSize: 11 },
  cartSummaryOuter: { paddingHorizontal: 8, paddingTop: 7, paddingBottom: 8, backgroundColor: colors.white },
  cartSummaryButton: {
    minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
    paddingVertical: 7, borderRadius: 15, backgroundColor: colors.pink,
  },
  cartCount: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, backgroundColor: colors.white,
  },
  cartCountText: { color: colors.pink, fontFamily: font.bold, fontSize: 12 },
  cartSummaryCopy: { flex: 1, minWidth: 0, marginLeft: 9 },
  cartSummaryTitle: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
  cartSummarySubtitle: { color: colors.white, fontFamily: font.regular, fontSize: 7, marginTop: 2 },
  cartSummaryTotal: { color: colors.white, fontFamily: font.bold, fontSize: 12 },
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
