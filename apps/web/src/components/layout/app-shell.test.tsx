// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '@um/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { router } from '@/test/navigation';
import { renderWithProviders, TEST_USER } from '@/test/render';
import { AppShell } from './app-shell';

vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationMock);

describe('AppShell', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    router.replace.mockClear();
  });

  it('greets the signed-in user by first name', () => {
    renderWithProviders(<AppShell user={TEST_USER as User}>content</AppShell>);
    expect(screen.getByTestId('greeting')).toHaveTextContent('Hello, Ada');
  });

  it('signs out and returns to the sign-in page', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    renderWithProviders(<AppShell user={TEST_USER as User}>content</AppShell>);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in'));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/sign-out'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
