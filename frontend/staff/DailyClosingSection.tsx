import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { loadStaffDailyClosing, loadStaffOpeningFloat, recordDailyClosing } from '../services/takosync';
import { formatPeso, validateClosingCashCountInput, type DailyClosing, type OpeningFloat } from '../services/dailyClosing';
import OpeningFloatForm from './OpeningFloatForm';

const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
} as const;

function dateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
}

/**
 * ST-06 c7–c10: staff record the opening float once at the start of the
 * business day (before the first sale) and the closing cash count at the end,
 * each once per branch and day. The comparison with the cash sales (expected
 * cash, over or short) is shown to the owner in the Daily Closing Report, so
 * staff count the cash without seeing the target.
 */
export default function DailyClosingSection({
  branchId,
  businessDate,
  isToday,
  refreshKey,
  onOpeningFloatRecorded,
}: {
  branchId: string;
  /** YYYY-MM-DD, Manila business date. */
  businessDate: string;
  isToday: boolean;
  refreshKey: number;
  /** Tells the workspace that today's float now exists (the POS stops asking for it). */
  onOpeningFloatRecorded?: (openingFloat: OpeningFloat) => void;
}) {
  const { colors } = useTheme();
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [closing, setClosing] = useState<DailyClosing | null>(null);
  const [openingFloat, setOpeningFloat] = useState<OpeningFloat | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [closingCount, setClosingCount] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ closingCashCount?: string }>({});
  const [confirming, setConfirming] = useState<{ closingCashCount: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const clientRequestId = useRef(crypto.randomUUID());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    Promise.all([loadStaffDailyClosing(branchId, businessDate), loadStaffOpeningFloat(branchId, businessDate)])
      .then(([result, floatResult]) => {
        if (!active) return;
        setSupported(result.supported && floatResult.supported);
        setClosing(result.closing);
        setOpeningFloat(floatResult.openingFloat);
      })
      .catch(() => {
        if (active) setLoadError('Unable to load the daily closing. Tap Refresh to try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branchId, businessDate, refreshKey, reloadKey]);

  if (!supported && !loading && !loadError) return null;

  const review = () => {
    const result = validateClosingCashCountInput(closingCount);
    if (!result.valid) {
      setFieldErrors({ closingCashCount: result.error });
      return;
    }
    setFieldErrors({});
    setSubmitError('');
    setConfirming({ closingCashCount: result.amount });
  };

  const submit = async () => {
    if (!confirming || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const saved = await recordDailyClosing({ branchId, ...confirming, clientRequestId: clientRequestId.current });
      setClosing(saved);
      setConfirming(null);
      setClosingCount('');
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to record the closing. Please try again.');
      // A refused second closing means one exists; a missing float means it must be recorded first. Show the current state.
      if (error instanceof Error && /already been recorded|opening float/i.test(error.message)) {
        setConfirming(null);
        setReloadKey((key) => key + 1);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];

  return (
    <View style={card}>
      <Text style={[styles.title, { color: colors.text }]}>Daily Closing</Text>
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : loadError ? (
        <Text style={[styles.copy, { color: colors.error }]}>{loadError}</Text>
      ) : closing ? (
        <>
          <Text style={[styles.copy, { color: colors.text }]}>
            Closing {closing.reference} was recorded{closing.recordedByName ? ` by ${closing.recordedByName}` : ''} on {dateTime(closing.recordedAt)}.
          </Text>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.secondaryText }]}>Opening float</Text>
            <Text style={[styles.value, { color: colors.text }]}>{formatPeso(closing.openingFloat)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.secondaryText }]}>Closing cash count</Text>
            <Text style={[styles.value, { color: colors.text }]}>{formatPeso(closing.closingCashCount)}</Text>
          </View>
          <Text style={[styles.hint, { color: colors.secondaryText }]}>
            The owner compares it with the day’s cash sales in the Daily Closing Report. A closing cannot be recorded twice.
          </Text>
        </>
      ) : !isToday ? (
        <>
          {openingFloat ? (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.secondaryText }]}>Opening float</Text>
              <Text style={[styles.value, { color: colors.text }]}>{formatPeso(openingFloat.amount)}</Text>
            </View>
          ) : null}
          <Text style={[styles.copy, { color: colors.secondaryText }]}>No closing was recorded for this business day.</Text>
        </>
      ) : !openingFloat ? (
        <>
          <Text style={[styles.copy, { color: colors.secondaryText }]}>
            Start the day by recording the opening float: the cash in the drawer before the first sale. It is recorded
            once per day, and the closing cash count is entered at the end of service.
          </Text>
          <OpeningFloatForm
            branchId={branchId}
            onRecorded={(saved) => {
              setOpeningFloat(saved);
              onOpeningFloatRecorded?.(saved);
            }}
            onAlreadyRecorded={() => setReloadKey((key) => key + 1)}
          />
        </>
      ) : (
        <>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.secondaryText }]}>Opening float</Text>
            <Text style={[styles.value, { color: colors.text }]}>{formatPeso(openingFloat.amount)}</Text>
          </View>
          <Text style={[styles.hint, { color: colors.secondaryText }]}>
            Recorded{openingFloat.recordedByName ? ` by ${openingFloat.recordedByName}` : ''} on {dateTime(openingFloat.recordedAt)} ({openingFloat.reference}).
          </Text>
          <Text style={[styles.copy, { color: colors.secondaryText }]}>
            At the end of service, count all the cash in the drawer and record it. The closing can be recorded once per
            day; after it, today’s sales can no longer be voided.
          </Text>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Closing cash count (₱) *</Text>
          <TextInput
            value={closingCount}
            onChangeText={(value) => {
              setClosingCount(value);
              if (fieldErrors.closingCashCount) setFieldErrors({});
            }}
            keyboardType="decimal-pad"
            placeholder="All cash in the drawer, including the float"
            placeholderTextColor={colors.secondaryText}
            accessibilityLabel="Closing cash count in pesos, required"
            style={[styles.input, { color: colors.text, borderColor: fieldErrors.closingCashCount ? colors.error : colors.border, backgroundColor: colors.background }]}
          />
          {fieldErrors.closingCashCount ? <Text style={[styles.error, { color: colors.error }]}>{fieldErrors.closingCashCount}</Text> : null}
          {submitError && !confirming ? <Text style={[styles.error, { color: colors.error }]} accessibilityRole="alert">{submitError}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={review}
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.accent }, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>Record Closing</Text>
          </Pressable>
        </>
      )}

      <Modal visible={confirming !== null} transparent animationType="fade" onRequestClose={() => { if (!submitting) setConfirming(null); }}>
        <View style={styles.backdrop}>
          <View style={[styles.modal, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Record today’s closing?</Text>
            <Text style={[styles.copy, { color: colors.secondaryText }]}>
              It cannot be changed or recorded again after you confirm.
            </Text>
            {confirming ? (
              <>
                {openingFloat ? (
                  <View style={styles.row}>
                    <Text style={[styles.label, { color: colors.secondaryText }]}>Opening float (recorded)</Text>
                    <Text style={[styles.value, { color: colors.text }]}>{formatPeso(openingFloat.amount)}</Text>
                  </View>
                ) : null}
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.secondaryText }]}>Closing cash count</Text>
                  <Text style={[styles.value, { color: colors.text }]}>{formatPeso(confirming.closingCashCount)}</Text>
                </View>
              </>
            ) : null}
            {submitError ? <Text style={[styles.error, { color: colors.error }]} accessibilityRole="alert">{submitError}</Text> : null}
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
                accessibilityState={{ disabled: submitting, busy: submitting }}
                disabled={submitting}
                onPress={() => void submit()}
                style={({ pressed }) => [styles.primaryCompact, { backgroundColor: colors.accent }, pressed && styles.pressed, submitting && styles.disabled]}
              >
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Confirm</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 14, padding: 14, borderRadius: 16, borderWidth: 1, gap: 6 },
  title: { fontFamily: font.semibold, fontSize: 12 },
  copy: { fontFamily: font.regular, fontSize: 10, lineHeight: 15 },
  hint: { fontFamily: font.regular, fontSize: 9, lineHeight: 14, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  label: { fontFamily: font.regular, fontSize: 10 },
  value: { fontFamily: font.semibold, fontSize: 10 },
  fieldLabel: { fontFamily: font.medium, fontSize: 10, marginTop: 6 },
  input: { minHeight: 42, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, fontFamily: font.regular, fontSize: 11 },
  error: { fontFamily: font.regular, fontSize: 9, lineHeight: 13 },
  primary: { minHeight: 42, marginTop: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  primaryCompact: { minHeight: 42, minWidth: 100, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  primaryText: { color: '#FFFFFF', fontFamily: font.semibold, fontSize: 11 },
  secondary: { minHeight: 42, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  secondaryText: { fontFamily: font.medium, fontSize: 10 },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22, backgroundColor: 'rgba(16, 16, 39, 0.42)' },
  modal: { width: '100%', maxWidth: 370, padding: 18, borderRadius: 19, gap: 6 },
  modalTitle: { fontFamily: font.semibold, fontSize: 15 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 12 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.82 },
});
