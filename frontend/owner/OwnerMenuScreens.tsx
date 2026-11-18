import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type OwnerRecordRoute =
  | 'SalesTransactions'
  | 'SalesConsumptionRecords'
  | 'StockInRecords'
  | 'WasteSpillageRecords'
  | 'PhysicalCountRecords'
  | 'AuthorizedAdjustmentRecords';

export type OwnerMenuIconName =
  | 'receipt'
  | 'profile'
  | 'clipboardCheck'
  | 'stockIn'
  | 'droplet'
  | 'cube'
  | 'check'
  | 'dashboard'
  | 'salesChart'
  | 'inventory'
  | 'sync'
  | 'bell'
  | 'more'
  | 'mapPin';

type MenuItem = {
  icon: OwnerMenuIconName;
  title: string;
  subtitle: string;
  onTap: () => void;
};

export function OwnerMenuScreen({
  title,
  items,
}: {
  title: string;
  items: MenuItem[];
}) {
  const { ownerMenu } = useTheme();
  const styles = StyleSheet.create({
    screen: {
      flexGrow: 1,
      paddingHorizontal: ownerMenu.layout.screenHorizontalPadding,
      paddingTop: ownerMenu.layout.screenTopPadding,
      paddingBottom: ownerMenu.layout.scrollBottomPadding,
      backgroundColor: ownerMenu.colors.background,
    },
    title: {
      marginBottom: ownerMenu.layout.titleBottomSpacing,
      color: ownerMenu.colors.navy,
      fontFamily: ownerMenu.fonts.bold,
      fontSize: ownerMenu.typography.pageTitle,
    },
    list: {
      gap: ownerMenu.layout.tileGap,
    },
  });

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.list}>
        {items.map((item) => (
          <MenuListTile key={item.title} {...item} />
        ))}
      </View>
    </View>
  );
}

export function MoreMenuScreen({
  onOpenRecords,
  onOpenProfile,
}: {
  onOpenRecords: () => void;
  onOpenProfile: () => void;
}) {
  return (
    <OwnerMenuScreen
      title="More"
      items={[
        {
          icon: 'receipt',
          title: 'Records',
          subtitle: 'Sales and inventory history',
          onTap: onOpenRecords,
        },
        {
          icon: 'profile',
          title: 'Profile',
          subtitle: 'Account information and log out',
          onTap: onOpenProfile,
        },
      ]}
    />
  );
}

export function RecordsMenuScreen({
  onSelectRecord,
}: {
  onSelectRecord: (route: OwnerRecordRoute) => void;
}) {
  return (
    <OwnerMenuScreen
      title="Records"
      items={[
        {
          icon: 'receipt',
          title: 'Sales Transaction',
          subtitle: 'Confirmed sales per branch',
          onTap: () => onSelectRecord('SalesTransactions'),
        },
        {
          icon: 'clipboardCheck',
          title: 'Sales Consumption',
          subtitle: 'Ingredients deducted by sales',
          onTap: () => onSelectRecord('SalesConsumptionRecords'),
        },
        {
          icon: 'stockIn',
          title: 'Stock-In',
          subtitle: 'Received inventory',
          onTap: () => onSelectRecord('StockInRecords'),
        },
        {
          icon: 'droplet',
          title: 'Waste and Spillage',
          subtitle: 'Waste, spillage, spoilage, losses',
          onTap: () => onSelectRecord('WasteSpillageRecords'),
        },
        {
          icon: 'cube',
          title: 'Physical Inventory Count',
          subtitle: 'Counts and revision history',
          onTap: () => onSelectRecord('PhysicalCountRecords'),
        },
        {
          icon: 'check',
          title: 'Authorized Adjustment',
          subtitle: 'Adjustments you authorized',
          onTap: () => onSelectRecord('AuthorizedAdjustmentRecords'),
        },
      ]}
    />
  );
}

