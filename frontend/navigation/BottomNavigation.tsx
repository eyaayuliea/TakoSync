import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';

const colors = {
  pink: '#F20D55',
  navy: '#101027',
  orange: '#FF9418',
  white: '#FFFFFF',
} as const;

export type StaffRoute =
  | 'dashboard'
  | 'sales'
  | 'inventory'
  | 'stocks'
  | 'stockIn'
  | 'stockOut'
  | 'usagePreview'
  | 'stockOutSuccess'
  | 'fastLog'
  | 'fastLogReview'
  | 'fastLogPreview'
  | 'fastLogSuccess'
  | 'waste'
  | 'wasteSuccess'
  | 'stockInSuccess'
  | 'stockHistory'
  | 'historyFilters'
  | 'transactionDetails'
  | 'ingredientDetails'
  | 'inventoryHistory'
  | 'notificationAlertDetails'
  | 'dailyInventoryCheck'
  | 'dailyCheckSuccess'
  | 'profileSettings'
  | 'notifications'
  | 'more';

export type StaffTab = Extract<StaffRoute, 'dashboard' | 'sales' | 'inventory' | 'stocks' | 'notifications' | 'more'>;

const destinations: { route: StaffTab; label: string; icon: 'home' | 'pos' | 'box' | 'stock' | 'bell' | 'more' }[] = [
  { route: 'dashboard', label: 'Dashboard', icon: 'home' },
  { route: 'sales', label: 'POS / Sales', icon: 'pos' },
  { route: 'inventory', label: 'Inventory', icon: 'box' },
  { route: 'stocks', label: 'Stock movement', icon: 'stock' },
  { route: 'notifications', label: 'Notifications', icon: 'bell' },
  { route: 'more', label: 'More', icon: 'more' },
];

function NavigationIcon({ name, color }: { name: (typeof destinations)[number]['icon']; color: string }) {
  if (name === 'home') {
    return (
      <View style={iconStyles.home}>
        <View style={[iconStyles.homeRoofLeft, { borderColor: color }]} />
        <View style={[iconStyles.homeRoofRight, { borderColor: color }]} />
        <View style={[iconStyles.homeBody, { borderColor: color }]}>
          <View style={[iconStyles.homeDoor, { backgroundColor: color }]} />
        </View>
      </View>
    );
  }

  if (name === 'pos') {
    return (
      <View style={[iconStyles.pos, { borderColor: color }]}>
        <View style={[iconStyles.posLine, { backgroundColor: color }]} />
        <View style={[iconStyles.posLine, { backgroundColor: color }]} />
        <View style={[iconStyles.posLineShort, { backgroundColor: color }]} />
      </View>
    );
  }

  if (name === 'box') {
    return (
      <View style={iconStyles.box}>
        <View style={[iconStyles.boxTopLeft, { borderColor: color }]} />
        <View style={[iconStyles.boxTopRight, { borderColor: color }]} />
        <View style={[iconStyles.boxBody, { borderColor: color }]} />
        <View style={[iconStyles.boxSeam, { backgroundColor: color }]} />
      </View>
    );
  }

  if (name === 'stock') {
    return (
      <View style={iconStyles.stock}>
        <View style={[iconStyles.stockStem, { backgroundColor: color }]} />
        <View style={[iconStyles.stockArrowLeft, { borderColor: color }]} />
        <View style={[iconStyles.stockArrowRight, { borderColor: color }]} />
        <View style={[iconStyles.stockTray, { borderColor: color }]} />
      </View>
    );
  }

  if (name === 'bell') {
    return (
      <View style={iconStyles.bell}>
        <View style={[iconStyles.bellBody, { borderColor: color }]} />
        <View style={[iconStyles.bellBase, { backgroundColor: color }]} />
        <View style={[iconStyles.bellClapper, { backgroundColor: color }]} />
      </View>
    );
  }

  return (
    <View style={iconStyles.more}>
      <View style={[iconStyles.dot, { backgroundColor: color }]} />
      <View style={[iconStyles.dot, { backgroundColor: color }]} />
      <View style={[iconStyles.dot, { backgroundColor: color }]} />
    </View>
  );
}

export function activeStaffTab(route: StaffRoute): StaffTab {
  if (
    route === 'stockIn' ||
    route === 'stockOut' ||
    route === 'usagePreview' ||
    route === 'stockOutSuccess' ||
    route === 'fastLog' ||
    route === 'fastLogReview' ||
    route === 'fastLogPreview' ||
    route === 'fastLogSuccess' ||
    route === 'waste' ||
    route === 'wasteSuccess' ||
    route === 'stockInSuccess' ||
    route === 'stockHistory' ||
    route === 'historyFilters' ||
    route === 'transactionDetails'
  ) return 'stocks';
  if (route === 'ingredientDetails' || route === 'inventoryHistory') return 'inventory';
  if (route === 'dailyInventoryCheck' || route === 'dailyCheckSuccess') return 'more';
  if (route === 'profileSettings') return 'more';
  if (route === 'notificationAlertDetails') return 'notifications';
  return route;
}

