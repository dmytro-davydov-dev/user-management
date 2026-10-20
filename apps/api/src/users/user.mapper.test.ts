import { UserSchema } from '@um/shared';
import { describe, expect, it } from 'vitest';
import { toPublicUser, type PublicUserRecord } from './user.mapper';

describe('toPublicUser', () => {
  const row = {
    id: '6f1c2b8e-3c1a-4d0e-9f53-2b1f8f7f4a10',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    status: 'ACTIVE' as const,
    loginsCount: 3,
    createdAt: new Date('2026-01-02T03:04:05.006Z'),
    updatedAt: new Date('2026-02-03T04:05:06.007Z'),
  };

  it('returns a valid public user with ISO 8601 UTC dates', () => {
    const user = toPublicUser(row);
    expect(UserSchema.parse(user)).toEqual(user);
    expect(user.createdAt).toBe('2026-01-02T03:04:05.006Z');
  });

  it('never copies the password hash, even when given a full row', () => {
    const fullRow = { ...row, passwordHash: '$argon2id$v=19$secret' } as PublicUserRecord;
    const serialized = JSON.stringify(toPublicUser(fullRow));
    expect(serialized).not.toMatch(/password/i);
    expect(serialized).not.toContain('argon2');
  });
});
