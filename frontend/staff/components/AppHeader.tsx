import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { staffColors, staffRadius, staffSpacing, staffTypography } from '../theme/staffTokens';

export default function AppHeader({
  title,
  branchSubtitle,
  onBack,
  onAlerts,
  alertCount,
}: {
  title: string;
  branchSubtitle?: string;
  onBack?: () => void;
  onAlerts?: () => void;
  alertCount?: number;
}) {
  return (
    <View style={styles.container}>
      {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.iconButton}><Text style={styles.back}>‹</Text></Pressable> : null}
      <View style={styles.copy}><Text style={styles.title}>{title}</Text>{branchSubtitle ? <Text style={styles.subtitle} numberOfLines={1}>{branchSubtitle}</Text> : null}</View>
      {onAlerts ? <Pressable accessibilityRole="button" accessibilityLabel="Alerts" onPress={onAlerts} style={styles.iconButton}><Text style={styles.alert}>♧{alertCount ? ` ${alertCount}` : ''}</Text></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: staffSpacing.md, paddingHorizontal: staffSpacing.lg, paddingVertical: staffSpacing.sm, backgroundColor: staffColors.surface },
  copy: { flex: 1, minWidth: 0 },
  title: { ...staffTypography.h3, color: staffColors.navy },
  subtitle: { ...staffTypography.detail, color: staffColors.secondaryText },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: staffRadius.control },
  back: { color: staffColors.navy, fontSize: 32, lineHeight: 34 },
  alert: { color: staffColors.primary, fontSize: 18 },
});

