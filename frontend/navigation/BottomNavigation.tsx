import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import { ownerColors } from '../owner/shared/ownerTokens';
import {
  activeStaffTab,
  STAFF_NAVIGATION_TOUCH_TARGET,
  staffDestinations,
  type StaffRoute,
  type StaffTab,
} from './staffNavigation';

export type { StaffRoute, StaffTab } from './staffNavigation';
export { activeStaffTab };

const colors = {
  pink: ownerColors.primary,
  staffPink: ownerColors.primary,
  navy: ownerColors.navy,
  orange: ownerColors.orange,
  white: ownerColors.white,
} as const;

export type OwnerTab = 'dashboard' | 'sales' | 'inventory' | 'discrepancies' | 'alerts' | 'more';
export const OWNER_NAVIGATION_HEIGHT = 75;

type Destination = { route: StaffTab | OwnerTab; label: string; icon: 'home' | 'pos' | 'menu' | 'box' | 'stock' | 'bell' | 'more' | 'dashboardGrid' | 'salesChart' | 'sync' };

const staffDestinationList: Destination[] = staffDestinations.map((destination) => ({ ...destination }));
export const ownerDestinations: readonly Destination[] = [
  { route: 'dashboard', label: 'Dashboard', icon: 'dashboardGrid' },
  { route: 'sales', label: 'Sales', icon: 'salesChart' },
  { route: 'inventory', label: 'Inventory', icon: 'box' },
  { route: 'discrepancies', label: 'Discrepancies', icon: 'sync' },
  { route: 'alerts', label: 'Alerts', icon: 'bell' },
  { route: 'more', label: 'More', icon: 'more' },
];

