import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { staffColors, staffElevation, staffRadius, staffSpacing } from '../theme/staffTokens';

export default function AppCard({ statusColor, children, style, ...props }: ViewProps & { statusColor?: string }) {
  return <View {...props} style={[styles.card, statusColor ? { borderLeftColor: statusColor, borderLeftWidth: 4 } : null, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: staffColors.surface, borderRadius: staffRadius.card, padding: staffSpacing.lg, ...staffElevation },
});

