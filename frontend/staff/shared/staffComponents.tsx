import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { staffColors, staffFonts, staffRadius, staffSpacing, staffStatusTones } from '../theme/staffTokens';

type ButtonKind = 'primary' | 'secondary' | 'destructive';
type StatusKind = keyof typeof staffStatusTones;

export function StaffPageHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return <View style={styles.header}>
    {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable> : <View style={styles.backPlaceholder} />}
    <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
    <View style={styles.headerRight}>{right}</View>
  </View>;
}

export function StaffButton({ label, onPress, kind = 'primary', loading = false, disabled = false, accessibilityLabel }: { label: string; onPress?: () => void; kind?: ButtonKind; loading?: boolean; disabled?: boolean; accessibilityLabel?: string }) {
  const inactive = disabled || loading;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} disabled={inactive} onPress={onPress} style={[styles.button, kind === 'secondary' && styles.buttonSecondary, kind === 'destructive' && styles.buttonDestructive, inactive && styles.disabled]}>
    {loading ? <ActivityIndicator color={kind === 'secondary' ? staffColors.primary : staffColors.white} /> : <Text style={[styles.buttonText, kind === 'secondary' && styles.buttonSecondaryText]}>{label}</Text>}
  </Pressable>;
}

export function StaffTextInput({ label, value, onChangeText, error, secureTextEntry, onSubmitEditing, placeholder, editable = true }: { label: string; value: string; onChangeText: (value: string) => void; error?: string; secureTextEntry?: boolean; onSubmitEditing?: () => void; placeholder?: string; editable?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} editable={editable} onChangeText={onChangeText} onSubmitEditing={onSubmitEditing} placeholder={placeholder} placeholderTextColor={staffColors.secondaryText} secureTextEntry={secureTextEntry} style={[styles.input, error && styles.inputError]} value={value} />{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</View>;
}

export function StaffStatusBadge({ label, tone = 'inStock' }: { label: string; tone?: StatusKind }) {
  const colors = staffStatusTones[tone];
  return <View accessibilityLabel={label} style={[styles.badge, { backgroundColor: colors.background }]}><View style={[styles.badgeMarker, { borderColor: colors.foreground }]} /><Text style={[styles.badgeText, { color: colors.foreground }]}>{label}</Text></View>;
}

export function StaffCard({ children, style }: { children: React.ReactNode; style?: object }) { return <View style={[styles.card, style]}>{children}</View>; }
export function StaffDetailRow({ label, value }: { label: string; value: string }) { return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>; }
export function StaffLoadingState({ label = 'Loading…' }: { label?: string }) { return <View style={styles.state}><ActivityIndicator color={staffColors.primary} /><Text style={styles.stateText}>{label}</Text></View>; }
export function StaffEmptyState({ title, message }: { title: string; message?: string }) { return <View style={styles.state}><View style={styles.emptyMarker} /><Text style={styles.stateTitle}>{title}</Text>{message ? <Text style={styles.stateText}>{message}</Text> : null}</View>; }
export function StaffErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) { return <View style={styles.state}><Text accessibilityRole="alert" style={styles.stateTitle}>Something went wrong</Text><Text style={styles.stateText}>{message}</Text>{onRetry ? <StaffButton label="Retry" kind="secondary" onPress={onRetry} /> : null}</View>; }
export function StaffLoadingOverlay({ visible, label = 'Loading…' }: { visible: boolean; label?: string }) { return <Modal transparent visible={visible} statusBarTranslucent><View style={styles.overlay}><View style={styles.overlayCard}><ActivityIndicator color={staffColors.primary} /><Text style={styles.stateText}>{label}</Text></View></View></Modal>; }

export function StaffConfirmationDialog({ visible, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel, loading = false, risk = 'normal' }: { visible: boolean; title: string; message: string; confirmLabel?: string; cancelLabel?: string; onConfirm: () => void; onCancel: () => void; loading?: boolean; risk?: 'normal' | 'destructive' }) {
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}><View style={styles.overlay}><View style={styles.dialog}><Text style={styles.dialogTitle}>{title}</Text><Text style={styles.dialogMessage}>{message}</Text><View style={styles.dialogActions}><StaffButton label={cancelLabel} kind="secondary" onPress={onCancel} disabled={loading} /><StaffButton label={confirmLabel} kind={risk === 'destructive' ? 'destructive' : 'primary'} onPress={onConfirm} loading={loading} /></View></View></View></Modal>;
}

