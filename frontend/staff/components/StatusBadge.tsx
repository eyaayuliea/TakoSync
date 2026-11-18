import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { staffRadius, staffStatusTones, staffTypography, type StaffStatus } from '../theme/staffTokens';

const statusIcons: Record<StaffStatus, string> = { inStock: '✓', lowStock: '!', outOfStock: '×', nearExpiry: '◷', expired: '×', discrepancy: '!' };

export default function StatusBadge({ status, label }: { status: StaffStatus; label: string }) {
  const tone = staffStatusTones[status];
  return <View accessibilityLabel={`${label} status`} style={[styles.badge, { backgroundColor: tone.background }]}><Text style={[styles.icon, { color: tone.foreground }]}>{statusIcons[status]}</Text><Text style={[styles.text, { color: tone.foreground }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  badge: { minHeight: 28, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, borderRadius: staffRadius.pill },
  icon: { fontSize: 14, fontFamily: 'Poppins_700Bold' },
  text: { ...staffTypography.detail, fontFamily: 'Poppins_600SemiBold' },
});