export default function BottomNavigation({
  active,
  onSelect,
  showSales = true,
}: {
  active: StaffRoute;
  onSelect: (route: StaffTab) => void;
  showSales?: boolean;
}) {
  const { colors: themeColors, isDark } = useTheme();
  const styles = useNavigationStyles();
  const selectedTab = activeStaffTab(active);
  const visibleDestinations = showSales
    ? destinations
    : destinations.filter((destination) => destination.route !== 'sales');

  return (
    <View style={styles.outer}>
      <View style={styles.bar}>
        {visibleDestinations.map((destination) => {
          const selected = destination.route === selectedTab;
          const iconColor = selected
            ? isDark ? themeColors.text : colors.white
            : themeColors.action;
          return (
            <Pressable
              key={destination.route}
              accessibilityRole="button"
              accessibilityLabel={destination.label}
              accessibilityState={{ selected }}
              onPress={() => onSelect(destination.route)}
              style={({ pressed }) => [
                styles.item,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
                <NavigationIcon name={destination.icon} color={iconColor} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function useNavigationStyles() {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(createThemedStyles({
  outer: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 11,
    backgroundColor: 'transparent',
  },
  bar: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 30,
    backgroundColor: colors.navy,
    elevation: 10,
    shadowColor: colors.navy,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  item: {
    flex: 1,
    minWidth: 0,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
  },
  iconWrapSelected: {
    backgroundColor: colors.pink,
  },
  pressed: { opacity: 0.76 },
  }, theme)), [theme]);
}

const iconStyles = StyleSheet.create({
  home: { width: 20, height: 20, alignItems: 'center', justifyContent: 'flex-end' },
  homeRoofLeft: {
    position: 'absolute', top: 2, left: 3, width: 10, height: 10,
    borderLeftWidth: 2, borderTopWidth: 2, borderTopLeftRadius: 2, transform: [{ rotate: '45deg' }],
  },
  homeRoofRight: {
    position: 'absolute', top: 2, right: 3, width: 10, height: 10,
    borderRightWidth: 2, borderTopWidth: 2, borderTopRightRadius: 2, transform: [{ rotate: '-45deg' }],
  },
  homeBody: { width: 14, height: 11, borderWidth: 1.8, borderBottomWidth: 0, alignItems: 'center', justifyContent: 'flex-end' },
  homeDoor: { width: 4, height: 6, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  pos: { width: 16, height: 20, borderWidth: 1.8, borderRadius: 3, alignItems: 'center', justifyContent: 'center', gap: 2 },
  posLine: { width: 9, height: 1.5, borderRadius: 1 },
  posLineShort: { width: 6, height: 1.5, alignSelf: 'flex-start', marginLeft: 3, borderRadius: 1 },
  box: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  boxTopLeft: { position: 'absolute', top: 3, left: 3, width: 8, height: 8, borderLeftWidth: 1.8, borderTopWidth: 1.8, transform: [{ rotate: '45deg' }] },
  boxTopRight: { position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderRightWidth: 1.8, borderTopWidth: 1.8, transform: [{ rotate: '-45deg' }] },
  boxBody: { width: 15, height: 11, marginTop: 5, borderWidth: 1.8, borderTopWidth: 0, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  boxSeam: { position: 'absolute', top: 7, width: 1.5, height: 10, opacity: 0.9 },
  stock: { width: 20, height: 20, alignItems: 'center' },
  stockStem: { position: 'absolute', top: 1, width: 1.8, height: 10, borderRadius: 1 },
  stockArrowLeft: { position: 'absolute', top: 7, left: 3, width: 7, height: 7, borderLeftWidth: 1.8, borderBottomWidth: 1.8, transform: [{ rotate: '-45deg' }] },
  stockArrowRight: { position: 'absolute', top: 7, right: 3, width: 7, height: 7, borderRightWidth: 1.8, borderBottomWidth: 1.8, transform: [{ rotate: '45deg' }] },
  stockTray: { position: 'absolute', bottom: 1, width: 17, height: 5, borderBottomWidth: 1.8, borderLeftWidth: 1.8, borderRightWidth: 1.8, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  bell: { width: 20, height: 20, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 1 },
  bellBody: { width: 13, height: 13, borderWidth: 1.7, borderTopLeftRadius: 7, borderTopRightRadius: 7, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  bellBase: { width: 17, height: 1.7, borderRadius: 1 },
  bellClapper: { width: 4, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, marginTop: 1 },
  more: { width: 20, height: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 1 },
  dot: { width: 3.5, height: 3.5, borderRadius: 2 },
});
