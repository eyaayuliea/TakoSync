export type StaffAlertPreferenceKey = 'lowStock' | 'expiration';

export type StaffAlertPreferences = {
  lowStock: boolean;
  expiration: boolean;
};

export const DEFAULT_STAFF_ALERT_PREFERENCES: StaffAlertPreferences = {
  lowStock: true,
  expiration: true,
};

const STORAGE_KEY_PREFIX = 'takosync.staff-alert-preferences.v1';

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export function staffAlertPreferencesStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

export function parseStaffAlertPreferences(value: string | null): StaffAlertPreferences {
  if (!value) return { ...DEFAULT_STAFF_ALERT_PREFERENCES };

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_STAFF_ALERT_PREFERENCES };
    }

    const candidate = parsed as Record<string, unknown>;
    return {
      lowStock: typeof candidate.lowStock === 'boolean'
        ? candidate.lowStock
        : DEFAULT_STAFF_ALERT_PREFERENCES.lowStock,
      expiration: typeof candidate.expiration === 'boolean'
        ? candidate.expiration
        : DEFAULT_STAFF_ALERT_PREFERENCES.expiration,
    };
  } catch {
    return { ...DEFAULT_STAFF_ALERT_PREFERENCES };
  }
}

export async function loadStaffAlertPreferences(
  storage: AsyncStorageLike,
  userId: string,
): Promise<StaffAlertPreferences> {
  const value = await storage.getItem(staffAlertPreferencesStorageKey(userId));
  return parseStaffAlertPreferences(value);
}

export async function saveStaffAlertPreferences(
  storage: AsyncStorageLike,
  userId: string,
  preferences: StaffAlertPreferences,
): Promise<void> {
  await storage.setItem(
    staffAlertPreferencesStorageKey(userId),
    JSON.stringify({
      lowStock: preferences.lowStock,
      expiration: preferences.expiration,
    }),
  );
}
