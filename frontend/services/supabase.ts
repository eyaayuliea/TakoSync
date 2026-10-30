import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../backend/types/database';

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
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigurationError ?? 'Supabase is not configured.');
  }
  return supabase;
}
