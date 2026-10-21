// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders, TEST_USER } from '@/test/render';
import { SignInForm } from './sign-in-form';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** Types credentials and submits with Enter (keyboard submit, T6.4). */
async function signInWith(email = 'ada@example.com', password = 'correct horse') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^email/i), email);
  await user.type(screen.getByLabelText(/^password/i), `${password}{Enter}`);
  return user;
}

describe('SignInForm', () => {
  it('submits on Enter and replaces history with /dashboard (T6.3, T6.4)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { user: TEST_USER }));
    renderWithProviders(<SignInForm />);
    await signInWith(' Ada@Example.com ');

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
    expect(router.push).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/auth/sign-in');
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'ada@example.com',
      password: 'correct horse',
    });
  });

  it('401 renders the generic invalid-credentials message and clears the password (T6.2)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }),
    );
    renderWithProviders(<SignInForm />);
    await signInWith();

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(screen.getByLabelText(/^password/i)).toHaveValue('');
    expect(screen.getByLabelText(/^password/i)).toHaveFocus();
    expect(screen.getByLabelText(/^email/i)).toHaveValue('ada@example.com');
    // Wrong credentials are not an expired session: no redirect.
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('403 renders the account-inactive message (T6.2)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, { code: 'USER_INACTIVE', message: 'User is inactive' }),
    );
    renderWithProviders(<SignInForm />);
    await signInWith();

    expect(await screen.findByRole('alert')).toHaveTextContent(/account is inactive/i);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
  });

  it('C2: validates fields before any request', async () => {
    renderWithProviders(<SignInForm />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid email address')).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('network failure shows a retryable message', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    renderWithProviders(<SignInForm />);
    await signInWith();

    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/i);
  });
});
