// @vitest-environment jsdom
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiClientError } from './api-client';
import { createQueryClient } from './query';
import { UnauthorizedRedirect } from './unauthorized-redirect';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function Harness({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <UnauthorizedRedirect />
      {children}
    </QueryClientProvider>
  );
}

function UsersProbe() {
  const query = useQuery({ queryKey: ['users', 1], queryFn: () => apiClient.users.list(1) });
  return <p>{query.status}</p>;
}

describe('apiClient (T5.5)', () => {
  it('a 401 UNAUTHORIZED from any query lands on /sign-in', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(401, { code: 'UNAUTHORIZED', message: 'expired' }));
    vi.stubGlobal('fetch', fetchMock);

    render(<UsersProbe />, { wrapper: Harness });

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in'));
    // 4xx is final: no retries.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/users?page=1');
  });

  it('does not redirect on wrong credentials (401 INVALID_CREDENTIALS)', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(json(401, { code: 'INVALID_CREDENTIALS', message: 'Invalid' })),
    );
    render(<Harness>{null}</Harness>);
    const error = await apiClient.auth
      .signIn({ email: 'a@b.co', password: 'x' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('sends JSON bodies to the BFF and returns parsed data', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(200, { id: 'u1' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiClient.users.update('u1', { firstName: 'Ada' })).resolves.toEqual({
      id: 'u1',
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/users/u1');
    expect(init).toMatchObject({ method: 'PATCH', body: '{"firstName":"Ada"}' });
  });

  it('returns undefined for 204 and maps network failures to SERVICE_UNAVAILABLE', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockRejectedValueOnce(new TypeError('offline')),
    );
    await expect(apiClient.users.delete('u1')).resolves.toBeUndefined();
    await expect(apiClient.users.list(1)).rejects.toMatchObject({
      status: 0,
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('falls back to a generic error for non-JSON failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>', { status: 502 })),
    );
    await expect(apiClient.users.list(1)).rejects.toMatchObject({
      status: 502,
      code: 'INTERNAL_ERROR',
    });
  });
});
