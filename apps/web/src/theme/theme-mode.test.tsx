// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveThemeMode, ThemeModeProvider, useThemeMode } from './theme-mode';
import { ThemeInitScript } from './theme-init-script';

/** Stubs `prefers-color-scheme` (jsdom has no `matchMedia`). */
function stubOsPreference(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((media: string) => ({
      matches: dark && media.includes('dark'),
      media,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

const htmlClasses = () => document.documentElement.className;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  stubOsPreference(false);
});
afterEach(() => vi.unstubAllGlobals());

describe('resolveThemeMode', () => {
  it('uses an explicit choice over the OS preference', () => {
    expect(resolveThemeMode('dark', 'light')).toBe('dark');
    expect(resolveThemeMode('light', 'dark')).toBe('light');
  });

  it('follows the OS preference for `system`', () => {
    expect(resolveThemeMode('system', 'dark')).toBe('dark');
    expect(resolveThemeMode('system', 'light')).toBe('light');
  });

  it('is unknown before mount', () => {
    expect(resolveThemeMode(undefined, undefined)).toBeUndefined();
  });
});

describe('ThemeInitScript (runs before first paint)', () => {
  function runScript() {
    const markup = renderToStaticMarkup(<ThemeInitScript />);
    const source = /<script[^>]*>([\s\S]*)<\/script>/.exec(markup)?.[1];
    expect(source).toBeTruthy();
    new Function(source!)();
  }

  it('applies the stored mode', () => {
    localStorage.setItem('theme', 'dark');
    runScript();
    expect(htmlClasses()).toContain('dark');
  });

  it('falls back to the OS preference when nothing is stored', () => {
    stubOsPreference(true);
    runScript();
    expect(htmlClasses()).toContain('dark');
  });

  it('prefers the stored mode over the OS preference', () => {
    stubOsPreference(true);
    localStorage.setItem('theme', 'light');
    runScript();
    expect(htmlClasses()).toContain('light');
    expect(htmlClasses()).not.toContain('dark');
  });
});

describe('ThemeModeProvider', () => {
  function Probe() {
    const { mode, toggleMode } = useThemeMode();
    return (
      <button type="button" onClick={toggleMode}>
        {mode ?? 'unknown'}
      </button>
    );
  }
  const renderProbe = () =>
    render(
      <ThemeModeProvider>
        <Probe />
      </ThemeModeProvider>,
    );

  it('starts from the stored mode', async () => {
    localStorage.setItem('theme', 'dark');
    renderProbe();
    expect(await screen.findByRole('button', { name: 'dark' })).toBeInTheDocument();
  });

  it('follows the OS preference when nothing is stored', async () => {
    stubOsPreference(true);
    renderProbe();
    expect(await screen.findByRole('button', { name: 'dark' })).toBeInTheDocument();
    // The OS preference is followed, not pinned as an explicit choice.
    expect(localStorage.getItem('theme')).not.toBe('dark');
  });

  it('persists a toggle so it survives a restart', async () => {
    stubOsPreference(true);
    renderProbe();
    await userEvent.click(await screen.findByRole('button', { name: 'dark' }));

    expect(await screen.findByRole('button', { name: 'light' })).toBeInTheDocument();
    expect(localStorage.getItem('theme')).toBe('light');
    await waitFor(() => expect(htmlClasses()).toContain('light'));
  });
});
