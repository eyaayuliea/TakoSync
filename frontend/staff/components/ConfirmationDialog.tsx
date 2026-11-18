import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import AppButton from './AppButton';
import { staffColors, staffRadius, staffSpacing, staffTypography } from '../theme/staffTokens';

export default function ConfirmationDialog({
  visible,
  title,
  summary,
  error,
  loading = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  summary?: string;
  error?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}><View style={styles.backdrop}><View style={styles.card}><Text style={styles.title}>{title}</Text>{summary ? <Text style={styles.summary}>{summary}</Text> : null}{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}<View style={styles.actions}><AppButton label="Cancel" onPress={onCancel} variant="outline" disabled={loading} /><AppButton label="Confirm" onPress={onConfirm} loading={loading} disabled={loading} /></View></View></View></Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: staffSpacing.xxl, backgroundColor: 'rgba(15, 16, 37, 0.55)' },
  card: { width: '100%', maxWidth: 420, gap: staffSpacing.md, padding: staffSpacing.xxl, borderRadius: staffRadius.dialog, backgroundColor: staffColors.surface },
  title: { ...staffTypography.h3, color: staffColors.navy },
  summary: { ...staffTypography.body, color: staffColors.secondaryText },
  error: { ...staffTypography.detail, color: staffColors.error },
  actions: { flexDirection: 'row', gap: staffSpacing.sm },
});

