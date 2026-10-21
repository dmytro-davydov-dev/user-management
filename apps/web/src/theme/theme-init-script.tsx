import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import { THEME_CONFIG } from './theme';

/**
 * Inline script for the top of `<body>`: reads the stored mode (or the OS preference) and
 * sets the class on `<html>` before the first paint, so there is no flash of the wrong theme.
 */
export function ThemeInitScript() {
  return (
    <InitColorSchemeScript
      attribute={THEME_CONFIG.attribute}
      defaultMode={THEME_CONFIG.defaultMode}
      modeStorageKey={THEME_CONFIG.modeStorageKey}
      colorSchemeStorageKey={THEME_CONFIG.colorSchemeStorageKey}
    />
  );
}
