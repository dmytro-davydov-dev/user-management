import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bffRequest,
  jsonResponse,
  mockUpstream,
  SESSION_ID,
  setCookies,
  upstreamCall,
  USER,
} from '@/test/bff';
import { DELETE, GET, PATCH, POST } from './route';

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('BFF proxy /api/[...path] (T5.2)', () => {
  it('forwards to API_INTERNAL_URL with X-Session-Id from the cookie, never the cookie itself', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api:4000');
    const page = { data: [USER], pagination: { page: 2, limit: 6, total: 7, totalPages: 2 } };
    const fetchMock = mockUpstream(jsonResponse(200, page));

    const res = await GET(bffRequest('/api/users?page=2', { sessionId: SESSION_ID }), ctx('users'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(page);
    const { url, init, headers } = upstreamCall(fetchMock);
    expect(url).toBe('http://api:4000/users?page=2');
    expect(init.method).toBe('GET');
    expect(headers.get('x-session-id')).toBe(SESSION_ID);
    expect(headers.has('cookie')).toBe(false);
  });

  it('forwards method and JSON body for mutations and relays status + body', async () => {
    const fetchMock = mockUpstream(jsonResponse(200, { ...USER, firstName: 'Augusta' }));
    const req = bffRequest(`/api/users/${USER.id}`, {
      method: 'PATCH',
      body: { firstName: 'Augusta' },
      sessionId: SESSION_ID,
    });
    const res = await PATCH(req, ctx('users', USER.id));
    expect(res.status).toBe(200);
    const { url, init, headers } = upstreamCall(fetchMock);
    expect(url).toBe(`http://localhost:4000/users/${USER.id}`);
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe('{"firstName":"Augusta"}');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('relays API errors unchanged', async () => {
    const error = { code: 'EMAIL_TAKEN', message: 'Email is already registered' };
    mockUpstream(jsonResponse(409, error));
    const req = bffRequest('/api/users', { method: 'POST', body: {}, sessionId: SESSION_ID });
    const res = await POST(req, ctx('users'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(error);
  });

  it('relays 204 without a body', async () => {
    mockUpstream(new Response(null, { status: 204 }));
    const req = bffRequest(`/api/users/${USER.id}`, { method: 'DELETE', sessionId: SESSION_ID });
    const res = await DELETE(req, ctx('users', USER.id));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('answers 401 without calling the API when there is no session cookie', async () => {
    const fetchMock = mockUpstream();
    const res = await GET(bffRequest('/api/users'), ctx('users'));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the cookie when the API rejects the session', async () => {
    mockUpstream(jsonResponse(401, { code: 'UNAUTHORIZED', message: 'expired' }));
    const res = await GET(bffRequest('/api/users', { sessionId: SESSION_ID }), ctx('users'));
    expect(res.status).toBe(401);
    expect(setCookies(res).get('sid')).toMatch(/Max-Age=0/);
  });

  it.each([
    [['auth', 'me']],
    [['sessions']],
    [['sessions', SESSION_ID]],
    [['users', '..', 'auth', 'me']],
    [['health']],
  ])('does not proxy %j (session-bearing or unknown routes) → 404', async (path) => {
    const fetchMock = mockUpstream();
    const res = await GET(
      bffRequest(`/api/${path.join('/')}`, { sessionId: SESSION_ID }),
      ctx(...path),
    );
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects cross-site mutations with 403', async () => {
    const fetchMock = mockUpstream();
    const crossOrigin = bffRequest('/api/users', {
      method: 'POST',
      body: {},
      sessionId: SESSION_ID,
      headers: { origin: 'https://evil.example' },
    });
    expect((await POST(crossOrigin, ctx('users'))).status).toBe(403);
    const crossSite = bffRequest(`/api/users/${USER.id}`, {
      method: 'DELETE',
      sessionId: SESSION_ID,
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect((await DELETE(crossSite, ctx('users', USER.id))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows same-origin mutations', async () => {
    mockUpstream(jsonResponse(201, USER));
    const req = bffRequest('/api/users', {
      method: 'POST',
      body: {},
      sessionId: SESSION_ID,
      headers: { origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' },
    });
    expect((await POST(req, ctx('users'))).status).toBe(201);
  });

  it('maps an unreachable API to 503', async () => {
    mockUpstream(new TypeError('fetch failed'));
    const res = await GET(bffRequest('/api/users', { sessionId: SESSION_ID }), ctx('users'));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});
