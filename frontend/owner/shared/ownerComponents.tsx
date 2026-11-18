import React, { useMemo } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { OwnerMenuIcon, type OwnerMenuIconName } from '../OwnerMenuScreens';
import { ownerColors, ownerIcon, ownerRadii, ownerSpacing, ownerTypography } from './ownerTokens';

export function OwnerIcon({ name, color = ownerColors.navy, size = ownerIcon.control }: { name: OwnerMenuIconName; color?: string; size?: number }) {
  return <OwnerMenuIcon name={name} color={color} size={size} />;
}

export function OwnerHeader({ title, onBack, trailing }: { title: string; onBack?: () => void; trailing?: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.header}>
    {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={8} style={styles.headerAction}><OwnerIcon name="sync" size={ownerIcon.control} /></Pressable> : <View style={styles.headerAction} />}
    <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
    {trailing ?? <View style={styles.headerAction} />}
  </View>;
}

export function OwnerCard({ children, style }: { children: React.ReactNode; style?: object }) { return <View style={[useStyles().card, style]}>{children}</View>; }

type ButtonVariant = 'solid' | 'outline' | 'neutral';
export function OwnerButton({ label, onPress, variant = 'solid', disabled = false, icon }: { label: string; onPress?: () => void; variant?: ButtonVariant; disabled?: boolean; icon?: OwnerMenuIconName }) {
  const styles = useStyles();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.button, variant === 'outline' ? styles.buttonOutline : variant === 'neutral' ? styles.buttonNeutral : styles.buttonSolid, disabled && styles.buttonDisabled, pressed && !disabled && styles.pressed]}>
    {icon ? <OwnerIcon name={icon} color={variant === 'solid' ? ownerColors.white : ownerColors.navy} size={ownerIcon.metadata} /> : null}<Text style={[styles.buttonText, variant === 'solid' && styles.buttonTextSolid]}>{label}</Text>
  </Pressable>;
}

export function OwnerBadge({ label, tone = 'neutral', icon }: { label: string; tone?: 'success' | 'warning' | 'error' | 'critical' | 'info' | 'neutral'; icon?: OwnerMenuIconName }) {
  const styles = useStyles();
  const toneStyle = styles[`badge_${tone}` as keyof typeof styles] as object;
  return <View style={[styles.badge, toneStyle]}>{icon ? <OwnerIcon name={icon} color={tone === 'success' || tone === 'error' || tone === 'critical' ? ownerColors.white : ownerColors.navy} size={ownerIcon.metadata} /> : null}<Text style={[styles.badgeText, (tone === 'success' || tone === 'error' || tone === 'critical') && styles.badgeTextLight]}>{label}</Text></View>;
}

export const OwnerChip = OwnerBadge;

export function OwnerDetailRow({ label, value, tone, first = false, multiline = false, compact, last = false }: { label: string; value: string; tone?: 'red' | 'critical' | 'success' | 'warning' | 'accent'; first?: boolean; multiline?: boolean; compact?: 'accent'; last?: boolean }) {
  const styles = useStyles();
  return <View style={[styles.detailRow, first && styles.detailRowFirst, multiline && styles.detailRowMultiline, compact && styles.detailRowCompact, last && styles.detailRowLast]}><Text style={styles.detailLabel}>{label}</Text><Text style={[styles.detailValue, tone === 'red' && styles.detailRed, tone === 'critical' && styles.detailCritical, tone === 'success' && styles.detailSuccess, tone === 'warning' && styles.detailWarning, (tone === 'accent' || compact === 'accent') && styles.detailAccent]}>{value}</Text></View>;
}

export function OwnerReadOnlyPill() { const styles = useStyles(); return <View style={styles.readOnly}><OwnerIcon name="check" size={ownerIcon.metadata} /><Text style={styles.readOnlyText}>Read-only</Text></View>; }
export function OwnerAvatar({ initials }: { initials: string }) { const styles = useStyles(); return <View accessibilityLabel={`Profile initials ${initials}`} style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>; }