const styles = StyleSheet.create({
  header: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: staffSpacing.md, backgroundColor: staffColors.surface },
  back: { width: staffSpacing.control, height: staffSpacing.control, alignItems: 'center', justifyContent: 'center' },
  backPlaceholder: { width: staffSpacing.control }, backText: { color: staffColors.navy, fontSize: 32, lineHeight: 36 }, headerTitle: { flex: 1, color: staffColors.navy, fontFamily: staffFonts.semibold, fontSize: 18, textAlign: 'center' }, headerRight: { width: staffSpacing.control, alignItems: 'flex-end' },
  button: { minHeight: staffSpacing.control, borderRadius: staffRadius.control, paddingHorizontal: staffSpacing.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: staffColors.primary }, buttonSecondary: { backgroundColor: staffColors.surface, borderWidth: 1, borderColor: staffColors.primary }, buttonDestructive: { backgroundColor: staffColors.error }, buttonText: { color: staffColors.white, fontFamily: staffFonts.semibold, fontSize: 14 }, buttonSecondaryText: { color: staffColors.primary }, disabled: { opacity: 0.55 },
  field: { gap: staffSpacing.xs, marginBottom: staffSpacing.md }, label: { color: staffColors.navy, fontFamily: staffFonts.semibold, fontSize: 14 }, input: { minHeight: staffSpacing.control, borderWidth: 1, borderColor: staffColors.divider, borderRadius: staffRadius.control, paddingHorizontal: staffSpacing.md, color: staffColors.text, backgroundColor: staffColors.surface, fontFamily: staffFonts.regular, fontSize: 14 }, inputError: { borderColor: staffColors.error }, error: { color: staffColors.error, fontFamily: staffFonts.medium, fontSize: 12 },
  badge: { minHeight: staffSpacing.compactControl, borderRadius: staffRadius.control, paddingHorizontal: staffSpacing.sm, flexDirection: 'row', alignItems: 'center', gap: staffSpacing.xs }, badgeMarker: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 }, badgeText: { fontFamily: staffFonts.semibold, fontSize: 12 }, card: { borderRadius: staffRadius.card, backgroundColor: staffColors.surface, padding: staffSpacing.md }, detailRow: { minHeight: staffSpacing.compactControl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: staffSpacing.md }, detailLabel: { color: staffColors.secondaryText, fontFamily: staffFonts.regular, fontSize: 14 }, detailValue: { flex: 1, color: staffColors.navy, fontFamily: staffFonts.medium, fontSize: 14, textAlign: 'right' },
  state: { alignItems: 'center', justifyContent: 'center', gap: staffSpacing.sm, padding: staffSpacing.xxl }, stateTitle: { color: staffColors.navy, fontFamily: staffFonts.semibold, fontSize: 16, textAlign: 'center' }, stateText: { color: staffColors.secondaryText, fontFamily: staffFonts.regular, fontSize: 14, textAlign: 'center' }, emptyMarker: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: staffColors.neutral }, overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,16,37,0.45)' }, overlayCard: { minWidth: 180, borderRadius: staffRadius.card, padding: staffSpacing.xxl, alignItems: 'center', gap: staffSpacing.sm, backgroundColor: staffColors.surface }, dialog: { width: '90%', maxWidth: 380, borderRadius: staffRadius.dialog, padding: staffSpacing.xl, backgroundColor: staffColors.surface }, dialogTitle: { color: staffColors.navy, fontFamily: staffFonts.semibold, fontSize: 18 }, dialogMessage: { marginTop: staffSpacing.sm, color: staffColors.secondaryText, fontFamily: staffFonts.regular, fontSize: 14, lineHeight: 20 }, dialogActions: { marginTop: staffSpacing.xl, flexDirection: 'row', justifyContent: 'flex-end', gap: staffSpacing.sm },
});
