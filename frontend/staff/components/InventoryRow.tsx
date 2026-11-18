import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import StatusBadge from './StatusBadge';
import { staffColors, staffSpacing, staffTypography, type StaffStatus } from '../theme/staffTokens';

export default function InventoryRow({ name, category, quantity, unit, status, onPress }: { name: string; category?: string; quantity: string | number; unit?: string; status?: { kind: StaffStatus; label: string }; onPress?: () => void }) {
  const content = <><View style={styles.copy}><Text style={styles.name} numberOfLines={2}>{name}</Text>{category ? <Text style={styles.category} numberOfLines={1}>{category}</Text> : null}</View><View style={styles.quantity}><Text style={styles.value} numberOfLines={1}>{quantity}</Text>{unit ? <Text style={styles.unit} numberOfLines={1}>{unit}</Text> : null}{status ? <StatusBadge status={status.kind} label={status.label} /> : null}</View></>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`View ${name}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>{content}</Pressable> : <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: staffSpacing.md, padding: staffSpacing.md, borderBottomWidth: 1, borderBottomColor: staffColors.divider, backgroundColor: staffColors.surface },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  name: { ...staffTypography.title, color: staffColors.navy },
  category: { ...staffTypography.detail, color: staffColors.secondaryText },
  quantity: { minWidth: 72, alignItems: 'flex-end', gap: 2 },
  value: { ...staffTypography.label, color: staffColors.navy },
  unit: { ...staffTypography.detail, color: staffColors.secondaryText },
  pressed: { opacity: 0.78 },
});