export function OwnerLoadingState({ label = 'Loading records…' }: { label?: string }) { const styles = useStyles(); return <View style={styles.state}><ActivityIndicator size="large" color={ownerColors.primary} /><Text style={styles.stateText}>{label}</Text></View>; }
export function OwnerEmptyState() { const styles = useStyles(); return <View style={styles.state}><View style={styles.emptyCircle}><OwnerIcon name="clipboardCheck" size={ownerIcon.control} /></View><Text style={styles.stateTitle}>No records found.</Text><Text style={styles.stateText}>Records will appear here once saved.</Text></View>; }
export function OwnerErrorState({ onRetry }: { onRetry: () => void }) { const styles = useStyles(); return <View style={styles.state}><OwnerIcon name="bell" color={ownerColors.primary} size={32} /><Text style={styles.stateText}>Unable to load data. Please check your internet connection and try again.</Text><OwnerButton label="Retry" variant="outline" onPress={onRetry} icon="sync" /></View>; }
export function OwnerPaginationFooter({ loadingMore, loadMoreError, onRetry }: { loadingMore: boolean; loadMoreError: boolean; onRetry: () => void }) { if (loadingMore) return <OwnerLoadingState label="Loading more…" />; if (loadMoreError) return <OwnerButton label="Couldn't load more. Tap to retry." variant="neutral" onPress={onRetry} />; return null; }

export function OwnerModal({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) { return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><Pressable accessibilityRole="button" accessibilityLabel="Close dialog" onPress={onClose} style={stylesStatic.scrim}><Pressable onPress={() => undefined} style={stylesStatic.modal}>{children}</Pressable></Pressable></Modal>; }
export function OwnerBottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) { return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><Pressable onPress={onClose} style={stylesStatic.sheetScrim}><Pressable onPress={() => undefined} style={stylesStatic.sheet}>{children}</Pressable></Pressable></Modal>; }

export function OwnerInput(props: React.ComponentProps<typeof TextInput>) { return <TextInput {...props} style={[useStyles().input, props.style]} />; }
export function OwnerSelect({ label, onPress }: { label: string; onPress: () => void }) { const styles = useStyles(); return <Pressable accessibilityRole="button" onPress={onPress} hitSlop={4} style={styles.input}><Text style={styles.inputText}>{label}</Text><OwnerIcon name="more" size={ownerIcon.metadata} /></Pressable>; }
export function OwnerSearch(props: React.ComponentProps<typeof TextInput>) { return <OwnerInput {...props} accessibilityLabel={props.accessibilityLabel ?? 'Search'} placeholder={props.placeholder ?? 'Search'} />; }
export function OwnerTabs({ items, selected, onSelect }: { items: readonly string[]; selected: string; onSelect: (item: string) => void }) { const styles = useStyles(); return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{items.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: item === selected }} onPress={() => onSelect(item)} hitSlop={4} style={[styles.tab, item === selected && styles.tabSelected]}><Text style={[styles.tabText, item === selected && styles.tabTextSelected]}>{item}</Text></Pressable>)}</ScrollView>; }

export const OwnerRecordLoadingState = OwnerLoadingState;
export const OwnerRecordEmptyState = OwnerEmptyState;
export const OwnerRecordErrorState = OwnerErrorState;
export const OwnerRecordPaginationFooter = OwnerPaginationFooter;
export const OwnerRecordHeader = OwnerHeader;
export const OwnerRecordDetailRow = OwnerDetailRow;
export const OwnerRecordReadOnlyPill = OwnerReadOnlyPill;

const stylesStatic = StyleSheet.create({ scrim: { flex: 1, justifyContent: 'center', padding: ownerSpacing.page, backgroundColor: ownerColors.scrim }, modal: { width: '100%', maxWidth: 360, alignSelf: 'center', padding: ownerSpacing.card, borderRadius: ownerRadii.card, backgroundColor: ownerColors.white }, sheetScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: ownerColors.scrim }, sheet: { padding: ownerSpacing.card, borderTopLeftRadius: ownerRadii.sheet, borderTopRightRadius: ownerRadii.sheet, backgroundColor: ownerColors.white } });

