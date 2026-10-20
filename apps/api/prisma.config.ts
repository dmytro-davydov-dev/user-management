import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Host-side dev keeps a single .env at the repo root; containers pass real env vars.
config({ path: ['.env', '../../.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
