import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import {
  SALE_VOID_REASON_MAX_LENGTH,
  validateSaleVoidReason,
  type SaleVoidAvailability,
  type SaleVoidState,
} from '../services/saleVoids';

const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

function money(value: number): string {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
}

export type SaleVoidRequestSale = {
  transactionReference: string;
  totalAmount: number;
  lines: Array<{ id: string; name: string; variantLabel: string | null; quantity: number; subtotal: number }>;
};

/**
 * ST-07 c5, c7, c9: what happened to this sale's void, and the Request Void
 * action when it is still allowed (c1, c6).
 */
export function SaleVoidStatusPanel({
  state,
  availability,
  onRequestVoid,
}: {
  state: SaleVoidState;
  availability: SaleVoidAvailability;
  onRequestVoid: () => void;
}) {
  const { colors } = useTheme();
  const tone = state.kind === 'voided' ? colors.error : state.kind === 'pending' ? colors.warning : colors.secondaryText;

  return (
    <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.panelTitle, { color: colors.text }]}>Void</Text>
      {state.kind === 'voided' ? (
        <Text style={[styles.panelCopy, { color: tone }]}>
          Voided{state.request?.decidedAt ? ` on ${dateTime(state.request.decidedAt)}` : ''}
          {state.request?.decidedByName ? ` by ${state.request.decidedByName}` : ''}. This sale is not counted in sales
          totals and its ingredients were returned to stock.
        </Text>
      ) : state.kind === 'pending' ? (
        <Text style={[styles.panelCopy, { color: colors.text }]}>
          Void request {state.request.reference} is Pending (sent {dateTime(state.request.requestedAt)}). The sale still
          counts in the totals until the owner decides.
        </Text>
      ) : state.kind === 'rejected' ? (
        <Text style={[styles.panelCopy, { color: colors.text }]}>
          The owner rejected void request {state.request.reference}
          {state.request.decisionReason ? `: “${state.request.decisionReason}”` : ''}. The sale stays Completed.
        </Text>
      ) : (
        <Text style={[styles.panelCopy, { color: colors.secondaryText }]}>No void has been requested for this sale.</Text>
      )}
      {availability.allowed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Request Void"
          onPress={onRequestVoid}
          style={({ pressed }) => [styles.requestButton, { borderColor: colors.error }, pressed && styles.pressed]}
        >
          <Text style={[styles.requestButtonText, { color: colors.error }]}>Request Void</Text>
        </Pressable>
      ) : state.kind === 'none' || state.kind === 'rejected' ? (
        <Text style={[styles.panelHint, { color: colors.secondaryText }]}>{availability.reason}</Text>
      ) : null}
    </View>
  );
}

/**
 * ST-07 c2–c4: the void request form. It shows the sale, requires a reason,
 * and asks for a confirmation before saving.
 */
