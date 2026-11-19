import React, { useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import type { AppUser } from '../services/takosync';

function ownerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'OW';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function OwnerProfileHeader({ user }: { user: AppUser }) {
  const { ownerMenu } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.profileHeader}>
      <View style={styles.avatar} accessibilityLabel={`Profile initials ${ownerInitials(user.displayName)}`}>
        <Text style={styles.avatarText}>{ownerInitials(user.displayName)}</Text>
      </View>
      <Text style={styles.name}>{user.displayName}</Text>
      <View style={styles.roleChip}>
        <Text style={styles.roleChipText}>Owner</Text>
      </View>
    </View>
  );
}

function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ProfileInfoCard({ user }: { user: AppUser }) {
  const styles = useStyles();
  const ownerId = user.employeeId || 'OWN-001';
  return (
    <View style={styles.infoCard}>
      <DetailRow label="Name / ID" value={`${user.displayName} · ${ownerId}`} />
      <DetailRow label="Email" value={user.email} />
      <DetailRow label="Role" value="Owner (all branches)" last />
    </View>
  );
}

function LogoutButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Log out"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <View style={styles.logoutIcon}>
        <View style={styles.logoutDoor} />
        <View style={styles.logoutArrow} />
      </View>
      <Text style={styles.logoutText}>Log out</Text>
    </Pressable>
  );
}

