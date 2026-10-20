import { config } from 'dotenv';

config({ path: ['.env', '../../.env'], quiet: true });

/**
 * Integration tests truncate tables, so they never touch the dev database:
 * TEST_DATABASE_URL wins, otherwise DATABASE_URL with `_test` appended to the DB name.
 */
export function testDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit) return explicit;
  const base = process.env.DATABASE_URL;
  if (!base)
    throw new Error('DATABASE_URL (or TEST_DATABASE_URL) must be set for integration tests');
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) url.pathname = `/${name}_test`;
  return url.toString();
}