export function SaleVoidRequestModal({
  visible,
  sale,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  sale: SaleVoidRequestSale | null;
  onClose: () => void;
  /** Saves the request; rejects with the message to show. */
  onSubmit: (reason: string, clientRequestId: string) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [submitting, setSubmitting] = useState(false);
  // One id per opened form, so a retry after a dropped connection cannot
  // create a second request.
  const clientRequestId = useRef<string>('');

  useEffect(() => {
    if (visible) {
      clientRequestId.current = crypto.randomUUID();
      setReason('');
      setError('');
      setStep('form');
      setSubmitting(false);
    }
  }, [visible]);

  if (!sale) return null;

  const close = () => {
    if (!submitting) onClose();
  };

  const review = () => {
    const message = validateSaleVoidReason(reason);
    if (message) {
      setError(message);
      return;
    }
    setError('');
    setStep('confirm');
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(reason.trim(), clientRequestId.current);
    } catch (reasonError: unknown) {
      setError(reasonError instanceof Error ? reasonError.message : 'Unable to save the void request. Please try again.');
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.title, { color: colors.text }]}>
              {step === 'form' ? 'Request Void' : 'Send this void request?'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
              {step === 'form'
                ? 'The owner reviews every void. The sale stays recorded and counted until it is approved.'
                : 'The owner will be asked to approve or reject it. You cannot edit the request after sending it.'}
            </Text>

            <View style={[styles.saleBox, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.saleReference, { color: colors.text }]}>{sale.transactionReference}</Text>
              {sale.lines.map((line) => (
                <View key={line.id} style={styles.saleLine}>
                  <Text style={[styles.saleLineName, { color: colors.text }]} numberOfLines={2}>
                    {line.quantity} × {line.name}{line.variantLabel ? ` · ${line.variantLabel}` : ''}
                  </Text>
                  <Text style={[styles.saleLineAmount, { color: colors.text }]}>{money(line.subtotal)}</Text>
                </View>
              ))}
              <View style={[styles.saleTotalRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.saleTotalLabel, { color: colors.text }]}>Total</Text>
                <Text style={[styles.saleTotalValue, { color: colors.text }]}>{money(sale.totalAmount)}</Text>
              </View>
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Reason (required)</Text>
            {step === 'form' ? (
              <TextInput
                value={reason}
                onChangeText={(value) => {
                  setReason(value);
                  if (error) setError('');
                }}
                placeholder="e.g. Wrong flavor entered"
                placeholderTextColor={colors.secondaryText}
                multiline
                maxLength={SALE_VOID_REASON_MAX_LENGTH}
                accessibilityLabel="Reason for the void, required"
                editable={!submitting}
                style={[
                  styles.input,
                  { color: colors.text, borderColor: error ? colors.error : colors.border, backgroundColor: colors.background },
                ]}
              />
            ) : (
              <Text style={[styles.reasonPreview, { color: colors.text }]}>{reason.trim()}</Text>
            )}
            {error ? (
              <Text style={[styles.error, { color: colors.error }]} accessibilityRole="alert">{error}</Text>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                onPress={step === 'form' ? close : () => setStep('form')}
                style={({ pressed }) => [styles.secondary, { backgroundColor: colors.surfaceSecondary }, pressed && styles.pressed]}
              >
                <Text style={[styles.secondaryText, { color: colors.text }]}>{step === 'form' ? 'Cancel' : 'Back'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: submitting, busy: submitting }}
                disabled={submitting}
                onPress={step === 'form' ? review : () => void submit()}
                style={({ pressed }) => [
                  styles.primary,
                  { backgroundColor: colors.error },
                  pressed && styles.pressed,
                  submitting && styles.disabled,
                ]}
              >
                {submitting
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.primaryText}>{step === 'form' ? 'Continue' : 'Send Request'}</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: 14, padding: 14, borderRadius: 16, borderWidth: 1 },
  panelTitle: { fontFamily: font.semibold, fontSize: 12, marginBottom: 6 },
  panelCopy: { fontFamily: font.regular, fontSize: 10, lineHeight: 15 },
  panelHint: { fontFamily: font.regular, fontSize: 9, lineHeight: 14, marginTop: 8 },
  requestButton: {
    minHeight: 42,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 1.5,
  },
  requestButtonText: { fontFamily: font.semibold, fontSize: 11 },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22, backgroundColor: 'rgba(16, 16, 39, 0.42)' },
  card: { width: '100%', maxWidth: 390, maxHeight: '90%', padding: 18, borderRadius: 19 },
  title: { fontFamily: font.semibold, fontSize: 15 },
  subtitle: { fontFamily: font.regular, fontSize: 9, lineHeight: 14, marginTop: 5, marginBottom: 14 },
  saleBox: { padding: 12, borderRadius: 13, marginBottom: 14 },
  saleReference: { fontFamily: font.semibold, fontSize: 11, marginBottom: 6 },
  saleLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 3 },
  saleLineName: { flex: 1, fontFamily: font.regular, fontSize: 10 },
  saleLineAmount: { fontFamily: font.medium, fontSize: 10 },
  saleTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 1 },
  saleTotalLabel: { fontFamily: font.semibold, fontSize: 11 },
  saleTotalValue: { fontFamily: font.bold, fontSize: 11 },
  label: { fontFamily: font.medium, fontSize: 10, marginBottom: 6 },
  input: {
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
    borderWidth: 1,
    fontFamily: font.regular,
    fontSize: 11,
    textAlignVertical: 'top',
  },
  reasonPreview: { fontFamily: font.regular, fontSize: 11, lineHeight: 16 },
  error: { fontFamily: font.regular, fontSize: 9, lineHeight: 13, marginTop: 6 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 16 },
  secondary: { minHeight: 42, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  secondaryText: { fontFamily: font.medium, fontSize: 10 },
  primary: { minHeight: 42, minWidth: 110, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  primaryText: { color: '#FFFFFF', fontFamily: font.semibold, fontSize: 10 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.82 },
});
