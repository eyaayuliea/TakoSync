import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import AppIcon from '../theme/AppIcon';
import { ownerColors } from '../owner/shared/ownerTokens';
import {
  activeStaffTab,
  STAFF_NAVIGATION_TOUCH_TARGET,
  staffDestinations,
  type StaffNavigationOrigin,
  type StaffRoute,
  type StaffTab,
} from './staffNavigation';

export type { StaffNavigationOrigin, StaffRoute, StaffTab } from './staffNavigation';
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

type Destination = { route: StaffTab | OwnerTab; label: string; icon: 'home' | 'pos' | 'menu' | 'box' | 'stock' | 'bell' | 'more' | 'ownerDashboard' | 'ownerSales' | 'ownerInventory' | 'ownerSync' | 'ownerBell' | 'ownerMore' };

const staffDestinationList: Destination[] = staffDestinations.map((destination) => ({ ...destination }));
export const ownerDestinations: readonly Destination[] = [
  { route: 'dashboard', label: 'Dashboard', icon: 'ownerDashboard' },
  { route: 'sales', label: 'Sales', icon: 'ownerSales' },
  { route: 'inventory', label: 'Inventory', icon: 'ownerInventory' },
  { route: 'discrepancies', label: 'Discrepancies', icon: 'ownerSync' },
  { route: 'alerts', label: 'Alerts', icon: 'ownerBell' },
  { route: 'more', label: 'More', icon: 'ownerMore' },
];

function NavigationIcon({
  name,
  color,
}: {
  name: Destination['icon'];
  color: string;
}) {
  return <AppIcon name={name} color={color} size={22} />;
}

export default function BottomNavigation({
  active,
  origin = null,
  onSelect,
  showMenu = true,
  staffOnly = false,
  staffAlertCount = null,
}: {
  active: StaffRoute;
  /** Staff only: the tab a shared screen was opened from (e.g. 'more'). */
  origin?: StaffNavigationOrigin;
  onSelect: (route: StaffTab) => void;
  showMenu?: boolean;
  staffOnly?: boolean;
  staffAlertCount?: number | null;
}) {
  const { colors: themeColors } = useTheme();
  const styles = useNavigationStyles();
  const selectedTab = staffOnly
    ? activeStaffTab(active, origin)
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
                  <NavigationIcon name={destination.icon} color={iconColor} />
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
                <NavigationIcon name={destination.icon} color={colors.white} />
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

