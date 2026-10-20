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
  await app.init();
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
