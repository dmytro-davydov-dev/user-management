// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import userEvent from '@testing-library/user-event';
import type { User } from '@um/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { router, setUrl, syncHistory } from '@/test/navigation';
import { renderWithProviders } from '@/test/render';
import { installUsersApi, makeUsers } from '@/test/users-api';
import { UsersDashboard } from './users-dashboard';

vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationMock);

const ME = makeUsers(1, Date.parse('2026-09-01T00:00:00Z'))[0]!;
const ME_ID = '11111111-1111-4111-8111-111111111111';
const me: User = {
  ...ME,
  id: ME_ID,
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
};

beforeEach(() => {
  syncHistory();
  setUrl('/dashboard');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const render = () => renderWithProviders(<UsersDashboard currentUserId={ME_ID} />);
// `hidden: true`: an open dialog marks the page behind it aria-hidden.
const table = () => screen.getByRole('table', { name: 'Users', hidden: true });
/** Data rows only (the header row has column headers, not a row header). */
const rows = () =>
  within(table())
    .getAllByRole('row', { hidden: true })
    .filter((row) => within(row).queryByRole('rowheader', { hidden: true }));
const rowNames = () =>
  rows().map((row) => within(row).getByRole('rowheader', { hidden: true }).textContent);
const waitForRows = async (count: number) => waitFor(() => expect(rows()).toHaveLength(count));

describe('UsersDashboard: table and pagination (T7.2)', () => {
  it('C3: 13 users → pages of 6 / 6 / 1, page kept in ?page=', async () => {
    installUsersApi(makeUsers(13));
    const user = userEvent.setup();
    render();

    await waitForRows(6);
    expect(screen.getByText('1–6 of 13 users')).toBeInTheDocument();
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('button', { name: 'page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('button', { name: 'Go to page 3' })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'Go to page 4' })).not.toBeInTheDocument();

    const first = rows()[0]!;
    expect(within(first).getByText('user1@example.com')).toBeInTheDocument();
    expect(within(first).getByText('Active')).toBeInTheDocument();
    expect(first.querySelectorAll('time')).toHaveLength(2);

    await user.click(within(nav).getByRole('button', { name: 'Go to page 2' }));
    await waitFor(() => expect(rowNames()[0]).toBe('User 7'));
    expect(rows()).toHaveLength(6);
    expect(window.location.search).toBe('?page=2');

    await user.click(within(nav).getByRole('button', { name: 'Go to page 3' }));
    await waitFor(() => expect(rowNames()).toEqual(['User 13']));
    expect(screen.getByText('13–13 of 13 users')).toBeInTheDocument();
  });

  it('reads the initial page from the URL and moves a page past the end to the last page', async () => {
    installUsersApi(makeUsers(13));
    setUrl('/dashboard?page=9');
    render();

    await waitFor(() => expect(window.location.search).toBe('?page=3'));
    await waitFor(() => expect(rowNames()).toEqual(['User 13']));
  });

  it('treats an invalid ?page= as page 1', async () => {
    const api = installUsersApi(makeUsers(3));
    setUrl('/dashboard?page=abc');
    render();
    await waitForRows(3);
    expect(String(api.calls('GET')[0]?.[0])).toBe('/api/users?page=1');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument(); // single page
  });

  it('has no axe violations with data and pagination', async () => {
    installUsersApi(makeUsers(8));
    const { container } = render();
    await waitForRows(6);
    const results = await act(() =>
      axe.run(container, { rules: { 'color-contrast': { enabled: false } } }),
    );
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  it('marks your own row', async () => {
    installUsersApi([me, ...makeUsers(2)]);
    render();
    await waitForRows(3);
    expect(within(rows()[0]!).getByText('You')).toBeInTheDocument();
  });
});

describe('UsersDashboard: loading, empty and error states (T7.3, C4)', () => {
  it('shows skeleton rows while loading', async () => {
    const api = installUsersApi(makeUsers(2));
    const release = api.hold();
    render();
    expect(screen.getAllByTestId('users-skeleton-row')).toHaveLength(6);
    expect(table()).toHaveAttribute('aria-busy', 'true');
    release();
    await waitForRows(2);
    expect(screen.queryByTestId('users-skeleton-row')).not.toBeInTheDocument();
  });

  it('shows an empty state with a create action', async () => {
    installUsersApi([]);
    render();
    expect(await screen.findByText('No users yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New user' })).toHaveLength(2);
  });

  it('shows an error with a working retry', async () => {
    const api = installUsersApi(makeUsers(2));
    // 4xx is not auto-retried, so one failure reaches the UI immediately.
    api.failNext('GET', { status: 400, body: { code: 'VALIDATION_ERROR', message: 'Bad page' } });
    const user = userEvent.setup();
    render();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t load users');
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitForRows(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('UsersDashboard: create (T7.4)', () => {
  it('creates a user, returns to page 1 and shows it there', async () => {
    const api = installUsersApi(makeUsers(8));
    setUrl('/dashboard?page=2');
    const user = userEvent.setup();
    render();
    await waitForRows(2);

    await user.click(screen.getByRole('button', { name: 'New user' }));
    const dialog = await screen.findByRole('dialog', { name: 'New user' });
    await user.type(within(dialog).getByLabelText(/^First name/), 'Grace');
    await user.type(within(dialog).getByLabelText(/^Last name/), 'Hopper');
    await user.type(within(dialog).getByLabelText(/^Email/), 'Grace@Example.com');
    await user.type(within(dialog).getByLabelText(/^Password/), 'cobol-1959');
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(JSON.parse(String(api.calls('POST', '/api/users')[0]?.[1]?.body))).toEqual({
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.com',
      password: 'cobol-1959',
      status: 'ACTIVE',
    });
    expect(window.location.search).toBe('');
    await waitFor(() => expect(rowNames()[0]).toBe('Grace Hopper'));
    expect(screen.getByText('Created Grace Hopper')).toBeInTheDocument();
  });

  it('validates before sending and maps 409 onto the email field', async () => {
    const api = installUsersApi(makeUsers(1));
    api.failNext('POST', { status: 409, body: { code: 'EMAIL_TAKEN', message: 'taken' } });
    const user = userEvent.setup();
    render();
    await waitForRows(1);

    await user.click(screen.getByRole('button', { name: 'New user' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));
    // First name, last name and email (the password shows its length rule).
    expect(await within(dialog).findAllByText('Required')).toHaveLength(3);
    expect(api.calls('POST')).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/^First name/), 'A');
    await user.type(within(dialog).getByLabelText(/^Last name/), 'B');
    await user.type(within(dialog).getByLabelText(/^Email/), 'user1@example.com');
    await user.type(within(dialog).getByLabelText(/^Password/), 'password-1');
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));

    expect(
      await within(dialog).findByText('An account with this email already exists.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('UsersDashboard: edit (T7.5)', () => {
  it('sends only changed fields and refreshes the row', async () => {
    const api = installUsersApi(makeUsers(2));
    const user = userEvent.setup();
    render();
    await waitForRows(2);

    await user.click(screen.getByRole('button', { name: 'Edit User 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit user' });
    const first = within(dialog).getByLabelText(/^First name/);
    await user.clear(first);
    await user.type(first, 'Renamed');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(rowNames()[0]).toBe('Renamed 1'));
    expect(JSON.parse(String(api.calls('PATCH')[0]?.[1]?.body))).toEqual({ firstName: 'Renamed' });
    expect(router.refresh).not.toHaveBeenCalled(); // not yourself
  });

  it('closes without a request when nothing changed', async () => {
    const api = installUsersApi(makeUsers(1));
    const user = userEvent.setup();
    render();
    await waitForRows(1);
    await user.click(screen.getByRole('button', { name: 'Edit User 1' }));
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.calls('PATCH')).toHaveLength(0);
  });

  it('refreshes the server-rendered app bar after renaming yourself', async () => {
    installUsersApi([me]);
    const user = userEvent.setup();
    render();
    await waitForRows(1);
    await user.click(screen.getByRole('button', { name: 'Edit Ada Lovelace' }));
    const last = within(await screen.findByRole('dialog')).getByLabelText(/^Last name/);
    await user.clear(last);
    await user.type(last, 'King');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it('shows the API’s USER_INACTIVE refusal as a form error', async () => {
    const api = installUsersApi(makeUsers(1));
    api.failNext('PATCH', { status: 403, body: { code: 'USER_INACTIVE', message: 'inactive' } });
    const user = userEvent.setup();
    render();
    await waitForRows(1);
    await user.click(screen.getByRole('button', { name: 'Edit User 1' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Last name/), 'x');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/can’t be renamed/);
  });
});

describe('UsersDashboard: delete (T7.6, T7.7)', () => {
  it('C6: requires confirmation; cancel sends nothing', async () => {
    const api = installUsersApi(makeUsers(2));
    const user = userEvent.setup();
    render();
    await waitForRows(2);

    await user.click(screen.getByRole('button', { name: 'Delete User 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete User 1?' });
    expect(within(dialog).getByText(/user1@example.com/)).toBeInTheDocument();
    expect(api.calls('DELETE')).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.calls('DELETE')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Delete User 1' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() => expect(rowNames()).toEqual(['User 2']));
    expect(api.calls('DELETE')).toHaveLength(1);
    expect(screen.getByText('Deleted User 1')).toBeInTheDocument();
  });

  it('deleting the last row of a page moves to the previous page', async () => {
    installUsersApi(makeUsers(7));
    setUrl('/dashboard?page=2');
    const user = userEvent.setup();
    render();
    await waitFor(() => expect(rowNames()).toEqual(['User 7']));

    await user.click(screen.getByRole('button', { name: 'Delete User 7' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() => expect(window.location.search).toBe(''));
    await waitForRows(6);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('a failed mutation leaves the table unchanged (T7.7)', async () => {
    const api = installUsersApi(makeUsers(2));
    api.failNext('DELETE', { status: 500, body: { code: 'INTERNAL_ERROR', message: 'boom' } });
    const user = userEvent.setup();
    render();
    await waitForRows(2);
    const listCalls = api.calls('GET').length;

    await user.click(screen.getByRole('button', { name: 'Delete User 1' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Couldn’t delete');
    expect(rowNames()).toEqual(['User 1', 'User 2']);
    expect(api.calls('GET')).toHaveLength(listCalls); // no refetch, no optimistic removal
  });

  it('deleting yourself signs you out (T7.8)', async () => {
    const api = installUsersApi([me, ...makeUsers(1)]);
    const user = userEvent.setup();
    render();
    await waitForRows(2);

    await user.click(screen.getByRole('button', { name: 'Delete Ada Lovelace' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' });
    expect(dialog).toHaveTextContent('you will be signed out');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in'));
    expect(api.calls('POST', '/api/auth/sign-out')).toHaveLength(1);
  });
});

describe('UsersDashboard: dialog focus (T8.4)', () => {
  it('focuses the first useful control when each dialog opens', async () => {
    installUsersApi(makeUsers(2));
    const user = userEvent.setup();
    render();
    await waitForRows(2);

    await user.click(screen.getByRole('button', { name: 'New user' }));
    let dialog = await screen.findByRole('dialog', { name: 'New user' });
    expect(within(dialog).getByLabelText(/^First name/)).toHaveFocus();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Edit User 1' }));
    dialog = await screen.findByRole('dialog', { name: 'Edit user' });
    expect(within(dialog).getByRole('combobox', { name: /^Status/ })).toHaveFocus();
    await user.keyboard('{Escape}');

    // Destructive dialog: the safe choice is focused, so Enter doesn't delete.
    await user.click(screen.getByRole('button', { name: 'Delete User 1' }));
    dialog = await screen.findByRole('dialog', { name: 'Delete User 1?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('returns focus to the button that opened the dialog', async () => {
    installUsersApi(makeUsers(2));
    const user = userEvent.setup();
    render();
    await waitForRows(2);

    const edit = screen.getByRole('button', { name: 'Edit User 2' });
    await user.click(edit);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(edit).toHaveFocus();

    const remove = screen.getByRole('button', { name: 'Delete User 2' });
    await user.click(remove);
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(remove).toHaveFocus();
  });

  it('moves focus to the heading once the deleted row is gone', async () => {
    installUsersApi(makeUsers(2));
    const user = userEvent.setup();
    render();
    await waitForRows(2);

    await user.click(screen.getByRole('button', { name: 'Delete User 1' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() => expect(rowNames()).toEqual(['User 2']));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toHaveFocus(),
    );
  });
});
