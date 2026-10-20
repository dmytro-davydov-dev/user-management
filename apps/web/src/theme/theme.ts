import { createTheme, type Theme } from '@mui/material/styles';

export type ThemeMode = 'light' | 'dark';

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

export function createAppTheme(mode: ThemeMode): Theme {
  const dark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: dark ? '#7aa2ff' : '#2f5bd3' },
      secondary: { main: dark ? '#5fd3b8' : '#11806a' },
      background: dark
        ? { default: '#0f1218', paper: '#161a22' }
        : { default: '#f5f6f8', paper: '#ffffff' },
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
}
