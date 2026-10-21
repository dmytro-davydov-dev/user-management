import type { User } from '@um/shared';
import { USERS_PAGE_SIZE } from '@um/shared';
import { vi } from 'vitest';
import { jsonResponse } from './render';

/** `count` users, newest first (the API's `createdAt DESC` order), named "User 1"… */
export function makeUsers(count: number, start = Date.parse('2026-10-01T12:00:00Z')): User[] {
  return Array.from({ length: count }, (_, i) => {
    const at = new Date(start - i * 60_000).toISOString();
    return {
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      firstName: 'User',
      lastName: String(i + 1),
      email: `user${i + 1}@example.com`,
      status: 'ACTIVE',
      loginsCount: i,
      createdAt: at,
      updatedAt: at,
    };
  });
}

type Failure = { status: number; body: unknown } | Error;

/**
 * In-memory BFF for `/api/users*` and `/api/auth/sign-out`, installed as `fetch`. It keeps
 * state across requests, so a mutation followed by a refetch shows the real outcome.
 * `failNext()` makes the next matching request fail.
 */
export function installUsersApi(initial: User[]) {
  const users = [...initial];
  const failures: Array<{ method: string; failure: Failure }> = [];
  let pending: Promise<void> | null = null;

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    if (pending) await pending;

    const failureIndex = failures.findIndex((f) => f.method === method || f.method === '*');
    if (failureIndex >= 0) {
      const failure = failures.splice(failureIndex, 1)[0]!.failure;
      if (failure instanceof Error) throw failure;
      return jsonResponse(failure.status, failure.body);
    }

    if (url.pathname === '/api/auth/sign-out') return new Response(null, { status: 204 });

    const id = url.pathname.match(/^\/api\/users\/(.+)$/)?.[1];
    if (url.pathname === '/api/users' && method === 'GET') {
      const page = Number(url.searchParams.get('page') ?? 1);
      const total = users.length;
      return jsonResponse(200, {
        data: users.slice((page - 1) * USERS_PAGE_SIZE, page * USERS_PAGE_SIZE),
        pagination: {
          page,
          limit: USERS_PAGE_SIZE,
          total,
          totalPages: Math.ceil(total / USERS_PAGE_SIZE),
        },
      });
    }
    if (url.pathname === '/api/users' && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      const now = new Date().toISOString();
      const user: User = {
        id: `00000000-0000-4000-9000-${String(users.length + 1).padStart(12, '0')}`,
        firstName: body.firstName ?? '',
        lastName: body.lastName ?? '',
        email: body.email ?? '',
        status: (body.status as User['status'] | undefined) ?? 'ACTIVE',
        loginsCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      users.unshift(user);
      return jsonResponse(201, user);
    }
    const index = users.findIndex((u) => u.id === id);
    if (id && index < 0) return jsonResponse(404, { code: 'NOT_FOUND', message: 'User not found' });
    if (id && method === 'PATCH') {
      const patch = JSON.parse(String(init?.body)) as Partial<User>;
      const updated = { ...users[index]!, ...patch, updatedAt: new Date().toISOString() };
      users[index] = updated;
      return jsonResponse(200, updated);
    }
    if (id && method === 'DELETE') {
      users.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    return jsonResponse(404, { code: 'NOT_FOUND', message: 'Not found' });
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    fetchMock,
    users,
    failNext(method: string, failure: Failure) {
      failures.push({ method, failure });
    },
    /** Holds every request until the returned function is called. */
    hold(): () => void {
      let release!: () => void;
      pending = new Promise<void>((resolve) => (release = resolve));
      return () => {
        pending = null;
        release();
      };
    },
    calls(method: string, path?: string) {
      return fetchMock.mock.calls.filter(([input, init]) => {
        const m = (init?.method ?? 'GET').toUpperCase();
        return m === method && (!path || new URL(String(input), 'http://x').pathname === path);
      });
    },
  };
}