export function OwnerMenuTitleScreen({ title }: { title: string }) {
  const { ownerMenu } = useTheme();
  const styles = StyleSheet.create({
    screen: {
      flex: 1,
      paddingHorizontal: ownerMenu.layout.screenHorizontalPadding,
      paddingTop: ownerMenu.layout.screenTopPadding,
      backgroundColor: ownerMenu.colors.background,
    },
    title: {
      color: ownerMenu.colors.navy,
      fontFamily: ownerMenu.fonts.bold,
      fontSize: ownerMenu.typography.pageTitle,
    },
  });
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

export function MenuListTile({
  icon,
  title,
  subtitle,
  onTap,
}: MenuItem) {
  const { ownerMenu } = useTheme();
  const styles = StyleSheet.create({
    tile: {
      minHeight: ownerMenu.layout.tileMinHeight,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: ownerMenu.layout.tilePadding,
      borderRadius: ownerMenu.layout.tileRadius,
      backgroundColor: ownerMenu.colors.tile,
    },
    iconCircle: {
      width: ownerMenu.layout.iconCircleSize,
      height: ownerMenu.layout.iconCircleSize,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: ownerMenu.layout.iconCircleSize / 2,
      backgroundColor: ownerMenu.colors.flameOrange,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      marginLeft: ownerMenu.layout.tileIconGap,
    },
    tileTitle: {
      color: ownerMenu.colors.navy,
      fontFamily: ownerMenu.fonts.bold,
      fontSize: ownerMenu.typography.tileTitle,
    },
    subtitle: {
      marginTop: ownerMenu.layout.textLineGap,
      color: ownerMenu.colors.secondaryText,
      fontFamily: ownerMenu.fonts.regular,
      fontSize: ownerMenu.typography.subtitle,
    },
    chevron: {
      marginLeft: ownerMenu.layout.tileIconGap,
      color: ownerMenu.colors.chevron,
      fontFamily: ownerMenu.fonts.regular,
      fontSize: ownerMenu.typography.chevron,
      lineHeight: ownerMenu.typography.chevron,
    },
    pressed: {
      opacity: ownerMenu.layout.pressedOpacity,
    },
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onTap}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <View style={styles.iconCircle}>
        <OwnerMenuIcon
          name={icon}
          color={ownerMenu.colors.navy}
          size={ownerMenu.layout.iconCircleSize / 2}
        />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.tileTitle}>{title}</Text>
        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export function OwnerMenuIcon({
  name,
  color,
  size,
}: {
  name: OwnerMenuIconName;
  color: string;
  size: number;
}) {
  const { ownerMenu } = useTheme();
  const strokeWidth = ownerMenu.icon.strokeWidth;
  const frame = { width: size, height: size };
  const line = (
    left: DimensionValue,
    top: DimensionValue,
    width: DimensionValue,
    angle = 0,
  ) => (
    <View
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height: strokeWidth,
        borderRadius: strokeWidth,
        backgroundColor: color,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );

  if (name === 'more') {
    return (
      <View style={[styles.iconFrame, frame, styles.moreIcon]}>
        {[0, 1, 2].map((dot) => (
          <View
            key={dot}
            style={{
              width: ownerMenu.icon.dotSize,
              height: ownerMenu.icon.dotSize,
              borderRadius: ownerMenu.icon.dotSize / 2,
              backgroundColor: color,
            }}
          />
        ))}
      </View>
    );
  }

  if (name === 'receipt') {
    return (
      <View style={[styles.iconFrame, frame]}>
        <View style={[styles.receiptOutline, styles.iconOutline, { borderColor: color, borderWidth: strokeWidth }]} />
        {line('36%', '40%', '30%')}
        {line('36%', '58%', '30%')}
      </View>
    );
  }

  if (name === 'profile') {
    return (
      <View style={[styles.iconFrame, frame]}>
        <View style={[styles.profileHead, styles.iconOutline, { borderColor: color, borderWidth: strokeWidth }]} />
        <View style={[styles.profileBody, styles.iconOutline, { borderColor: color, borderWidth: strokeWidth }]} />
      </View>
    );
  }

  if (name === 'clipboardCheck') {
    return (
      <View style={[styles.iconFrame, frame]}>
        <View style={[styles.clipboardOutline, styles.iconOutline, { borderColor: color, borderWidth: strokeWidth }]} />
        <View style={[styles.clip, styles.iconOutline, { borderColor: color, borderWidth: strokeWidth }]} />
        {line('34%', '61%', '17%', 45)}
        {line('47%', '57%', '27%', -45)}
      </View>
    );
  }

  if (name === 'stockIn') {
    return (
      <View style={[styles.iconFrame, frame]}>
        {line('48%', '10%', '8%', 90)}
        {line('48%', '10%', '36%', 90)}
        {line('48%', '10%', '36%', -90)}
        {line('10%', '79%', '80%')}
        {line('10%', '65%', '8%', 90)}
        {line('82%', '65%', '8%', 90)}
      </View>
    );
  }

  if (name === 'droplet') {
    return (
      <View style={[styles.iconFrame, frame]}>
        <View style={[styles.dropletOutline, styles.iconOutline, { borderColor: color, borderWidth: strokeWidth }]} />
      </View>
    );
  }

  if (name === 'cube' || name === 'inventory') {
    return (
      <View style={[styles.iconFrame, frame]}>
        {line('23%', '30%', '52%', -30)}
        {line('23%', '30%', '52%', 30)}
        {line('23%', '30%', '53%', 90)}
        {line('73%', '30%', '53%', 90)}
        {line('23%', '83%', '53%', 30)}
        {line('73%', '83%', '53%', -30)}
        {line('48%', '43%', '40%', 90)}
      </View>
    );
  }

  if (name === 'check') {
    return (
      <View style={[styles.iconFrame, frame]}>
        {line('14%', '54%', '37%', 45)}
        {line('40%', '69%', '59%', -45)}
      </View>
    );
  }

  if (name === 'mapPin') {
    return (
      <View style={[styles.iconFrame, frame]}>
        <View style={[styles.iconOutline, { position: 'absolute', left: '24%', top: '8%', width: '52%', height: '52%', borderColor: color, borderWidth: strokeWidth, borderRadius: size, transform: [{ rotate: '45deg' }] }]} />
        <View style={{ position: 'absolute', left: '41%', top: '28%', width: '18%', height: '18%', borderRadius: size, backgroundColor: color }} />
      </View>
    );
  }

  if (name === 'dashboard') {
    return (
      <View style={[styles.iconFrame, frame]}>
        {(['left', 'right'] as const).flatMap((side) =>
          (['top', 'bottom'] as const).map((position) => (
            <View
              key={`${side}-${position}`}
              style={{
                position: 'absolute',
                left: side === 'left' ? '14%' : '57%',
                top: position === 'top' ? '14%' : '57%',
                width: '29%',
                height: '29%',
                borderColor: color,
                borderWidth: strokeWidth,
                borderRadius: strokeWidth,
              }}
            />
          )),
        )}
      </View>
    );
  }

  if (name === 'salesChart') {
    return (
      <View style={[styles.iconFrame, frame]}>
        {line('16%', '79%', '70%')}
        {line('18%', '15%', '64%', 90)}
        {line('31%', '61%', '22%', 90)}
        {line('51%', '43%', '40%', 90)}
        {line('72%', '25%', '58%', 90)}
      </View>
    );
  }

  if (name === 'sync') {
    return (
      <View style={[styles.iconFrame, frame]}>
        <View style={[styles.syncRing, styles.iconOutline, { borderColor: color, borderWidth: strokeWidth }]} />
        {line('58%', '11%', '28%', -35)}
        {line('68%', '10%', '28%', 45)}
        {line('14%', '75%', '28%', -35)}
        {line('4%', '75%', '28%', 45)}
      </View>
    );
  }

  return (
    <View style={[styles.iconFrame, frame]}>
      <View style={[styles.bellBody, styles.iconOutline, { borderColor: color, borderWidth: strokeWidth }]} />
      {line('20%', '77%', '60%')}
      <View style={[styles.bellClapper, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  iconFrame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOutline: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  receiptOutline: {
    left: '22%',
    top: '9%',
    width: '56%',
    height: '82%',
    borderRadius: 1,
  },
  profileHead: {
    top: '11%',
    width: '32%',
    height: '32%',
    borderRadius: 50,
  },
  profileBody: {
    bottom: '9%',
    width: '68%',
    height: '43%',
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  clipboardOutline: {
    left: '16%',
    top: '16%',
    width: '68%',
    height: '76%',
    borderRadius: 2,
  },
  clip: {
    left: '35%',
    top: '8%',
    width: '30%',
    height: '22%',
    borderRadius: 2,
  },
  dropletOutline: {
    left: '19%',
    top: '16%',
    width: '62%',
    height: '62%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 8,
    borderBottomLeftRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  syncRing: {
    left: '16%',
    top: '16%',
    width: '68%',
    height: '68%',
    borderRadius: 50,
  },
  bellBody: {
    top: '12%',
    width: '62%',
    height: '62%',
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  bellClapper: {
    position: 'absolute',
    bottom: '8%',
    width: '20%',
    height: '12%',
    borderRadius: 50,
  },
  moreIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
