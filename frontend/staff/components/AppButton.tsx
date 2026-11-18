import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { staffColors, staffRadius, staffTypography } from '../theme/staffTokens';

export type AppButtonVariant = 'primary' | 'secondary' | 'outline' | 'destructive';

export default function AppButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? <ActivityIndicator color={variant === 'outline' ? staffColors.primary : staffColors.white} /> : <Text style={[styles.text, variant === 'outline' && styles.outlineText]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: staffRadius.control },
  primary: { backgroundColor: staffColors.primary },
  secondary: { backgroundColor: staffColors.navy },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: staffColors.primary },
  destructive: { backgroundColor: staffColors.error },
  text: { ...staffTypography.label, color: staffColors.white },
  outlineText: { color: staffColors.primary },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.78 },
});

