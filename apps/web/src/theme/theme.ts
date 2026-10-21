import { createTheme } from '@mui/material/styles';

export type ThemeMode = 'light' | 'dark';

/**
 * Shared by `ThemeProvider` and the pre-paint `InitColorSchemeScript`, so both read and
 * write the same storage keys and toggle the same class on `<html>`.
 */
export const THEME_CONFIG = {
  /** localStorage key holding the chosen mode: `light`, `dark` or `system`. */
  modeStorageKey: 'theme',
  colorSchemeStorageKey: 'theme-color-scheme',
  /** Nothing stored yet → follow the OS (`prefers-color-scheme`). */
  defaultMode: 'system',
  /** `<html class="dark">`; must match `cssVariables.colorSchemeSelector` below. */
  attribute: 'class',
} as const;

const FONT_STACK = [
  'Inter',
  'system-ui',
  '-apple-system',
  '"Segoe UI"',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
].join(',');

/**
 * One theme with both color schemes as CSS variables. The server renders the same markup
 * for either mode; the class on `<html>` (set before first paint) picks the palette, so a
 * reload never flashes the wrong theme.
 */
export const appTheme = createTheme({
  cssVariables: { colorSchemeSelector: THEME_CONFIG.attribute },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#2f5bd3' },
        secondary: { main: '#11806a' },
        background: { default: '#f5f6f8', paper: '#ffffff' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#7aa2ff' },
        secondary: { main: '#5fd3b8' },
        background: { default: '#0f1218', paper: '#161a22' },
      },
    },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: FONT_STACK,
    h1: { fontSize: '1.75rem', fontWeight: 650 },
    h2: { fontSize: '1.375rem', fontWeight: 650 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiAppBar: { defaultProps: { elevation: 0, color: 'default' } },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
    MuiButton: { defaultProps: { disableElevation: true } },
  },
});