function useStyles() { return useMemo(() => StyleSheet.create({
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: ownerSpacing.page, backgroundColor: ownerColors.white }, headerAction: { width: ownerSpacing.control, height: ownerSpacing.control, alignItems: 'center', justifyContent: 'center' }, headerTitle: { ...ownerTypography.cardTitle, flex: 1, textAlign: 'center' }, card: { padding: ownerSpacing.card, borderRadius: ownerRadii.card, backgroundColor: ownerColors.card }, button: { minHeight: ownerSpacing.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ownerSpacing.compact, paddingHorizontal: ownerSpacing.card, borderRadius: ownerRadii.control }, buttonSolid: { backgroundColor: ownerColors.primary }, buttonOutline: { borderWidth: 1, borderColor: ownerColors.primary, backgroundColor: ownerColors.white }, buttonNeutral: { borderWidth: 1, borderColor: ownerColors.neutral, backgroundColor: ownerColors.white }, buttonDisabled: { backgroundColor: ownerColors.neutral, borderColor: ownerColors.neutral }, buttonText: { ...ownerTypography.button }, buttonTextSolid: { color: ownerColors.white }, pressed: { opacity: 0.72 }, badge: { minHeight: ownerSpacing.compactControl / 2, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: ownerSpacing.compact, borderRadius: ownerRadii.pill }, badge_success: { backgroundColor: ownerColors.success }, badge_warning: { backgroundColor: ownerColors.warning }, badge_error: { backgroundColor: ownerColors.error }, badge_critical: { backgroundColor: ownerColors.discrepancy }, badge_info: { backgroundColor: ownerColors.cream }, badge_neutral: { backgroundColor: ownerColors.neutral }, badgeText: { ...ownerTypography.badge }, badgeTextLight: { color: ownerColors.white }, detailRow: { minHeight: ownerSpacing.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: ownerColors.divider }, detailRowFirst: { paddingTop: 0 }, detailRowMultiline: { alignItems: 'flex-start', paddingVertical: ownerSpacing.row }, detailRowCompact: { minHeight: ownerSpacing.compactControl }, detailRowLast: { borderBottomWidth: 0 }, detailLabel: { ...ownerTypography.caption }, detailValue: { ...ownerTypography.value, maxWidth: '64%', textAlign: 'right' }, detailRed: { color: ownerColors.error }, detailCritical: { color: ownerColors.discrepancy }, detailSuccess: { color: ownerColors.success }, detailWarning: { color: ownerColors.orange }, detailAccent: { color: ownerColors.primary }, readOnly: { minHeight: ownerSpacing.compactControl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: ownerSpacing.row, borderRadius: ownerRadii.pill, backgroundColor: ownerColors.neutral }, readOnlyText: { ...ownerTypography.badge }, avatar: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: ownerRadii.circle, backgroundColor: ownerColors.primary }, avatarText: { ...ownerTypography.cardTitle, color: ownerColors.white }, state: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: ownerSpacing.compact, padding: ownerSpacing.card }, stateTitle: { ...ownerTypography.cardTitle }, stateText: { ...ownerTypography.caption, textAlign: 'center' }, emptyCircle: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: ownerRadii.circle, backgroundColor: ownerColors.lavenderTint }, input: { minHeight: ownerSpacing.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: ownerSpacing.row, borderWidth: 1, borderColor: ownerColors.divider, borderRadius: ownerRadii.control, backgroundColor: ownerColors.white, ...ownerTypography.label }, inputText: { ...ownerTypography.label, flex: 1 }, tabs: { gap: ownerSpacing.compact, paddingVertical: ownerSpacing.compact }, tab: { minHeight: ownerSpacing.compactControl, alignItems: 'center', justifyContent: 'center', paddingHorizontal: ownerSpacing.row, borderRadius: ownerRadii.pill, backgroundColor: ownerColors.canvas }, tabSelected: { backgroundColor: ownerColors.primary }, tabText: { ...ownerTypography.button, color: ownerColors.navy }, tabTextSelected: { color: ownerColors.white },
}), []); }
