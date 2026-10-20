import { NextRequest } from 'next/server';
import { vi } from 'vitest';

export const SESSION_ID = '0b6f9c3e-6d2a-4f61-8a57-3c9e1d2f4b80';
export const USER = {
  id: '6f1c2b8e-3c1a-4d0e-9f53-2b1f8f7f4a10',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  status: 'ACTIVE',
  loginsCount: 1,
  createdAt: '2026-10-20T17:00:00.000Z',
  updatedAt: '2026-10-20T17:00:00.000Z',
} as const;

interface RequestOptions {
  method?: string;
  body?: unknown;
  sessionId?: string;
  headers?: Record<string, string>;
}

export function bffRequest(path: string, options: RequestOptions = {}): NextRequest {
  const headers = new Headers({ host: 'localhost:3000', ...options.headers });
  if (options.sessionId) headers.set('cookie', `sid=${options.sessionId}; theme=dark`);
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  return new NextRequest(`http://localhost:3000${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Replaces global fetch (the BFF → API hop) with a mock; returns it for assertions. */
export function mockUpstream(...responses: Array<Response | Error>) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The URL and init of the n-th upstream call. */
export function upstreamCall(fetchMock: ReturnType<typeof mockUpstream>, index = 0) {
  const call = fetchMock.mock.calls[index];
  if (!call) throw new Error(`No upstream call #${index}`);
  const [input, init] = call;
  return { url: String(input), init: init ?? {}, headers: new Headers(init?.headers) };
}

/** Parses Set-Cookie headers into name → raw attribute string. */
export function setCookies(response: Response): Map<string, string> {
  return new Map(
    response.headers.getSetCookie().map((cookie) => [cookie.split('=')[0] ?? '', cookie]),
  );
}
