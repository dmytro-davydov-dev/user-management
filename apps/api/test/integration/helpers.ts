import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  // Listen once so concurrent supertest requests reuse the server instead of each binding it.
  await app.listen(0, '127.0.0.1');
  return { app, prisma: app.get(PrismaService) };
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE sessions, users RESTART IDENTITY CASCADE');
}

/** Inserts users with strictly increasing createdAt so expected order is deterministic. */
export async function seedUsers(prisma: PrismaService, count: number): Promise<string[]> {
  const base = Date.UTC(2026, 0, 1);
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const user = await prisma.user.create({
      data: {
        firstName: `First${i}`,
        lastName: `Last${i}`,
        email: `user${i}@example.com`,
        passwordHash: 'not-a-real-hash',
        createdAt: new Date(base + i * 1000),
      },
      select: { id: true },
    });
    ids.push(user.id);
  }
  return ids;
}

export interface AuthSession {
  userId: string;
  sessionId: string;
  /** Spread into `.set()`: `http().get('/users').set(auth.header)`. */
  header: { 'x-session-id': string };
}

/**
 * Inserts a user plus an active session directly. The user's createdAt (2025) predates
 * `seedUsers` (2026), so it always sorts last in GET /users.
 */
export async function createAuthSession(
  prisma: PrismaService,
  email = 'auth@example.com',
): Promise<AuthSession> {
  const user = await prisma.user.create({
    data: {
      firstName: 'Auth',
      lastName: 'User',
      email,
      passwordHash: 'not-a-real-hash',
      createdAt: new Date(Date.UTC(2025, 0, 1)),
    },
    select: { id: true },
  });
  const session = await prisma.session.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) },
    select: { id: true },
  });
  return { userId: user.id, sessionId: session.id, header: { 'x-session-id': session.id } };
}
