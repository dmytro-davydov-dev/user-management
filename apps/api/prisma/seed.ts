/**
 * Development seed: one known admin plus 13 sample users (3 dashboard pages of 6).
 * Idempotent: users are matched by email and never duplicated or overwritten.
 * Refuses to run with NODE_ENV=production.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client';

config({ path: ['.env', '../../.env'], quiet: true });

const SAMPLE_USERS: ReadonlyArray<readonly [string, string]> = [
  ['Grace', 'Hopper'],
  ['Alan', 'Turing'],
  ['Katherine', 'Johnson'],
  ['Edsger', 'Dijkstra'],
  ['Barbara', 'Liskov'],
  ['Donald', 'Knuth'],
  ['Margaret', 'Hamilton'],
  ['Linus', 'Torvalds'],
  ['Frances', 'Allen'],
  ['Dennis', 'Ritchie'],
  ['Radia', 'Perlman'],
  ['Ken', 'Thompson'],
  ['Hedy', 'Lamarr'],
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV=production');
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'change-me-locally';
  // Sample users share one throwaway password; they exist to fill the dashboard.
  const samplePasswordHash = await hash(`sample-${crypto.randomUUID()}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const now = Date.now();
    const rows = [
      {
        firstName: 'Admin',
        lastName: 'User',
        email: adminEmail,
        passwordHash: await hash(adminPassword),
      },
      ...SAMPLE_USERS.map(([firstName, lastName]) => ({
        firstName,
        lastName,
        email: `${firstName}.${lastName}@example.com`.toLowerCase(),
        passwordHash: samplePasswordHash,
      })),
    ];

    let created = 0;
    for (const [i, row] of rows.entries()) {
      const existing = await prisma.user.findUnique({ where: { email: row.email } });
      if (existing) continue;
      // Stagger createdAt so the dashboard order (createdAt DESC) is deterministic.
      await prisma.user.create({ data: { ...row, createdAt: new Date(now - i * 60_000) } });
      created += 1;
    }
    console.log(`Seed complete: ${created} created, ${rows.length - created} already present.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
