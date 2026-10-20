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
import { GET as clearSession } from './clear-session/route';
import { GET as me } from './me/route';
import { POST as signIn } from './sign-in/route';
import { POST as signOut } from './sign-out/route';
import { POST as signUp } from './sign-up/route';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const credentials = { email: 'ada@example.com', password: 'correct-horse' };

describe('BFF auth routes (T5.3)', () => {
  it('sign-in moves the session ID into an HttpOnly cookie and returns the user only', async () => {
    const fetchMock = mockUpstream(jsonResponse(200, { id: SESSION_ID, user: USER }));
    const res = await signIn(
      bffRequest('/api/auth/sign-in', { method: 'POST', body: credentials }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ user: USER });
    expect(JSON.stringify(body)).not.toContain(SESSION_ID);

    const cookie = setCookies(res).get('sid');
    expect(cookie).toContain(`sid=${SESSION_ID}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=86400/);
    expect(cookie).not.toMatch(/Secure/i);

    const { url, init } = upstreamCall(fetchMock);
    expect(url).toBe('http://localhost:4000/auth/sign-in');
    expect(JSON.parse(String(init.body))).toEqual(credentials);
  });

  it('honours COOKIE_SECURE and SESSION_TTL_HOURS', async () => {
    vi.stubEnv('COOKIE_SECURE', 'true');
    vi.stubEnv('SESSION_TTL_HOURS', '2');
    mockUpstream(jsonResponse(200, { id: SESSION_ID, user: USER }));
    const res = await signIn(
      bffRequest('/api/auth/sign-in', { method: 'POST', body: credentials }),
    );
    const cookie = setCookies(res).get('sid');
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Max-Age=7200/);
  });

  it('sign-up returns 201 with the user and sets the cookie', async () => {
    const fetchMock = mockUpstream(jsonResponse(201, { id: SESSION_ID, user: USER }));
    const body = { firstName: 'Ada', lastName: 'Lovelace', ...credentials };
    const res = await signUp(bffRequest('/api/auth/sign-up', { method: 'POST', body }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ user: USER });
    expect(setCookies(res).get('sid')).toContain(SESSION_ID);
    expect(upstreamCall(fetchMock).url).toBe('http://localhost:4000/auth/sign-up');
  });

  it('relays failed sign-in errors and sets no cookie', async () => {
    const error = { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' };
    mockUpstream(jsonResponse(401, error));
    const res = await signIn(
      bffRequest('/api/auth/sign-in', { method: 'POST', body: credentials }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(error);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('rejects a cross-site sign-in (login CSRF)', async () => {
    const fetchMock = mockUpstream();
    const req = bffRequest('/api/auth/sign-in', {
      method: 'POST',
      body: credentials,
      headers: { origin: 'https://evil.example' },
    });
    expect((await signIn(req)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sign-out terminates the session in the API and clears the cookie', async () => {
    const fetchMock = mockUpstream(new Response(null, { status: 204 }));
    const res = await signOut(
      bffRequest('/api/auth/sign-out', { method: 'POST', sessionId: SESSION_ID }),
    );
    expect(res.status).toBe(204);
    const { url, init, headers } = upstreamCall(fetchMock);
    expect(url).toBe(`http://localhost:4000/sessions/${SESSION_ID}`);
    expect(init.method).toBe('DELETE');
    expect(headers.get('x-session-id')).toBe(SESSION_ID);
    expect(setCookies(res).get('sid')).toMatch(/Max-Age=0/);
  });

  it('sign-out still clears the cookie when the API is unreachable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockUpstream(new TypeError('fetch failed'));
    const res = await signOut(
      bffRequest('/api/auth/sign-out', { method: 'POST', sessionId: SESSION_ID }),
    );
    expect(res.status).toBe(204);
    expect(setCookies(res).get('sid')).toMatch(/Max-Age=0/);
  });

  it('sign-out never puts a malformed cookie value into the API path', async () => {
    const fetchMock = mockUpstream();
    const res = await signOut(
      bffRequest('/api/auth/sign-out', { method: 'POST', sessionId: '..%2Fusers' }),
    );
    expect(res.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('me returns the user and strips the session (which contains its ID)', async () => {
    const session = {
      id: SESSION_ID,
      userId: USER.id,
      createdAt: USER.createdAt,
      terminatedAt: null,
      expiresAt: '2026-10-21T17:00:00.000Z',
    };
    mockUpstream(jsonResponse(200, { session, user: USER }));
    const res = await me(bffRequest('/api/auth/me', { sessionId: SESSION_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ user: USER });
    expect(JSON.stringify(body)).not.toContain(SESSION_ID);
  });

  it('me answers 401 without a cookie, and clears a cookie the API rejects', async () => {
    expect((await me(bffRequest('/api/auth/me'))).status).toBe(401);
    mockUpstream(jsonResponse(401, { code: 'UNAUTHORIZED', message: 'expired' }));
    const res = await me(bffRequest('/api/auth/me', { sessionId: SESSION_ID }));
    expect(res.status).toBe(401);
    expect(setCookies(res).get('sid')).toMatch(/Max-Age=0/);
  });

  it('clear-session removes the cookie and redirects only to auth pages', async () => {
    const res = clearSession(bffRequest('/api/auth/clear-session?next=/sign-up'));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost:3000/sign-up');
    expect(setCookies(res).get('sid')).toMatch(/Max-Age=0/);

    const evil = clearSession(bffRequest('/api/auth/clear-session?next=https://evil.example'));
    expect(evil.headers.get('location')).toBe('http://localhost:3000/sign-in');
  });
});
