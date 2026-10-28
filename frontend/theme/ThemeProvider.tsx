import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { StyleSheet } from 'react-native';

export type ThemeMode = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceSecondary: string;
  text: string;
  secondaryText: string;
  accent: string;
  action: string;
  success: string;
  warning: string;
  error: string;
  information: string;
  border: string;
};

export type AppTheme = {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
};

const STORAGE_KEY = 'takosync.theme-mode';

const lightColors: ThemeColors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSecondary: '#F5F5F7',
  text: '#101027',
  secondaryText: '#858591',
  accent: '#F20D55',
  action: '#FF9418',
  success: '#2F8C57',
  warning: '#FDE672',
  error: '#C92F3C',
  information: '#595EC0',
  border: '#EEEEF1',
};

const darkColors: ThemeColors = {
  background: '#13121A',
  surface: '#29283B',
  surfaceSecondary: '#2D2C40',
  text: '#F5F4FA',
  secondaryText: '#B2B3C4',
  accent: '#FF0A50',
  action: '#FFA31A',
  success: '#589144',
  warning: '#FDE672',
  error: '#F52F2E',
  information: '#595EC0',
  border: '#3A394D',
};

const ThemeContext = createContext<AppTheme | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode>('light');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((storedMode) => {
        if (active && (storedMode === 'light' || storedMode === 'dark')) {
          setMode(storedMode);
        }
      })
      .catch((error: unknown) => {
        console.error('Unable to load the saved theme preference.', error);
      })
      .finally(() => {
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, mode).catch((error: unknown) => {
      console.error('Unable to save the theme preference.', error);
    });
  }, [hydrated, mode]);

  const value = useMemo<AppTheme>(() => ({
    mode,
    isDark: mode === 'dark',
    colors: mode === 'dark' ? darkColors : lightColors,
    setMode,
  }), [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider.');
  return context;
}

type ThemeStyleMap<T> = T extends StyleSheet.NamedStyles<T> ? T : never;

function isColorProperty(property: string) {
  return property === 'color'
    || property === 'backgroundColor'
    || property === 'borderColor'
    || property === 'borderTopColor'
    || property === 'borderBottomColor'
    || property === 'borderLeftColor'
    || property === 'borderRightColor'
    || property === 'shadowColor';
}

function remapColor(value: string, property: string, styleName: string, theme: AppTheme) {
  if (!theme.isDark) return value;
  const normalized = value.toUpperCase();
  const colors = theme.colors;

  if (normalized.includes('RGBA(255, 255, 255')) return 'rgba(19, 18, 26, 0.72)';
  if (normalized.includes('RGBA(16, 16, 39') || normalized.includes('RGBA(25, 25, 34')) {
    return 'rgba(10, 9, 15, 0.72)';
  }
  if (normalized === '#F20D55' || normalized === '#EC1358' || normalized === '#F52F2E') {
    return normalized === '#F52F2E' ? colors.error : colors.accent;
  }
  if (normalized === '#FF9418' || normalized === '#FCA639' || normalized === '#FFA126') return colors.action;
  if (normalized === '#E59420') return colors.action;
  if (normalized === '#2F8C57' || normalized === '#589144') return colors.success;
  if (normalized === '#C92F3C' || normalized === '#B9244C') return colors.error;
  if (normalized === '#286D45') return colors.success;
  if (normalized === '#595EC0' || normalized === '#159BFF') return colors.information;
  if (normalized === '#FDE672' || normalized === '#FFF2C4') return colors.warning;

  if (property === 'color') {
    if (normalized === '#FFFFFF') return colors.text;
    if (normalized === '#858591' || normalized === '#B2B3C4' || normalized === '#B7B7BE'
      || normalized === '#C8C8D0' || normalized === '#A0A0AA' || normalized === '#777783'
      || normalized === '#555560' || normalized === '#858591' || normalized === '#D5D5DF'
      || normalized === '#E2E2E9') return colors.secondaryText;
    if (styleName.toLowerCase().includes('error')) return colors.error;
    if (/warning|permission|ledger|stocktip|infobanner|usageinfo|receiptinfo|expir/i.test(styleName)) {
      return '#13121A';
    }
    if (/^#[0-9A-F]{6}$/i.test(normalized)) {
      const red = Number.parseInt(normalized.slice(1, 3), 16);
      const green = Number.parseInt(normalized.slice(3, 5), 16);
      const blue = Number.parseInt(normalized.slice(5, 7), 16);
      if (Math.max(red, green, blue) - Math.min(red, green, blue) <= 12) {
        return (red + green + blue) / 3 >= 128 ? colors.secondaryText : colors.text;
      }
    }
    if (normalized === '#711433' || normalized === '#171724' || normalized === '#000000'
      || normalized === '#101027' || normalized === '#101026' || normalized === '#0F1025') {
      return colors.text;
    }
  }

  if (property === 'backgroundColor') {
    if (/screen|workspace|canvas|safeArea|appFrame|frameShadow/i.test(styleName)) return colors.background;
    if (normalized === '#FFFFFF') {
      if (/safeArea|canvas|screen|workspace|appFrame|loginOverlay|whiteHeader|dashboardScreen|outer/i.test(styleName)) {
        return colors.background;
      }
      return colors.surface;
    }
    if (normalized === '#101027' || normalized === '#101026' || normalized === '#0F1025') return colors.surface;
    if (normalized === '#FDE672' || normalized === '#FFF2C4') return colors.warning;
    if (normalized.startsWith('#F') || normalized.startsWith('#E') || normalized === '#EEEEEF' || normalized === '#EEEEF0'
      || normalized === '#EEEEF1' || normalized === '#F2F2F4' || normalized === '#E8E8EA'
      || normalized === '#DADADD' || normalized === '#D8D8DE') {
      return colors.surfaceSecondary;
    }
    if (normalized === '#FFF5CB' || normalized === '#FFF4D6' || normalized === '#FFF1E2'
      || normalized === '#FFF5E9' || normalized === '#FFF8EA' || normalized === '#FFF8DC') {
      return colors.surfaceSecondary;
    }
    if (normalized === '#E8F6EC' || normalized === '#F0F6F0' || normalized === '#FCE9EB'
      || normalized === '#FCE3EB' || normalized === '#F8DDE5' || normalized === '#EFEEFA'
      || normalized === '#F7F6FB' || normalized === '#E8EAFE') {
      return colors.surfaceSecondary;
    }
  }

  if (property.startsWith('border') && (normalized.startsWith('#F') || normalized.startsWith('#E')
    || normalized === '#DADADD' || normalized === '#333448' || normalized === '#35364A')) return colors.border;
  if (property === 'shadowColor' && normalized !== '#000000') return colors.background;
  return value;
}

export function createThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  definitions: ThemeStyleMap<T>,
  theme: AppTheme,
): T {
  if (!theme.isDark) return definitions;
  Object.entries(definitions).forEach(([styleName, style]) => {
    if (typeof style !== 'object' || style === null) return;
    Object.entries(style).forEach(([property, value]) => {
      if (typeof value === 'string' && isColorProperty(property)) {
        Reflect.set(style, property, remapColor(value, property, styleName, theme));
      }
    });
  });
  return definitions;
}
