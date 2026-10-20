import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { config, middleware } from './middleware';

const request = (path: string, sid?: string) =>
  new NextRequest(`http://localhost:3000${path}`, {
    headers: sid ? { cookie: `sid=${sid}` } : {},
  });

const location = (response: Response) => response.headers.get('location');

describe('middleware (T5.4)', () => {
  it.each(['/dashboard', '/dashboard/anything'])(
    'redirects %s to /sign-in without a cookie',
    (path) => {
      const res = middleware(request(path));
      expect(res.status).toBe(307);
      expect(location(res)).toBe('http://localhost:3000/sign-in');
    },
  );

  it.each(['/sign-in', '/sign-up'])('redirects %s to /dashboard when a cookie exists', (path) => {
    expect(location(middleware(request(path, 'some-session')))).toBe(
      'http://localhost:3000/dashboard',
    );
  });

  it('lets matching requests through otherwise', () => {
    expect(location(middleware(request('/dashboard', 'some-session')))).toBeNull();
    expect(location(middleware(request('/sign-in')))).toBeNull();
    expect(location(middleware(request('/dashboardish')))).toBeNull();
  });

  it('only runs on dashboard and auth pages', () => {
    expect(config.matcher).toEqual(['/dashboard/:path*', '/sign-in', '/sign-up']);
  });
});
