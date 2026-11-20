import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Keyboard, Platform } from 'react-native';
import {
  activityStorageKey,
  inactivityRemaining,
  readActivityTimestamp,
  type SessionIdentity,
} from './services/inactivityLock';

const PERSIST_INTERVAL_MS = 5_000;

export async function restoreActivity(identity: SessionIdentity): Promise<number> {
  try {
    return readActivityTimestamp(await AsyncStorage.getItem(activityStorageKey(identity)));
  } catch {
    return 0;
  }
}

export function useInactivityLock() {
  const [locked, setLocked] = useState(false);
  const activity = useRef<{ key: string; last: number; saved: number; locked: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const persist = useCallback(() => {
    const current = activity.current;
    if (!current || current.locked) return;
    current.saved = current.last;
    void AsyncStorage.setItem(current.key, String(current.last)).catch(() => {
      if (activity.current === current) current.saved = 0;
    });
  }, []);

  const checkDeadline = useCallback(function checkDeadline() {
    clearTimer();
    const current = activity.current;
    if (!current || current.locked) return;
    const remaining = inactivityRemaining(current.last, Date.now());
    if (remaining === 0) {
      current.locked = true;
      Keyboard.dismiss();
      setLocked(true);
      return;
    }
    timer.current = setTimeout(checkDeadline, remaining);
  }, [clearTimer]);

  const start = useCallback((identity: SessionIdentity, restoredTimestamp?: number) => {
    const now = Date.now();
    const last = restoredTimestamp ?? now;
    const nextLocked = inactivityRemaining(last, now) === 0;
    activity.current = { key: activityStorageKey(identity), last, saved: last, locked: nextLocked };
    setLocked(nextLocked);
    if (restoredTimestamp === undefined) persist();
    checkDeadline();
  }, [checkDeadline, persist]);

  const reset = useCallback(() => {
    clearTimer();
    activity.current = null;
    setLocked(false);
  }, [clearTimer]);

  const recordActivity = useCallback(() => {
    const current = activity.current;
    if (!current || current.locked) return;
    const now = Date.now();
    if (inactivityRemaining(current.last, now) === 0) {
      checkDeadline();
      return;
    }
    current.last = now;
    if (now - current.saved >= PERSIST_INTERVAL_MS) persist();
  }, [checkDeadline, persist]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkDeadline();
      else persist();
    });
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('keydown', recordActivity);
      document.addEventListener('pointerdown', recordActivity);
      document.addEventListener('wheel', recordActivity, { passive: true });
    }
    return () => {
      clearTimer();
      subscription.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('keydown', recordActivity);
        document.removeEventListener('pointerdown', recordActivity);
        document.removeEventListener('wheel', recordActivity);
      }
    };
  }, [checkDeadline, clearTimer, persist, recordActivity]);

  return { locked, start, reset, recordActivity };
}
