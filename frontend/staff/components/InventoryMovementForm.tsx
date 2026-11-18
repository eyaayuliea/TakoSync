import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import AppButton from './AppButton';
import AppTextField from './AppTextField';
import ConfirmationDialog from './ConfirmationDialog';
import SuccessState from './SuccessState';
import { staffColors, staffSpacing, staffTypography } from '../theme/staffTokens';

export type InventoryMovementMode = 'batter' | 'stock-in' | 'waste' | 'usage';
export type InventoryMovementField = { key: string; label: string; value: string; onChangeText: (value: string) => void; required?: boolean; placeholder?: string; keyboardType?: 'default' | 'numeric' | 'decimal-pad'; error?: string };

export default function InventoryMovementForm({ mode, title, subtitle, fields, submitLabel = 'Review', submitting = false, confirmationVisible = false, confirmationSummary, confirmationError, successTitle, successMessage, successVisible = false, onSubmit, onCancel, onConfirm, onSuccess }: { mode: InventoryMovementMode; title: string; subtitle?: string; fields: InventoryMovementField[]; submitLabel?: string; submitting?: boolean; confirmationVisible?: boolean; confirmationSummary?: string; confirmationError?: string; successTitle?: string; successMessage?: string; successVisible?: boolean; onSubmit: () => void; onCancel: () => void; onConfirm: () => void; onSuccess: () => void }) {
  if (successVisible && successTitle) return <SuccessState title={successTitle} message={successMessage} onAction={onSuccess} />;
  return <><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}><Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}<View style={styles.fields}>{fields.map((field) => <AppTextField key={field.key} label={field.label} value={field.value} onChangeText={field.onChangeText} required={field.required} placeholder={field.placeholder} keyboardType={field.keyboardType} error={field.error} />)}</View><AppButton label={submitLabel} onPress={onSubmit} loading={submitting} /></ScrollView><ConfirmationDialog visible={confirmationVisible} title={`Confirm ${mode.replace('-', ' ')}?`} summary={confirmationSummary} error={confirmationError} loading={submitting} onCancel={onCancel} onConfirm={onConfirm} /></>;
}

const styles = StyleSheet.create({
  content: { gap: staffSpacing.lg, padding: staffSpacing.xl, paddingBottom: staffSpacing.xxl },
  title: { ...staffTypography.h2, color: staffColors.navy },
  subtitle: { ...staffTypography.body, color: staffColors.secondaryText },
  fields: { gap: staffSpacing.lg },
});

