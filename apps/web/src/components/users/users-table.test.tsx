// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import userEvent from '@testing-library/user-event';
import type { User } from '@um/shared';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { makeUsers } from '@/test/users-api';
import { UserCardList, UsersTable } from './users-table';

const users: User[] = makeUsers(3).map((u, i) => (i === 1 ? { ...u, status: 'INACTIVE' } : u));
const ME_ID = users[0]!.id;

/** `null` renders the loading state (`users: undefined`). */
function renderCards(list: User[] | null = users) {
  const handlers = { onEdit: vi.fn(), onDelete: vi.fn() };
  const view = renderWithProviders(
    <UserCardList users={list ?? undefined} currentUserId={ME_ID} {...handlers} />,
  );
  return { ...view, ...handlers };
}
const cards = () => within(screen.getByRole('list', { name: 'Users' })).getAllByRole('listitem');

describe('UserCardList (narrow screens, T8.3)', () => {
  it('renders one card per user with every table field', () => {
    renderCards();
    expect(cards()).toHaveLength(3);

    const first = screen.getByRole('listitem', { name: 'User 1' });
    expect(within(first).getByText('You')).toBeInTheDocument();
    expect(within(first).getByText('Active')).toBeInTheDocument();
    expect(within(first).getByText('user1@example.com')).toBeInTheDocument();
    expect(within(first).getByText('Logins')).toBeInTheDocument();
    expect(within(first).getByText('Created')).toBeInTheDocument();
    expect(within(first).getByText('Updated')).toBeInTheDocument();
    expect(first.querySelectorAll('time')).toHaveLength(2);

    const second = screen.getByRole('listitem', { name: 'User 2' });
    expect(within(second).getByText('Inactive')).toBeInTheDocument();
    expect(within(second).queryByText('You')).not.toBeInTheDocument();
  });

  it('wires edit and delete to the right user', async () => {
    const { onEdit, onDelete } = renderCards();
    await userEvent.click(screen.getByRole('button', { name: 'Edit User 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete User 3' }));
    expect(onEdit).toHaveBeenCalledWith(users[1]);
    expect(onDelete).toHaveBeenCalledWith(users[2]);
  });

  it('shows six busy skeleton cards while loading', () => {
    renderCards(null);
    expect(screen.getByRole('list', { name: 'Users' })).toHaveAttribute('aria-busy', 'true');
    expect(cards()).toHaveLength(6);
  });

  it('has no axe violations', async () => {
    const { container } = renderCards();
    const results = await act(() =>
      axe.run(container, { rules: { 'color-contrast': { enabled: false } } }),
    );
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('UsersTable layout switch', () => {
  it('shows the table by default and hides the cards (cards only below 600 px)', () => {
    renderWithProviders(
      <UsersTable users={users} currentUserId={ME_ID} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );
    // jsdom ignores media queries, so this is the desktop (base) layout.
    expect(screen.getByRole('table', { name: 'Users' })).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Users' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Users', hidden: true })).not.toBeVisible();
  });
});
