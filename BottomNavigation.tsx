import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const colors = {
  pink: '#F20D55',
  navy: '#101027',
  orange: '#FF9418',
  blue: '#159BFF',
  white: '#FFFFFF',
} as const;

export type StaffRoute =
  | 'dashboard'
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
  | 'stockInSuccess'
  | 'stockHistory'
  | 'ingredientDetails'
  | 'inventoryHistory'
  | 'notifications'
  | 'more';

export type StaffTab = Extract<StaffRoute, 'dashboard' | 'inventory' | 'stocks' | 'notifications' | 'more'>;

const destinations: { route: StaffTab; label: string; icon: 'home' | 'box' | 'stock' | 'bell' | 'more' }[] = [
  { route: 'dashboard', label: 'Dashboard', icon: 'home' },
  { route: 'inventory', label: 'Inventory', icon: 'box' },
  { route: 'stocks', label: 'Stocks', icon: 'stock' },
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
    route === 'stockInSuccess' ||
    route === 'stockHistory'
  ) return 'stocks';
  if (route === 'ingredientDetails' || route === 'inventoryHistory') return 'inventory';
  return route;
}

export default function BottomNavigation({
  active,
  onSelect,
}: {
  active: StaffRoute;
  onSelect: (route: StaffTab) => void;
}) {
  const selectedTab = activeStaffTab(active);

  return (
    <View style={styles.outer}>
      <View style={styles.bar}>
        {destinations.map((destination) => {
          const selected = destination.route === selectedTab;
          const iconColor = selected ? colors.white : colors.orange;
          return (
            <Pressable
              key={destination.route}
              accessibilityRole="button"
              accessibilityLabel={destination.label}
              accessibilityState={{ selected }}
              onPress={() => onSelect(destination.route)}
              style={({ pressed }) => [
                styles.item,
                selected && styles.itemSelected,
                pressed && styles.pressed,
              ]}
            >
              <NavigationIcon name={destination.icon} color={iconColor} />
              {selected ? <Text style={styles.activeLabel} numberOfLines={1}>{destination.label}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    paddingHorizontal: 13,
    paddingTop: 4,
    paddingBottom: 9,
    backgroundColor: '#FFFFFF',
  },
  bar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    paddingVertical: 5,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: colors.blue,
    backgroundColor: colors.navy,
    elevation: 8,
    shadowColor: colors.navy,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  item: {
    flex: 1,
    minWidth: 34,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 23,
  },
  itemSelected: {
    flex: 0,
    minWidth: 82,
    paddingHorizontal: 11,
    backgroundColor: colors.pink,
  },
  activeLabel: {
    flexShrink: 1,
    color: colors.white,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 9,
  },
  pressed: { opacity: 0.76 },
});

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
