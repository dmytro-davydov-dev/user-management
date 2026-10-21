// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import AuthLayout from './layout';
import SignInPage from './sign-in/page';
import SignUpPage from './sign-up/page';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }));

async function axeViolations(container: Element) {
  // axe moves focus while it inspects; let React flush the resulting form-state updates.
  const results = await act(() =>
    axe.run(container, {
      // jsdom has no layout engine, so contrast cannot be computed here.
      rules: { 'color-contrast': { enabled: false } },
    }),
  );
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(', ')}`);
}

describe('auth pages (T6.4)', () => {
  it('sign-up: labelled inputs, autocomplete hints, link to sign-in, no axe violations', async () => {
    const { container } = renderWithProviders(
      <AuthLayout>
        <SignUpPage />
      </AuthLayout>,
    );

    const expected: Record<string, string> = {
      'First name': 'given-name',
      'Last name': 'family-name',
      Email: 'email',
      Password: 'new-password',
      'Confirm password': 'new-password',
    };
    for (const [label, autocomplete] of Object.entries(expected)) {
      expect(screen.getByLabelText(new RegExp(`^${label}`))).toHaveAttribute(
        'autocomplete',
        autocomplete,
      );
    }
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
    expect(screen.getByRole('button', { name: 'Create account' })).toHaveAttribute(
      'type',
      'submit',
    );
    expect(await axeViolations(container)).toEqual([]);
  });

  it('sign-in: labelled inputs, autocomplete hints, link to sign-up, no axe violations', async () => {
    const { container } = renderWithProviders(
      <AuthLayout>
        <SignInPage />
      </AuthLayout>,
    );

    expect(screen.getByLabelText(/^email/i)).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/sign-up');
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveAttribute('type', 'submit');
    expect(await axeViolations(container)).toEqual([]);
  });
});
