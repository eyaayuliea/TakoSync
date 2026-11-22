import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../backend/types/database';
import { withDenialAudit } from './permissions';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigurationError = (() => {
  if (!supabaseUrl || !supabasePublishableKey) {
    return 'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in the root .env file, then restart Expo.';
  }
  if (/your[-_]project[-_]ref|your[-_]supabase/i.test(`${supabaseUrl} ${supabasePublishableKey}`)) {
    return 'Replace the placeholder Supabase URL and key in the root .env file, then restart Expo.';
  }
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return 'EXPO_PUBLIC_SUPABASE_URL must use HTTP or HTTPS.';
    }
  } catch {
    return 'EXPO_PUBLIC_SUPABASE_URL must be a valid HTTP(S) URL.';
  }
  return null;
})();

export const isSupabaseConfigured = supabaseConfigurationError === null;

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      // S2: report every permission-gate 403 to the audit log.
      global: { fetch: withDenialAudit((...args) => fetch(...args), supabaseUrl!) },
    })
  : null;

/**
 * A throwaway Auth client that never stores or refreshes a session. Used to check
 * a password (for example on the Staff lock screen) without replacing the
 * signed-in session held by the main client.
 */
export function createIsolatedAuthClient() {
  if (!isSupabaseConfigured) {
    throw new Error(supabaseConfigurationError ?? 'Supabase is not configured.');
  }
  return createClient<Database>(supabaseUrl!, supabasePublishableKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'takosync-isolated-auth-check',
    },
  });
}

export function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigurationError ?? 'Supabase is not configured.');
  }
  return supabase;
}
