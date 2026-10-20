import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from '../../src/health/health.controller';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('GET /health', () => {
  let app: INestApplication;
  const prisma = { ping: vi.fn<() => Promise<boolean>>() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('returns 200 when the database responds', async () => {
    prisma.ping.mockResolvedValueOnce(true);
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok', database: 'up' });
  });

  it('returns 503 with the shared error shape when the database is down', async () => {
    prisma.ping.mockResolvedValueOnce(false);
    const res = await request(app.getHttpServer()).get('/health').expect(503);
    expect(res.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});
