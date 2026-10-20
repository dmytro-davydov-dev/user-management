import { randomUUID } from 'node:crypto';
import type { User } from '@um/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type AuthSession,
  createAuthSession,
  createTestApp,
  resetDatabase,
  seedUsers,
  type TestContext,
} from './helpers';

const newUser = {
  firstName: '  Ada ',
  lastName: 'Lovelace',
  email: 'Ada@Example.com',
  password: 'correct-horse',
};

describe('Users API', () => {
  let ctx: TestContext;
  /** Every /users route requires a session; the caller is itself a user (sorted last). */
  let auth: AuthSession;
  const http = () => {
    const agent = request(ctx.app.getHttpServer());
    return {
      get: (url: string) => agent.get(url).set(auth.header),
      post: (url: string) => agent.post(url).set(auth.header),
      patch: (url: string) => agent.patch(url).set(auth.header),
      delete: (url: string) => agent.delete(url).set(auth.header),
    };
  };

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    auth = await createAuthSession(ctx.prisma);
  });

  describe('GET /users (I5)', () => {
    // Totals include the authenticated caller, so 0 users is unreachable here.
    it.each([
      [0, 1, 1, 1, 1],
      [5, 1, 6, 6, 1],
      [6, 2, 1, 7, 2],
      [12, 3, 1, 13, 3],
      [12, 4, 0, 13, 3],
    ])(
      '%i seeded + caller, page %i → %i rows (total %i, %i pages)',
      async (count, page, rows, total, totalPages) => {
        await seedUsers(ctx.prisma, count);
        const res = await http().get('/users').query({ page }).expect(200);
        expect(res.body.data).toHaveLength(rows);
        expect(res.body.pagination).toEqual({ page, limit: 6, total, totalPages });
      },
    );

    it('orders newest first with a stable order across pages', async () => {
      const ids = await seedUsers(ctx.prisma, 12);
      const pages = await Promise.all(
        [1, 2, 3].map((page) => http().get('/users').query({ page }).expect(200)),
      );
      const seen = pages.flatMap((res) => (res.body.data as User[]).map((u) => u.id));
      expect(seen).toEqual([...ids].reverse().concat(auth.userId));
    });

    it('breaks createdAt ties by id', async () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      for (let i = 0; i < 3; i++) {
        await ctx.prisma.user.create({
          data: {
            firstName: 'T',
            lastName: 'T',
            email: `tie${i}@example.com`,
            passwordHash: 'x',
            createdAt,
          },
        });
      }
      const res = await http().get('/users').expect(200);
      const ids = (res.body.data as User[]).slice(0, 3).map((u) => u.id);
      expect(ids).toEqual([...ids].sort().reverse());
    });

    it('rejects limit above 6 and page below 1', async () => {
      await http().get('/users').query({ limit: 7 }).expect(400);
      const res = await http().get('/users').query({ page: 0 }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /users', () => {
    it('creates an ACTIVE user with trimmed names and a hashed password', async () => {
      const res = await http().post('/users').send(newUser).expect(201);
      expect(res.body).toMatchObject({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        status: 'ACTIVE',
        loginsCount: 0,
      });
      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('accepts an explicit INACTIVE status', async () => {
      const res = await http()
        .post('/users')
        .send({ ...newUser, status: 'INACTIVE' })
        .expect(201);
      expect(res.body.status).toBe('INACTIVE');
    });

    it('returns 409 EMAIL_TAKEN for a duplicate email (case-insensitive)', async () => {
      await http().post('/users').send(newUser).expect(201);
      const res = await http()
        .post('/users')
        .send({ ...newUser, email: 'ADA@example.com' })
        .expect(409);
      expect(res.body).toEqual({ code: 'EMAIL_TAKEN', message: 'Email is already registered' });
    });

    it('returns 400 with details for invalid input and unknown fields', async () => {
      const res = await http()
        .post('/users')
        .send({ ...newUser, firstName: '   ', password: 'short' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual([
        'firstName',
        'password',
      ]);
      await http()
        .post('/users')
        .send({ ...newUser, loginsCount: 5 })
        .expect(400);
    });

    it('returns 400 for malformed JSON', async () => {
      const res = await http()
        .post('/users')
        .set('Content-Type', 'application/json')
        .send('{"firstName":')
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /users/:id', () => {
    async function createUser(status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'): Promise<User> {
      const res = await http()
        .post('/users')
        .send({ ...newUser, status })
        .expect(201);
      return res.body as User;
    }

    it('updates names, bumps updatedAt and never changes createdAt (I6)', async () => {
      const user = await createUser();
      const res = await http()
        .patch(`/users/${user.id}`)
        .send({ firstName: ' Augusta ' })
        .expect(200);
      expect(res.body.firstName).toBe('Augusta');
      expect(res.body.createdAt).toBe(user.createdAt);
      expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(
        new Date(user.updatedAt).getTime(),
      );
    });

    it('rejects immutable fields', async () => {
      const user = await createUser();
      for (const field of ['createdAt', 'updatedAt', 'loginsCount', 'email', 'passwordHash']) {
        await http()
          .patch(`/users/${user.id}`)
          .send({ [field]: field === 'loginsCount' ? 9 : '2020-01-01T00:00:00Z' })
          .expect(400);
      }
    });

    it('rejects a name change for an inactive user with 403 (I7)', async () => {
      const user = await createUser('INACTIVE');
      const res = await http().patch(`/users/${user.id}`).send({ lastName: 'Byron' }).expect(403);
      expect(res.body.code).toBe('USER_INACTIVE');
      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.lastName).toBe('Lovelace');
    });

    it('allows a status change for an inactive user (I7)', async () => {
      const user = await createUser('INACTIVE');
      const res = await http().patch(`/users/${user.id}`).send({ status: 'ACTIVE' }).expect(200);
      expect(res.body.status).toBe('ACTIVE');
    });

    it('applies status first: reactivate + rename in one request succeeds', async () => {
      const user = await createUser('INACTIVE');
      const res = await http()
        .patch(`/users/${user.id}`)
        .send({ status: 'ACTIVE', firstName: 'Augusta' })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'ACTIVE', firstName: 'Augusta' });
    });

    it('deactivate + rename is rejected atomically', async () => {
      const user = await createUser();
      await http()
        .patch(`/users/${user.id}`)
        .send({ status: 'INACTIVE', firstName: 'Augusta' })
        .expect(403);
      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row).toMatchObject({ status: 'ACTIVE', firstName: 'Ada' });
    });

    it('returns 404 for an unknown id and 400 for a malformed id', async () => {
      await http().patch(`/users/${randomUUID()}`).send({ firstName: 'X' }).expect(404);
      await http().patch(`/users/${randomUUID()}`).send({ status: 'ACTIVE' }).expect(404);
      const res = await http().patch('/users/not-a-uuid').send({ firstName: 'X' }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for an empty payload', async () => {
      const user = await createUser();
      await http().patch(`/users/${user.id}`).send({}).expect(400);
    });
  });

  describe('DELETE /users/:id', () => {
    it('deletes the user and its sessions (I8)', async () => {
      const [id] = await seedUsers(ctx.prisma, 1);
      const session = await ctx.prisma.session.create({
        data: { userId: id!, expiresAt: new Date(Date.now() + 3_600_000) },
      });
      await http().delete(`/users/${id}`).expect(204);
      expect(await ctx.prisma.user.count()).toBe(1);
      expect(await ctx.prisma.session.findUnique({ where: { id: session.id } })).toBeNull();
    });

    it('deleting yourself revokes your session: the next request is 401 (I8)', async () => {
      await http().delete(`/users/${auth.userId}`).expect(204);
      const res = await http().get('/users').expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns 404 when the user does not exist', async () => {
      const res = await http().delete(`/users/${randomUUID()}`).expect(404);
      expect(res.body).toEqual({ code: 'NOT_FOUND', message: 'User not found' });
    });
  });

  it('never returns a password or hash in any response body (I14)', async () => {
    const created = await http().post('/users').send(newUser).expect(201);
    const responses = [
      created,
      await http().get('/users').expect(200),
      await http().patch(`/users/${created.body.id}`).send({ firstName: 'Augusta' }).expect(200),
    ];
    for (const res of responses) expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/i);
  });
});
