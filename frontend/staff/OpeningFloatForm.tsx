import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { recordOpeningFloat } from '../services/takosync';
import { formatPeso, validateOpeningFloatInput, type OpeningFloat } from '../services/dailyClosing';

const font = { regular: 'Poppins_400Regular', medium: 'Poppins_500Medium', semibold: 'Poppins_600SemiBold' } as const;

/**
 * ST-06 c7, c10: staff enter the opening float once at the start of the business
 * day, before the first sale. It asks for a confirmation because the float
 * cannot be changed or recorded again.
 */
export default function OpeningFloatForm({
  branchId,
  onRecorded,
  onAlreadyRecorded,
}: {
  branchId: string;
  onRecorded: (openingFloat: OpeningFloat) => void;
  /** Another device recorded it first: reload and show it. */
  onAlreadyRecorded?: () => void;
}) {
  const { colors } = useTheme();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const clientRequestId = useRef(crypto.randomUUID());

  const review = () => {
    const result = validateOpeningFloatInput(value);
    if (!result.valid) {
      setError(result.error);
      return;
    }
    setError('');
    setConfirming(result.amount);
  };

  const submit = async () => {
    if (confirming === null || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      onRecorded(await recordOpeningFloat({ branchId, amount: confirming, clientRequestId: clientRequestId.current }));
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : 'Unable to save the opening float. Please try again.';
      setError(message);
      setConfirming(null);
      if (message.includes('already been recorded')) onAlreadyRecorded?.();
    } finally {
      setSubmitting(false);
    }
  };

  if (confirming !== null) {
    return (
      <View style={styles.block}>
        <Text style={[styles.confirmTitle, { color: colors.text }]}>Record this opening float?</Text>
        <Text style={[styles.copy, { color: colors.secondaryText }]}>
          It is saved with your employee account and the time, and cannot be changed or recorded again today.
        </Text>
        <View style={styles.row}>
          <Text style={[styles.copy, { color: colors.secondaryText }]}>Opening float</Text>
          <Text style={[styles.amount, { color: colors.text }]}>{formatPeso(confirming)}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => setConfirming(null)}
            style={({ pressed }) => [styles.secondary, { backgroundColor: colors.surfaceSecondary }, pressed && styles.pressed]}
          >
            <Text style={[styles.secondaryText, { color: colors.text }]}>Back</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Confirm opening float"
            accessibilityState={{ disabled: submitting, busy: submitting }}
            disabled={submitting}
            onPress={() => void submit()}
            style={({ pressed }) => [styles.primaryCompact, { backgroundColor: colors.accent }, pressed && styles.pressed, submitting && styles.disabled]}
          >
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Confirm</Text>}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>Opening float (₱) *</Text>
      <TextInput
        value={value}
        onChangeText={(text) => {
          setValue(text);
          if (error) setError('');
        }}
        keyboardType="decimal-pad"
        placeholder="Cash in the drawer before the first sale, e.g. 1000"
        placeholderTextColor={colors.secondaryText}
        accessibilityLabel="Opening float in pesos, required"
        style={[styles.input, { color: colors.text, borderColor: error ? colors.error : colors.border, backgroundColor: colors.background }]}
      />
      {error ? <Text style={[styles.error, { color: colors.error }]} accessibilityRole="alert">{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        onPress={review}
        style={({ pressed }) => [styles.primary, { backgroundColor: colors.accent }, pressed && styles.pressed]}
      >
        <Text style={styles.primaryText}>Record Opening Float</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 6 },
  copy: { fontFamily: font.regular, fontSize: 10, lineHeight: 15 },
  confirmTitle: { fontFamily: font.semibold, fontSize: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  amount: { fontFamily: font.semibold, fontSize: 11 },
  fieldLabel: { fontFamily: font.medium, fontSize: 10, marginTop: 6 },
  input: { minHeight: 42, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, fontFamily: font.regular, fontSize: 11 },
  error: { fontFamily: font.regular, fontSize: 9, lineHeight: 13 },
  primary: { minHeight: 42, marginTop: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  primaryCompact: { minHeight: 42, minWidth: 100, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  primaryText: { color: '#FFFFFF', fontFamily: font.semibold, fontSize: 11 },
  secondary: { minHeight: 42, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  secondaryText: { fontFamily: font.medium, fontSize: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 8 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.82 },
});
