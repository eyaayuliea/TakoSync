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

// Shared pieces for requests that need the owner's approval: ST-07 Void
// Request and ST-13 Entry Reversal Request.

const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export function approvalDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
}

/** Status of a request plus the action to make one, when allowed. */
export function ApprovalStatusPanel({
  title,
  message,
  tone,
  actionLabel,
  onAction,
  hint,
}: {
  title: string;
  message: string;
  tone: 'error' | 'warning' | 'neutral';
  /** Shown only when a new request is allowed. */
  actionLabel?: string;
  onAction?: () => void;
  hint?: string;
}) {
  const { colors } = useTheme();
  const color = tone === 'error' ? colors.error : tone === 'warning' ? colors.warning : colors.text;
  return (
    <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.panelTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.panelCopy, { color }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={({ pressed }) => [styles.requestButton, { borderColor: colors.error }, pressed && styles.pressed]}
        >
          <Text style={[styles.requestButtonText, { color: colors.error }]}>{actionLabel}</Text>
        </Pressable>
      ) : hint ? (
        <Text style={[styles.panelHint, { color: colors.secondaryText }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

export type ReasonRequestSummaryLine = { id: string; label: string; value: string };

/**
 * A request form with a required reason and a confirmation step. A fresh
 * request id is made each time the form opens, so a retry after a dropped
 * connection cannot create a second request.
 */
export function ReasonRequestModal({
  visible,
  title,
  intro,
  confirmTitle,
  confirmIntro,
  heading,
  lines,
  totalLine,
  reasonPlaceholder,
  reasonAccessibilityLabel,
  maxLength,
  submitLabel,
  validateReason,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  intro: string;
  confirmTitle: string;
  confirmIntro: string;
  heading: string;
  lines: ReasonRequestSummaryLine[];
  totalLine?: ReasonRequestSummaryLine;
  reasonPlaceholder: string;
  reasonAccessibilityLabel: string;
  maxLength: number;
  submitLabel: string;
  validateReason: (reason: string) => string;
  onClose: () => void;
  /** Saves the request; rejects with the message to show. */
  onSubmit: (reason: string, clientRequestId: string) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [submitting, setSubmitting] = useState(false);
  const clientRequestId = useRef('');

  useEffect(() => {
    if (visible) {
      clientRequestId.current = crypto.randomUUID();
      setReason('');
      setError('');
      setStep('form');
      setSubmitting(false);
    }
  }, [visible]);

  const close = () => {
    if (!submitting) onClose();
  };

  const review = () => {
    const message = validateReason(reason);
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
      setError(reasonError instanceof Error ? reasonError.message : 'Unable to save the request. Please try again.');
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.title, { color: colors.text }]}>{step === 'form' ? title : confirmTitle}</Text>
            <Text style={[styles.subtitle, { color: colors.secondaryText }]}>{step === 'form' ? intro : confirmIntro}</Text>

            <View style={[styles.summaryBox, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.summaryHeading, { color: colors.text }]}>{heading}</Text>
              {lines.map((line) => (
                <View key={line.id} style={styles.summaryLine}>
                  <Text style={[styles.summaryLabel, { color: colors.text }]} numberOfLines={2}>{line.label}</Text>
                  <Text style={[styles.summaryValue, { color: colors.text }]}>{line.value}</Text>
                </View>
              ))}
              {totalLine ? (
                <View style={[styles.summaryTotalRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.summaryTotalLabel, { color: colors.text }]}>{totalLine.label}</Text>
                  <Text style={[styles.summaryTotalValue, { color: colors.text }]}>{totalLine.value}</Text>
                </View>
              ) : null}
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Reason (required)</Text>
            {step === 'form' ? (
              <TextInput
                value={reason}
                onChangeText={(value) => {
                  setReason(value);
                  if (error) setError('');
                }}
                placeholder={reasonPlaceholder}
                placeholderTextColor={colors.secondaryText}
                multiline
                maxLength={maxLength}
                accessibilityLabel={reasonAccessibilityLabel}
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
                style={({ pressed }) => [styles.secondary, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.text }, pressed && styles.pressed]}
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
                  : <Text style={styles.primaryText}>{step === 'form' ? 'Continue' : submitLabel}</Text>}
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
  summaryBox: { padding: 12, borderRadius: 13, marginBottom: 14 },
  summaryHeading: { fontFamily: font.semibold, fontSize: 11, marginBottom: 6 },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 3 },
  summaryLabel: { flex: 1, fontFamily: font.regular, fontSize: 10 },
  summaryValue: { fontFamily: font.medium, fontSize: 10, textAlign: 'right' },
  summaryTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 1 },
  summaryTotalLabel: { fontFamily: font.semibold, fontSize: 11 },
  summaryTotalValue: { fontFamily: font.bold, fontSize: 11 },
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
