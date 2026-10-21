import { useSyncExternalStore } from 'react';
import { vi } from 'vitest';

/**
 * `next/navigation` stand-in for component tests. `useSearchParams` follows
 * `window.location`, and `history.pushState`/`replaceState` notify it, like Next.js does.
 *
 * Usage: `vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationMock)`
 */
export const router = {
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
let patched = false;

/** Patches the History API once per test file so URL changes re-render subscribers. */
export function syncHistory(): void {
  if (patched) return;
  patched = true;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (...args: Parameters<History['pushState']>) => {
      original(...args);
      notify();
    };
  }
  window.addEventListener('popstate', notify);
}

/** Sets the current URL (path + search) without adding a history entry. */
export function setUrl(path: string): void {
  window.history.replaceState(null, '', path);
}

function useSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => window.location.search,
  );
  return new URLSearchParams(search);
}

export const navigationMock = {
  useRouter: () => router,
  useSearchParams,
  usePathname: () => window.location.pathname,
};
