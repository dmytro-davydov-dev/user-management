// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders, TEST_USER } from '@/test/render';
import { SignUpForm } from './sign-up-form';

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

async function fill(values: Partial<Record<string, string>> = {}) {
  const user = userEvent.setup();
  const v = {
    'First name': ' Ada ',
    'Last name': 'Lovelace',
    Email: 'Ada@Example.com',
    Password: 'correct horse',
    'Confirm password': 'correct horse',
    ...values,
  };
  for (const [label, value] of Object.entries(v)) {
    if (value) await user.type(screen.getByLabelText(new RegExp(`^${label}`)), value);
  }
  return user;
}

// The label switches to "Creating account…" while pending.
const submit = () => screen.getByRole('button', { name: /creat(e|ing) account/i });

describe('SignUpForm', () => {
  it('C1: password mismatch blocks submit and makes no network call (T6.1)', async () => {
    renderWithProviders(<SignUpForm />);
    const user = await fill({ 'Confirm password': 'different pass' });
    await user.click(submit());

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('C2: shows field validation messages and does not submit', async () => {
    renderWithProviders(<SignUpForm />);
    const user = await fill({
      'First name': '   ',
      Email: 'not-an-email',
      Password: 'short',
      'Confirm password': 'short',
    });
    await user.click(submit());

    expect(await screen.findByText('Invalid email address')).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument(); // whitespace-only first name
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
    expect(screen.getByLabelText(/first name/i)).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits normalised input without confirmPassword, then replaces history (T6.3)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { user: TEST_USER }));
    const { queryClient } = renderWithProviders(<SignUpForm />);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const user = await fill();
    await user.click(submit());

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
    expect(router.push).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me'] });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/auth/sign-up');
    expect(JSON.parse(String(init?.body))).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: 'correct horse',
    });
  });

  it('disables submit while the request is pending', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    renderWithProviders(<SignUpForm />);
    const user = await fill();
    await user.click(submit());

    await waitFor(() => expect(submit()).toBeDisabled());
    // Implicit submission (Enter in a field) is ignored while pending.
    fireEvent.submit(screen.getByRole('form', { name: 'Create account' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(jsonResponse(201, { user: TEST_USER }));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
  });

  it('maps 409 EMAIL_TAKEN onto the email field', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { code: 'EMAIL_TAKEN', message: 'taken' }));
    renderWithProviders(<SignUpForm />);
    const user = await fill();
    await user.click(submit());

    expect(
      await screen.findByText('An account with this email already exists.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(submit()).toBeEnabled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('maps API validation details onto fields and other failures to a form alert', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(400, {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ path: 'lastName', message: 'At most 100 characters' }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(503, { code: 'SERVICE_UNAVAILABLE', message: 'down' }));
    renderWithProviders(<SignUpForm />);
    const user = await fill();

    await user.click(submit());
    expect(await screen.findByText('At most 100 characters')).toBeInTheDocument();

    await user.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/i);
  });
});
