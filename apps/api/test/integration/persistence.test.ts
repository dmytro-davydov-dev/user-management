import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

/** Requires DATABASE_URL pointing at a migrated, disposable database. */
describe('persistence (real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE sessions, users`;
  });

  afterAll(() => app.close());

  const newUser = (email: string) =>
    prisma.user.create({
      data: { firstName: 'Ada', lastName: 'Lovelace', email, passwordHash: 'hash' },
    });

  it('GET /health pings the database', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok', database: 'up' });
  });

  it('applies column defaults', async () => {
    const user = await newUser('ada@example.com');
    expect(user).toMatchObject({ status: 'ACTIVE', loginsCount: 0 });
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('enforces unique email', async () => {
    await newUser('dup@example.com');
    await expect(newUser('dup@example.com')).rejects.toMatchObject({ code: 'P2002' });
  });

  it('bumps updatedAt on update but keeps createdAt', async () => {
    const user = await newUser('upd@example.com');
    await new Promise((r) => setTimeout(r, 10));
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { firstName: 'Augusta' },
    });
    expect(updated.createdAt).toEqual(user.createdAt);
    expect(updated.updatedAt.getTime()).toBeGreaterThan(user.updatedAt.getTime());
  });

  it('cascades session deletion when a user is deleted', async () => {
    const user = await newUser('cascade@example.com');
    await prisma.session.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) },
    });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });
});
