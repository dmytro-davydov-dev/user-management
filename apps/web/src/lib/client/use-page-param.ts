'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/** `?page=` as a positive integer; anything else (missing, 0, "abc", 1.5) is page 1. */
export function parsePage(raw: string | null): number {
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export type SetPage = (page: number, options?: { replace?: boolean }) => void;

/**
 * The current page lives in the URL so it survives reloads and Back/Forward. Updates use the
 * native History API, which Next.js syncs into `useSearchParams` without a server round trip.
 * Page 1 is the bare URL.
 */
export function usePageParam(): [number, SetPage] {
  const searchParams = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const setPage = useCallback<SetPage>((next, { replace = false } = {}) => {
    const url = new URL(window.location.href);
    if (next <= 1) url.searchParams.delete('page');
    else url.searchParams.set('page', String(next));
    if (url.href === window.location.href) return;
    window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
  }, []);
  return [page, setPage];
}
