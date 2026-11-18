import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AppButton from './AppButton';
import { staffColors, staffSpacing, staffTypography } from '../theme/staffTokens';

export default function SuccessState({ title, message, actionLabel = 'Done', onAction }: { title: string; message?: string; actionLabel?: string; onAction: () => void }) {
  return <View accessibilityRole="summary" style={styles.container}><Text style={styles.icon}>✓</Text><Text style={styles.title}>{title}</Text>{message ? <Text style={styles.message}>{message}</Text> : null}<AppButton label={actionLabel} onPress={onAction} /></View>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: staffSpacing.md, padding: staffSpacing.xxl },
  icon: { color: staffColors.success, fontSize: 40, fontFamily: 'Poppins_700Bold' },
  title: { ...staffTypography.h3, color: staffColors.navy, textAlign: 'center' },
  message: { ...staffTypography.body, color: staffColors.secondaryText, textAlign: 'center' },
});

