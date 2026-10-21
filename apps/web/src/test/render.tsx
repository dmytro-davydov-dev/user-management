import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createQueryClient } from '@/lib/client/query';
import { ThemeModeProvider } from '@/theme/theme-mode';

/** Renders with the app's client providers (theme + a fresh query client). */
export function renderWithProviders(
  ui: ReactElement,
  queryClient: QueryClient = createQueryClient(),
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ThemeModeProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ThemeModeProvider>
    );
  }
  return { ...render(ui, { wrapper: Wrapper }), queryClient };
}

export const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const TEST_USER = {
  id: '0f8b7a3e-2c1d-4e5f-8a9b-1c2d3e4f5a6b',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  status: 'ACTIVE',
  loginsCount: 1,
  createdAt: '2026-10-21T08:00:00.000Z',
  updatedAt: '2026-10-21T08:00:00.000Z',
} as const;
