// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '@um/shared';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { buildUpdate, EditUserDialog } from './edit-user-dialog';

const base: User = {
  id: '6f1c2b8e-3c1a-4d0e-9f53-2b1f8f7f4a10',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  status: 'ACTIVE',
  loginsCount: 3,
  createdAt: '2026-01-02T03:04:05.000Z',
  updatedAt: '2026-02-02T03:04:05.000Z',
};

function renderDialog(user: User, isSelf = false) {
  const props = { onClose: vi.fn(), onSaved: vi.fn(), onGone: vi.fn() };
  renderWithProviders(<EditUserDialog user={user} isSelf={isSelf} {...props} />);
  return props;
}

async function chooseStatus(label: 'Active' | 'Inactive') {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: /status/i }));
  await user.click(await screen.findByRole('option', { name: label }));
}

describe('EditUserDialog (T7.5, C5)', () => {
  it('disables names for an INACTIVE user and re-enables them live when set to Active', async () => {
    renderDialog({ ...base, status: 'INACTIVE' });
    const first = screen.getByLabelText(/^First name/);
    const last = screen.getByLabelText(/^Last name/);
    expect(first).toBeDisabled();
    expect(last).toBeDisabled();
    expect(screen.getByText(/can’t be renamed/)).toBeInTheDocument();

    await chooseStatus('Active');
    expect(first).toBeEnabled();
    expect(last).toBeEnabled();
    expect(screen.queryByText(/can’t be renamed/)).not.toBeInTheDocument();
  });

  it('switching an active user to Inactive disables names and discards unsaved edits', async () => {
    renderDialog(base);
    const user = userEvent.setup();
    const first = screen.getByLabelText(/^First name/);
    await user.clear(first);
    await user.type(first, 'Changed');

    await chooseStatus('Inactive');
    expect(first).toBeDisabled();
    expect(first).toHaveValue('Ada');
  });

  it('shows email and createdAt read-only', () => {
    renderDialog(base);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Email')).toHaveAttribute('readonly');
    const created = within(dialog).getByLabelText('Created');
    expect(created).toHaveAttribute('readonly');
    expect((created as HTMLInputElement).value).not.toBe('');
  });

  it('warns before you deactivate yourself (T7.8)', async () => {
    renderDialog(base, true);
    expect(screen.queryByText(/deactivating your own account/)).not.toBeInTheDocument();
    await chooseStatus('Inactive');
    expect(screen.getByText(/deactivating your own account/)).toHaveTextContent(
      'You stay signed in until you sign out',
    );
  });
});

describe('buildUpdate', () => {
  const values = (v: Partial<User>) => ({
    firstName: base.firstName,
    lastName: base.lastName,
    status: base.status,
    ...v,
  });

  it('returns only changed fields', () => {
    expect(buildUpdate(base, values({}))).toEqual({});
    expect(buildUpdate(base, values({ lastName: 'King' }))).toEqual({ lastName: 'King' });
  });

  it('never sends names when the result is INACTIVE', () => {
    expect(buildUpdate(base, values({ status: 'INACTIVE', firstName: 'X' }))).toEqual({
      status: 'INACTIVE',
    });
  });

  it('reactivating and renaming go in one request (API applies status first)', () => {
    const inactive = { ...base, status: 'INACTIVE' as const };
    expect(buildUpdate(inactive, values({ status: 'ACTIVE', firstName: 'Augusta' }))).toEqual({
      status: 'ACTIVE',
      firstName: 'Augusta',
    });
  });
});
