import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { staffColors, staffSpacing, staffTypography } from '../theme/staffTokens';

export default function TransactionRow({ title, reference, metadata, amount, onPress }: { title: string; reference?: string; metadata?: string; amount?: string; onPress?: () => void }) {
  const content = <><View style={styles.copy}><Text style={styles.title} numberOfLines={2}>{title}</Text>{reference ? <Text style={styles.reference} numberOfLines={1}>{reference}</Text> : null}{metadata ? <Text style={styles.metadata} numberOfLines={2}>{metadata}</Text> : null}</View>{amount ? <Text style={styles.amount} numberOfLines={1}>{amount}</Text> : null}</>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`View ${title}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>{content}</Pressable> : <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: staffSpacing.md, padding: staffSpacing.md, borderBottomWidth: 1, borderBottomColor: staffColors.divider, backgroundColor: staffColors.surface },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { ...staffTypography.title, color: staffColors.navy },
  reference: { ...staffTypography.detail, color: staffColors.primary },
  metadata: { ...staffTypography.detail, color: staffColors.secondaryText },
  amount: { ...staffTypography.label, color: staffColors.navy, maxWidth: '38%' },
  pressed: { opacity: 0.78 },
});

