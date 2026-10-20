import { randomUUID } from 'node:crypto';
import type { AuthResponse, MeResponse } from '@um/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../../src/docs/openapi';
import { createAuthSession, createTestApp, resetDatabase, type TestContext } from './helpers';

const signUpBody = {
  firstName: ' Ada ',
  lastName: 'Lovelace',
  email: 'Ada@Example.com',
  password: 'correct-horse',
};
const credentials = { email: 'ada@example.com', password: 'correct-horse' };

describe('Auth & sessions API', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());
  const asSession = (id: string) => ({ 'x-session-id': id });

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
  });

  async function signUp(body = signUpBody): Promise<AuthResponse> {
    const res = await http().post('/auth/sign-up').send(body).expect(201);
    return res.body as AuthResponse;
  }

  const sessionsOf = (userId: string) => ctx.prisma.session.count({ where: { userId } });
  const loginsOf = async (userId: string) =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } })).loginsCount;

  describe('POST /auth/sign-up', () => {
    it('creates the user and a session; sign-up counts as the first login (I1)', async () => {
      const body = await signUp();
      expect(body.user).toMatchObject({
        firstName: 'Ada',
        email: 'ada@example.com',
        status: 'ACTIVE',
        loginsCount: 1,
      });
      const session = await ctx.prisma.session.findUniqueOrThrow({ where: { id: body.id } });
      expect(session).toMatchObject({ userId: body.user.id, terminatedAt: null });
      const ttlHours = (session.expiresAt.getTime() - session.createdAt.getTime()) / 3_600_000;
      expect(ttlHours).toBeCloseTo(24, 1);
    });

    it('returns 409 EMAIL_TAKEN for a duplicate email and creates nothing (I4)', async () => {
      await signUp();
      const res = await http()
        .post('/auth/sign-up')
        .send({ ...signUpBody, email: 'ADA@example.com' })
        .expect(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
      expect(await ctx.prisma.user.count()).toBe(1);
      expect(await ctx.prisma.session.count()).toBe(1);
    });

    it('validates input (no confirmPassword server-side, strict body)', async () => {
      await http()
        .post('/auth/sign-up')
        .send({ ...signUpBody, password: 'short' })
        .expect(400);
      await http()
        .post('/auth/sign-up')
        .send({ ...signUpBody, confirmPassword: 'correct-horse' })
        .expect(400);
    });
  });

  describe('POST /auth/sign-in', () => {
    it('returns a new session and increments loginsCount exactly once (I2)', async () => {
      const { user } = await signUp();
      const res = await http().post('/auth/sign-in').send(credentials).expect(200);
      expect(res.body.user.loginsCount).toBe(2);
      expect(await loginsOf(user.id)).toBe(2);
      expect(await sessionsOf(user.id)).toBe(2);
      expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/i);
    });

    it('returns the same generic 401 for a wrong password and an unknown email', async () => {
      const { user } = await signUp();
      const wrong = await http()
        .post('/auth/sign-in')
        .send({ ...credentials, password: 'wrong-horse' })
        .expect(401);
      const unknown = await http()
        .post('/auth/sign-in')
        .send({ ...credentials, email: 'nobody@example.com' })
        .expect(401);
      expect(wrong.body).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
      expect(unknown.body).toEqual(wrong.body);
      expect(await loginsOf(user.id)).toBe(1);
    });

    it('rejects an inactive user with 403 and creates no session (I3)', async () => {
      const { user } = await signUp();
      await ctx.prisma.user.update({ where: { id: user.id }, data: { status: 'INACTIVE' } });
      const res = await http().post('/auth/sign-in').send(credentials).expect(403);
      expect(res.body.code).toBe('USER_INACTIVE');
      expect(await sessionsOf(user.id)).toBe(1);
      expect(await loginsOf(user.id)).toBe(1);
    });

    it('does not reveal inactivity to a wrong password', async () => {
      const { user } = await signUp();
      await ctx.prisma.user.update({ where: { id: user.id }, data: { status: 'INACTIVE' } });
      await http()
        .post('/auth/sign-in')
        .send({ ...credentials, password: 'wrong-horse' })
        .expect(401);
    });

    it('10 concurrent sign-ins → loginsCount += 10, one session each (I9)', async () => {
      const { user } = await signUp();
      const results = await Promise.all(
        Array.from({ length: 10 }, () => http().post('/auth/sign-in').send(credentials)),
      );
      expect(results.map((r) => r.status)).toEqual(Array(10).fill(200));
      expect(new Set(results.map((r) => r.body.id)).size).toBe(10);
      expect(await loginsOf(user.id)).toBe(11);
      expect(await sessionsOf(user.id)).toBe(11);
    });

    it('a sign-in racing a deactivation creates no session for the inactive user (I10)', async () => {
      const { user } = await signUp();
      let signIn: Promise<request.Response> | undefined;
      // Hold the row lock of an uncommitted deactivation while the sign-in starts; it must wait
      // on SELECT … FOR UPDATE, then observe INACTIVE once the deactivation commits.
      await ctx.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { status: 'INACTIVE' } });
        signIn = http()
          .post('/auth/sign-in')
          .send(credentials)
          .then((res) => res);
        await new Promise((resolve) => setTimeout(resolve, 500));
      });
      const res = await signIn!;
      expect(res.status).toBe(403);
      expect(await sessionsOf(user.id)).toBe(1);
      expect(await loginsOf(user.id)).toBe(1);
    });
  });

  describe('POST /sessions', () => {
    it('creates a session from email + password (201)', async () => {
      const { user } = await signUp();
      const res = await http().post('/sessions').send(credentials).expect(201);
      expect(res.body.user.id).toBe(user.id);
      expect(await loginsOf(user.id)).toBe(2);
    });

    it('rejects a bare userId with 400 (I12)', async () => {
      const { user } = await signUp();
      const res = await http().post('/sessions').send({ userId: user.id }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      await http()
        .post('/sessions')
        .send({ ...credentials, userId: user.id })
        .expect(400);
      expect(await sessionsOf(user.id)).toBe(1);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the current session and the safe user', async () => {
      const { id, user } = await signUp();
      const res = await http().get('/auth/me').set(asSession(id)).expect(200);
      const body = res.body as MeResponse;
      expect(body.session).toMatchObject({ id, userId: user.id, terminatedAt: null });
      expect(body.user).toEqual(user);
      expect(JSON.stringify(body)).not.toMatch(/password|argon2/i);
    });
  });

  describe('SessionGuard', () => {
    it('rejects every protected route without a session header (I13)', async () => {
      const id = randomUUID();
      const routes: Array<[method: 'get' | 'post' | 'patch' | 'delete', path: string]> = [
        ['get', '/auth/me'],
        ['get', '/users'],
        ['post', '/users'],
        ['patch', `/users/${id}`],
        ['delete', `/users/${id}`],
        ['delete', `/sessions/${id}`],
      ];
      for (const [method, path] of routes) {
        const res = await http()[method](path).send({});
        expect(res.status, `${method.toUpperCase()} ${path}`).toBe(401);
        expect(res.body.code).toBe('UNAUTHORIZED');
      }
    });

    it('rejects malformed, unknown and expired sessions with 401 (U4 end to end)', async () => {
      const { sessionId } = await createAuthSession(ctx.prisma);
      await http().get('/auth/me').set(asSession('not-a-uuid')).expect(401);
      await http().get('/auth/me').set(asSession(randomUUID())).expect(401);
      await ctx.prisma.session.update({
        where: { id: sessionId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http().get('/auth/me').set(asSession(sessionId)).expect(401);
    });

    it('keeps public routes open', async () => {
      await http().get('/health').expect(200);
    });
  });

  describe('DELETE /sessions/:id', () => {
    it('terminates once; a repeat is 204; then the session no longer works (I11)', async () => {
      const { id } = await signUp();
      await http().delete(`/sessions/${id}`).set(asSession(id)).expect(204);
      const first = await ctx.prisma.session.findUniqueOrThrow({ where: { id } });
      expect(first.terminatedAt).not.toBeNull();

      await http().delete(`/sessions/${id}`).set(asSession(id)).expect(204);
      const second = await ctx.prisma.session.findUniqueOrThrow({ where: { id } });
      expect(second.terminatedAt).toEqual(first.terminatedAt);

      await http().get('/auth/me').set(asSession(id)).expect(401);
      await http().get('/users').set(asSession(id)).expect(401);
    });

    it("can end another of the caller's own sessions", async () => {
      const { id: first } = await signUp();
      const second = (await http().post('/auth/sign-in').send(credentials).expect(200)).body.id;
      await http().delete(`/sessions/${first}`).set(asSession(second)).expect(204);
      await http().get('/auth/me').set(asSession(first)).expect(401);
      await http().get('/auth/me').set(asSession(second)).expect(200);
    });

    it("returns 404 for another user's session and leaves it intact", async () => {
      const { id: mine } = await signUp();
      const other = await createAuthSession(ctx.prisma, 'other@example.com');
      const res = await http()
        .delete(`/sessions/${other.sessionId}`)
        .set(asSession(mine))
        .expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
      await http().get('/auth/me').set(other.header).expect(200);
      await http().delete(`/sessions/${randomUUID()}`).set(asSession(mine)).expect(404);
    });
  });

  it('documents all 9 endpoints in OpenAPI (T4.9)', () => {
    const doc = buildOpenApiDocument(ctx.app);
    const operations = Object.entries(doc.paths).flatMap(([path, item]) =>
      Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(operations.sort()).toEqual(
      [
        'POST /auth/sign-up',
        'POST /auth/sign-in',
        'GET /auth/me',
        'POST /sessions',
        'DELETE /sessions/{id}',
        'GET /users',
        'POST /users',
        'PATCH /users/{id}',
        'DELETE /users/{id}',
      ].sort(),
    );
    const signUpBodySchema = doc.paths['/auth/sign-up']?.post?.requestBody;
    expect(JSON.stringify(signUpBodySchema)).toContain('"example"');
  });
});
