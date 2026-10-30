import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { MenuCartLine, MenuCategory, MenuFilter, MenuProduct } from './menuPreviewData';
import { calculateMenuCart, filterMenuProducts, menuCategories, menuPreviewProducts } from './menuPreviewData';

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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${product.type}${product.flavor ? ` ${product.flavor}` : ''}, ${product.pieces}, ${money(product.price)}${selected ? ', added to cart' : ', add to cart'}`}
      accessibilityState={{ selected }}
      disabled={selected}
      onPress={onAdd}
      style={({ pressed }) => [
        styles.productCard,
        selected && styles.productCardSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.productCopy}>
        <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.productType}>{product.type}{product.flavor ? ` - ${product.flavor}` : ''}</Text>
        <Text style={styles.productPieces}>{product.pieces}</Text>
      </View>
      <View style={styles.productPriceColumn}>
        <Text style={styles.productPrice}>{money(product.price)}</Text>
        <Text style={[styles.productAction, selected && styles.productActionSelected]}>
          {selected ? 'Added' : 'Add'}
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
        <Text style={styles.cartItemDetail}>{product.type}{product.flavor ? ` - ${product.flavor}` : ''} · {product.pieces}</Text>
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
}: MenuWorkspaceProps) {
  const [filter, setFilter] = useState<MenuFilter>('All');
  const [category, setCategory] = useState<MenuCategory | 'All'>('All');
  const [search, setSearch] = useState('');
  const totals = calculateMenuCart(cart, menuPreviewProducts);
  const cartProducts = useMemo(() => cart.flatMap((line) => {
    const product = menuPreviewProducts.find((item) => item.id === line.productId);
    return product ? [{ product, quantity: line.quantity }] : [];
  }), [cart]);
  const visibleProducts = filterMenuProducts(menuPreviewProducts, filter, category, search);

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
          <Text style={styles.previewNotice}>Preview cart only · no sale will be recorded</Text>
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
        <View style={styles.checkoutContent}>
          <View style={styles.checkoutIcon}>
            <Text style={styles.checkoutIconText}>!</Text>
          </View>
          <Text style={styles.checkoutTitle}>Order submission unavailable</Text>
          <Text style={styles.checkoutMessage}>
            The sales-order service is not connected. Your order has not been submitted and inventory has not changed.
          </Text>
          <Text style={styles.checkoutSummary}>{totals.count} preview items · {money(totals.total)}</Text>
          <Pressable accessibilityRole="button" onPress={() => onSetPage('cart')} style={styles.checkoutBackButton}>
            <Text style={styles.checkoutBackText}>Return to cart</Text>
          </Pressable>
        </View>
        <View style={styles.totalFooter}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{money(totals.total)}</Text>
          </View>
          <View style={styles.footerActions}>
            <Text style={styles.previewNotice}>No order was placed</Text>
            <View style={[styles.placeOrderButton, styles.disabledButton]}>
              <Text style={styles.placeOrderText}>Unavailable</Text>
            </View>
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
        <ScrollView
          horizontal
          style={styles.categoryScroll}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        >
          {menuCategories.map((item) => {
            const selected = category === item;
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setCategory(selected ? 'All' : item)}
                style={styles.categoryButton}
              >
                <View style={[styles.categoryImageWrap, selected && styles.categoryImageWrapSelected]}>
                  <Image
                    source={require('../../assets/takoyaki-plate.png')}
                    style={styles.categoryImage}
                    resizeMode="cover"
                    accessibilityLabel={`${item} takoyaki`}
                  />
                </View>
                <Text style={[styles.categoryName, selected && styles.categoryNameSelected]} numberOfLines={1}>
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.filterTabs}>
          {(['All', 'Regular', 'Combo'] as const).map((item) => {
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
          {visibleProducts.map((product) => (
            <MenuProductCard
              key={product.id}
              product={product}
              selected={cart.some((line) => line.productId === product.id)}
              onAdd={() => onAddProduct(product.id)}
            />
          ))}
          {visibleProducts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No preview items found</Text>
              <Text style={styles.emptyCopy}>
                {search.trim()
                  ? 'Try another search.'
                  : 'There are no configured sample items for this category and filter.'}
              </Text>
            </View>
          ) : null}
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
  pressed: { opacity: 0.8 },
  productCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  productName: { color: colors.text, fontFamily: font.bold, fontSize: 10 },
  productType: { color: colors.secondary, fontFamily: font.medium, fontSize: 8, marginTop: 2 },
  productPieces: { color: colors.secondary, fontFamily: font.regular, fontSize: 8, marginTop: 1 },
  productPriceColumn: { minWidth: 60, alignItems: 'flex-end' },
  productPrice: { color: colors.navy, fontFamily: font.bold, fontSize: 13 },
  productAction: { color: colors.pink, fontFamily: font.semibold, fontSize: 8, marginTop: 3 },
  productActionSelected: { color: colors.navy },
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
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26,
  },
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