function ConfirmLogoutDialog({
  visible,
  loggingOut,
  error,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  loggingOut: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const styles = useStyles();
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      accessibilityViewIsModal
      onRequestClose={onCancel}
    >
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel logout" onPress={onCancel} style={styles.scrim}>
        <Pressable
          accessibilityRole="alert"
          accessibilityLabel="Confirm logout dialog"
          onPress={() => undefined}
          style={styles.dialog}
        >
          <Text style={styles.dialogTitle}>Confirm logout</Text>
          <Text style={styles.dialogMessage}>
            Log out of TakoSync on this device?{ '\n' }
            Your saved records will remain available.
          </Text>
          {error ? <Text style={styles.dialogError}>{error}</Text> : null}
          <View style={styles.dialogActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              disabled={loggingOut}
              onPress={onCancel}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirm log out"
              disabled={loggingOut}
              onPress={onConfirm}
              style={({ pressed }) => [styles.confirmButton, pressed && styles.pressed]}
            >
              <Text style={styles.confirmText}>{loggingOut ? 'Logging out…' : 'Log out'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function OwnerProfileScreen({
  user,
  loggingOut,
  onBack,
  onLogout,
}: {
  user: AppUser;
  loggingOut: boolean;
  onBack: () => void;
  onLogout: () => Promise<void>;
}) {
  const styles = useStyles();
  const [dialogVisible, setDialogVisible] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const closeDialog = () => {
    if (!loggingOut) setDialogVisible(false);
  };
  const confirmLogout = async () => {
    if (loggingOut) return;
    setLogoutError('');
    try {
      await onLogout();
      setDialogVisible(false);
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Unable to log out. Please try again.');
    }
  };
  useEffect(() => {
    if (!dialogVisible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeDialog();
      return true;
    });
    return () => subscription.remove();
  }, [dialogVisible, loggingOut]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>
      <OwnerProfileHeader user={user} />
      <ProfileInfoCard user={user} />
      <View style={styles.privacyNote}>
        <View style={styles.lockIcon}>
          <View style={styles.lockShackle} />
          <View style={styles.lockBody} />
        </View>
        <Text style={styles.privacyText}>Your password is never displayed.</Text>
      </View>
      <View style={styles.logoutArea}>
        <LogoutButton disabled={loggingOut} onPress={() => { setLogoutError(''); setDialogVisible(true); }} />
      </View>
      <ConfirmLogoutDialog
        visible={dialogVisible}
        loggingOut={loggingOut}
        error={logoutError}
        onCancel={closeDialog}
        onConfirm={() => void confirmLogout()}
      />
    </View>
  );
}

function useStyles() {
  const theme = useTheme();
  const { colors, ownerMenu } = theme;
  return useMemo(() => StyleSheet.create(createThemedStyles({
    screen: { flex: 1, backgroundColor: ownerMenu.colors.background, paddingHorizontal: 16 },
    header: { height: 42, flexDirection: 'row', alignItems: 'center' },
    backButton: { width: 24, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
    backChevron: { color: ownerMenu.colors.navy, fontFamily: ownerMenu.fonts.regular, fontSize: 22, lineHeight: 24 },
    headerTitle: { color: ownerMenu.colors.navy, fontFamily: ownerMenu.fonts.bold, fontSize: 15 },
    profileHeader: { alignItems: 'center', paddingTop: 16 },
    avatar: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 31, backgroundColor: ownerMenu.colors.crimson },
    avatarText: { color: ownerMenu.colors.white, fontFamily: ownerMenu.fonts.bold, fontSize: 17 },
    name: { color: ownerMenu.colors.navy, fontFamily: ownerMenu.fonts.bold, fontSize: 12, marginTop: 8 },
    roleChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, marginTop: 5, backgroundColor: colors.salesRecordLavender },
    roleChipText: { color: ownerMenu.colors.navy, fontFamily: ownerMenu.fonts.bold, fontSize: 8 },
    infoCard: { paddingHorizontal: 10, marginTop: 16, borderRadius: 12, backgroundColor: ownerMenu.colors.tile },
    detailRow: { minHeight: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.salesRecordBorder },
    detailRowLast: { borderBottomWidth: 0 },
    detailLabel: { color: colors.secondaryText, fontFamily: ownerMenu.fonts.regular, fontSize: 8 },
    detailValue: { maxWidth: '72%', color: ownerMenu.colors.navy, fontFamily: ownerMenu.fonts.bold, fontSize: 8, textAlign: 'right' },
    privacyNote: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    lockIcon: { width: 10, height: 11, position: 'relative', marginRight: 4 },
    lockShackle: { position: 'absolute', top: 0, left: 2, width: 6, height: 6, borderWidth: 1.2, borderColor: colors.secondaryText, borderBottomWidth: 0, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
    lockBody: { position: 'absolute', bottom: 0, left: 1, width: 8, height: 6, borderWidth: 1.2, borderColor: colors.secondaryText, borderRadius: 1 },
    privacyText: { color: colors.secondaryText, fontFamily: ownerMenu.fonts.regular, fontSize: 8 },
    logoutArea: { flex: 1, justifyContent: 'flex-end', paddingBottom: 20 },
    logoutButton: { height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: ownerMenu.colors.crimson },
    logoutText: { color: ownerMenu.colors.white, fontFamily: ownerMenu.fonts.bold, fontSize: 10 },
    logoutIcon: { width: 15, height: 15, marginRight: 5, alignItems: 'center', justifyContent: 'center' },
    logoutDoor: { position: 'absolute', left: 0, width: 8, height: 12, borderWidth: 1.5, borderColor: ownerMenu.colors.white, borderRadius: 1 },
    logoutArrow: { width: 9, height: 7, borderTopWidth: 1.5, borderRightWidth: 1.5, borderColor: ownerMenu.colors.white, transform: [{ rotate: '45deg' }] },
    scrim: { flex: 1, justifyContent: 'center', paddingHorizontal: 18, backgroundColor: ownerMenu.colors.scrim },
    dialog: { width: '100%', maxWidth: 360, alignSelf: 'center', padding: 16, borderRadius: 18, backgroundColor: ownerMenu.colors.white },
    dialogTitle: { color: ownerMenu.colors.navy, fontFamily: ownerMenu.fonts.bold, fontSize: 12, textAlign: 'center' },
    dialogMessage: { color: colors.secondaryText, fontFamily: ownerMenu.fonts.regular, fontSize: 8, lineHeight: 13, textAlign: 'center', marginTop: 7 },
    dialogError: { color: colors.error, fontFamily: ownerMenu.fonts.regular, fontSize: 8, textAlign: 'center', marginTop: 6 },
    dialogActions: { flexDirection: 'row', gap: 8, marginTop: 15 },
    cancelButton: { flex: 1, height: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: ownerMenu.colors.navy, borderRadius: 16, backgroundColor: ownerMenu.colors.white },
    confirmButton: { flex: 1, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: ownerMenu.colors.crimson },
    cancelText: { color: ownerMenu.colors.navy, fontFamily: ownerMenu.fonts.bold, fontSize: 9 },
    confirmText: { color: ownerMenu.colors.white, fontFamily: ownerMenu.fonts.bold, fontSize: 9 },
    pressed: { opacity: 0.76 },
    disabled: { opacity: 0.6 },
  }, theme)), [theme]);
}