function NavigationIcon({
  name,
  color,
  outlinedBell,
}: {
  name: Destination['icon'];
  color: string;
  outlinedBell: boolean;
}) {
  if (name === 'dashboardGrid') {
    return (
      <View style={iconStyles.dashboardGrid}>
        <View style={[iconStyles.dashboardDot, { backgroundColor: color }]} />
        <View style={[iconStyles.dashboardDot, { backgroundColor: color }]} />
        <View style={[iconStyles.dashboardDot, { backgroundColor: color }]} />
        <View style={[iconStyles.dashboardDot, { backgroundColor: color }]} />
      </View>
    );
  }

  if (name === 'salesChart') {
    return (
      <View style={iconStyles.salesChart}>
        <View style={[iconStyles.salesBarSmall, { backgroundColor: color }]} />
        <View style={[iconStyles.salesBarMedium, { backgroundColor: color }]} />
        <View style={[iconStyles.salesBarTall, { backgroundColor: color }]} />
      </View>
    );
  }

  if (name === 'sync') {
    return (
      <View style={iconStyles.sync}>
        <View style={[iconStyles.syncArrowTop, { borderColor: color }]} />
        <View style={[iconStyles.syncArrowBottom, { borderColor: color }]} />
      </View>
    );
  }

  if (name === 'home') {
    return <Text style={{ color, fontSize: 20 }}>⌂</Text>;
  }

  if (name === 'pos') {
    return (
      <View style={[iconStyles.pos, { borderColor: color }]}>
        <View style={[iconStyles.posScreen, { borderColor: color }]}>
          <View style={[iconStyles.posLine, { backgroundColor: color }]} />
          <View style={[iconStyles.posLine, { backgroundColor: color }]} />
          <View style={[iconStyles.posLineShort, { backgroundColor: color }]} />
        </View>
      </View>
    );
  }

  if (name === 'menu') {
    return <Text style={{ color, fontSize: 18 }}>☰</Text>;
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
    if (!outlinedBell) return <Text style={{ color, fontSize: 18 }}>♧</Text>;
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

export default function BottomNavigation({
  active,
  onSelect,
  showMenu = true,
  staffOnly = false,
  staffAlertCount = null,
}: {
  active: StaffRoute;
  onSelect: (route: StaffTab) => void;
  showMenu?: boolean;
  staffOnly?: boolean;
  staffAlertCount?: number | null;
}) {
  const { colors: themeColors } = useTheme();
  const styles = useNavigationStyles();
  const selectedTab = staffOnly
    ? activeStaffTab(active)
    : active === 'alerts' || active === 'alertDetails'
      ? 'more'
      : activeStaffTab(active);
  const destinations = staffOnly
    ? staffDestinationList
    : (showMenu ? ownerDestinations : ownerDestinations.filter((destination) => destination.route !== 'menu'));
  return (
    <View style={styles.outer}>
      <View style={[styles.bar, staffOnly && styles.staffBar]}>
        {destinations.map((destination) => {
          const selected = destination.route === selectedTab;
          const iconColor = staffOnly || selected ? colors.white : themeColors.action;
          const showAlertBadge = staffOnly &&
            destination.route === 'alerts' &&
            staffAlertCount !== null &&
            staffAlertCount > 0;
          return (
            <Pressable
              key={destination.route}
              accessibilityRole="button"
              accessibilityLabel={destination.label}
              accessibilityState={{ selected }}
              onPress={() => onSelect(destination.route as StaffTab)}
              style={({ pressed }) => [
                styles.item,
                staffOnly && styles.staffItem,
                staffOnly && selected && styles.staffItemSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.iconWrap, staffOnly && styles.staffOuterIconWrap]}>
                <View style={[staffOnly && styles.staffIconWrap, showAlertBadge && styles.staffBadgeAnchor]}>
                  <NavigationIcon name={destination.icon} color={iconColor} outlinedBell={staffOnly} />
                  {showAlertBadge ? (
                    <View style={[styles.staffAlertBadge, selected && styles.staffAlertBadgeSelected]}>
                      <Text style={[styles.staffAlertBadgeText, selected && styles.staffAlertBadgeTextSelected]}>
                        {(staffAlertCount ?? 0) > 99 ? '99+' : staffAlertCount}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <Text style={[
                styles.label,
                staffOnly && styles.staffLabel,
                staffOnly && !selected && styles.staffInactiveLabel,
                selected && styles.labelSelected,
              ]}>{destination.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function OwnerBottomNav({
  activeIndex,
  onSelect,
}: {
  activeIndex: number;
  onSelect: (tab: OwnerTab) => void;
}) {
  const styles = useNavigationStyles();
  return (
    <View style={styles.outer}>
      <View style={[styles.bar, styles.ownerBar]}>
        {ownerDestinations.map((destination, index) => {
          const selected = destination.route !== 'more' ? activeIndex === index : activeIndex === 5;
          return (
            <Pressable
              key={destination.route}
              accessibilityRole="button"
              accessibilityLabel={destination.label}
              accessibilityState={{ selected }}
              onPress={() => onSelect(destination.route as OwnerTab)}
              style={({ pressed }) => [
                styles.item,
                styles.ownerItem,
                selected && styles.ownerItemSelected,
                selected && styles.ownerSelectedItem,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.iconWrap, styles.ownerOuterIconWrap]}>
                <NavigationIcon name={destination.icon} color={colors.white} outlinedBell={false} />
              </View>
              {selected ? (
                <Text style={[styles.ownerLabel, styles.labelSelected]} numberOfLines={1}>
                  {destination.label}
                </Text>
              ) : null}
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
  staffBar: {
    minHeight: 56,
    justifyContent: 'space-between',
    gap: 3,
    backgroundColor: '#0F1025',
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  ownerBar: {
    minHeight: 56,
    justifyContent: 'space-between',
    gap: 3,
    backgroundColor: '#0F1025',
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  item: {
    flex: 1,
    minWidth: 0,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffItem: {
    height: STAFF_NAVIGATION_TOUCH_TARGET,
    flexDirection: 'column',
  },
  ownerItem: {
    height: STAFF_NAVIGATION_TOUCH_TARGET,
    flexDirection: 'column',
  },
  staffItemSelected: {
    flex: 1.65,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 24,
    backgroundColor: colors.staffPink,
  },
  ownerItemSelected: {
    flex: 1.65,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 24,
    backgroundColor: colors.staffPink,
  },
  ownerSelectedItem: {
    maxWidth: 112,
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
  staffOuterIconWrap: { width: 20, height: 20 },
  ownerOuterIconWrap: { width: 20, height: 20 },
  staffIconWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffBadgeAnchor: {
    position: 'relative',
  },
  staffAlertBadge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 13,
    height: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    borderRadius: 7,
    backgroundColor: colors.staffPink,
    borderWidth: 1,
    borderColor: '#0F1025',
  },
  staffAlertBadgeSelected: {
    backgroundColor: colors.white,
    borderColor: colors.staffPink,
  },
  staffAlertBadgeText: {
    color: colors.white,
    fontSize: 6,
    lineHeight: 8,
    fontFamily: 'Poppins_700Bold',
  },
  staffAlertBadgeTextSelected: {
    color: colors.staffPink,
  },
  label: { color: colors.white, fontSize: 9, fontFamily: 'Poppins_500Medium', marginTop: 2 },
  staffLabel: { fontSize: 8, marginTop: 0 },
  ownerLabel: { color: colors.white, fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_500Medium', marginTop: 0 },
  staffInactiveLabel: { display: 'none' },
  labelSelected: { color: colors.white },
  pressed: { opacity: 0.76 },
  }, theme)), [theme]);
}

const iconStyles = StyleSheet.create({
  dashboardGrid: { width: 20, height: 20, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignContent: 'space-between', padding: 2 },
  dashboardDot: { width: 6, height: 6, borderRadius: 1 },
  salesChart: { width: 20, height: 20, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 2, paddingBottom: 2 },
  salesBarSmall: { width: 4, height: 7, borderRadius: 1 },
  salesBarMedium: { width: 4, height: 11, borderRadius: 1 },
  salesBarTall: { width: 4, height: 16, borderRadius: 1 },
  sync: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  syncArrowTop: { position: 'absolute', top: 2, left: 4, width: 11, height: 6, borderTopWidth: 1.8, borderRightWidth: 1.8, borderTopRightRadius: 5, transform: [{ rotate: '-18deg' }] },
  syncArrowBottom: { position: 'absolute', bottom: 2, right: 4, width: 11, height: 6, borderBottomWidth: 1.8, borderLeftWidth: 1.8, borderBottomLeftRadius: 5, transform: [{ rotate: '-18deg' }] },
  pos: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  posScreen: {
    width: 13, height: 17, justifyContent: 'center', paddingHorizontal: 2,
    borderWidth: 1.6, borderRadius: 2,
  },
  posLine: { width: 7, height: 1, marginBottom: 2 },
  posLineShort: { width: 5, height: 1 },
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
