import React from 'react';
import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { staffColors, staffRadius, staffSpacing, staffTypography } from '../theme/staffTokens';

export default function AppTextField({
  label,
  required = false,
  helperText,
  error,
  accessibilityLabel,
  ...inputProps
}: TextInputProps & {
  label: string;
  required?: boolean;
  helperText?: string;
  error?: string;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}{required ? ' *' : ''}</Text>
      <TextInput
        {...inputProps}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: inputProps.editable === false }}
        placeholderTextColor={staffColors.secondaryText}
        style={[styles.input, error && styles.inputError, inputProps.editable === false && styles.inputDisabled, inputProps.style]}
      />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: staffSpacing.sm },
  label: { ...staffTypography.label, color: staffColors.navy },
  input: { minHeight: 48, borderWidth: 1, borderColor: staffColors.divider, borderRadius: staffRadius.control, backgroundColor: staffColors.surface, color: staffColors.text, paddingHorizontal: staffSpacing.md, ...staffTypography.body },
  inputError: { borderColor: staffColors.error },
  inputDisabled: { backgroundColor: '#EEEEEC', color: staffColors.secondaryText },
  helper: { ...staffTypography.detail, color: staffColors.secondaryText },
  error: { ...staffTypography.detail, color: staffColors.error },
});

