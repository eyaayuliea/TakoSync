import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import {
  formatBusinessTime,
  type BusinessDaySettings,
} from '../services/businessDaySettings';
import {
  loadCurrentBusinessDaySettings,
  saveCurrentBusinessDayExtension,
  type AppUser,
} from '../services/takosync';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';

type Props = {
  user: AppUser;
  onDeadlineChange: (millisecondsUntilExpiration: number) => void;
};

export default function OwnerBusinessDaySettings({ user, onDeadlineChange }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [settings, setSettings] = useState<BusinessDaySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const current = await loadCurrentBusinessDaySettings();
      setSettings(current);
      onDeadlineChange(current.millisecondsUntilExpiration);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load today’s business hours.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const saveExtension = async (enabled: boolean) => {
    if (!settings || user.role !== 'Owner' || saving) return;
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const updated = await saveCurrentBusinessDayExtension(user, settings, enabled);
      setSettings(updated);
      onDeadlineChange(updated.millisecondsUntilExpiration);
      setFeedback(enabled
        ? `Today’s closing time is now ${formatBusinessTime(updated.extendedClosingTime)}.`
        : `Today’s closing time is ${formatBusinessTime(updated.normalClosingTime)}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save today’s closing time.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.statusCard}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.bodyText}>Loading today’s business hours…</Text>
      </View>
    );
  }

  if (!settings) {
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Business closing time</Text>
        <Text style={styles.bodyText}>{error || 'Today’s business hours are unavailable.'}</Text>
        <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const closingTime = settings.extendedClosingEnabled
    ? settings.extendedClosingTime
    : settings.normalClosingTime;

  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>BUSINESS DATE · ASIA/MANILA</Text>
      <Text style={styles.dateText}>{settings.businessDate}</Text>
      <Text style={styles.title}>Today’s closing time</Text>
      <Text style={styles.closingTime}>{formatBusinessTime(closingTime)}</Text>
      <Text style={styles.bodyText}>
        {settings.extendedClosingEnabled
          ? 'An Owner has authorized the 11 PM extension for today.'
          : `Normal closing is ${formatBusinessTime(settings.normalClosingTime)}.`}
      </Text>

      <View style={styles.extensionRow}>
        <View style={styles.extensionCopy}>
          <Text style={styles.extensionTitle}>Extend closing to {formatBusinessTime(settings.extendedClosingTime)}</Text>
          <Text style={styles.bodyText}>Applies only to this business date.</Text>
        </View>
        <Switch
          accessibilityLabel="Authorize 11 PM closing extension for today"
          accessibilityRole="switch"
          accessibilityState={{ checked: settings.extendedClosingEnabled, disabled: saving || user.role !== 'Owner' }}
          disabled={saving || user.role !== 'Owner'}
          value={settings.extendedClosingEnabled}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor="#FFFFFF"
          onValueChange={(enabled) => void saveExtension(enabled)}
        />
      </View>

      {saving ? (
        <View style={styles.inlineStatus}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.bodyText}>Saving securely…</Text>
        </View>
      ) : null}
      {feedback ? <Text style={styles.successText} accessibilityRole="alert">{feedback}</Text> : null}
      {error ? <Text style={styles.errorText} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

function useStyles() {
  const theme = useTheme();
  const { colors } = theme;
  return useMemo(() => StyleSheet.create(createThemedStyles({
    panel: {
      padding: 18,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    statusCard: {
      minHeight: 100,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.surface,
    },
    eyebrow: {
      color: colors.secondaryText,
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.8,
    },
    dateText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 8,
    },
    title: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '700',
    },
    closingTime: {
      color: colors.accent,
      fontSize: 32,
      fontWeight: '700',
    },
    bodyText: {
      color: colors.secondaryText,
      fontSize: 12,
      lineHeight: 18,
    },
    extensionRow: {
      minHeight: 68,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 10,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    extensionCopy: {
      flex: 1,
      gap: 3,
    },
    extensionTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    inlineStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    successText: {
      color: colors.success,
      fontSize: 12,
      fontWeight: '600',
    },
    errorText: {
      color: colors.error,
      fontSize: 12,
    },
    retryButton: {
      alignSelf: 'flex-start',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: colors.accent,
    },
    retryText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '600',
    },
  }, theme)), [theme]);
}
