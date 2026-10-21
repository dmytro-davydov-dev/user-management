'use client';

import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, useColorScheme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { appTheme, THEME_CONFIG, type ThemeMode } from './theme';

/**
 * Light/dark MUI theme. The choice is persisted in localStorage (`theme`) and synced across
 * tabs by MUI; with nothing stored it follows `prefers-color-scheme`.
 */
export function ThemeModeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      theme={appTheme}
      defaultMode={THEME_CONFIG.defaultMode}
      modeStorageKey={THEME_CONFIG.modeStorageKey}
      colorSchemeStorageKey={THEME_CONFIG.colorSchemeStorageKey}
      disableTransitionOnChange
    >
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}

/** Resolves a stored preference (`system` included) to the mode actually shown. */
export function resolveThemeMode(
  mode: ThemeMode | 'system' | undefined,
  systemMode: ThemeMode | undefined,
): ThemeMode | undefined {
  return mode === 'system' ? systemMode : mode;
}

interface ThemeModeValue {
  /** `undefined` until mounted: the server can't know the stored or OS preference. */
  mode: ThemeMode | undefined;
  toggleMode: () => void;
}

export function useThemeMode(): ThemeModeValue {
  const { mode: stored, systemMode, setMode } = useColorScheme();
  const mode = resolveThemeMode(stored, systemMode);
  return {
    mode,
    // An explicit choice replaces `system` and is what gets persisted.
    toggleMode: () => setMode(mode === 'dark' ? 'light' : 'dark'),
  };
}
