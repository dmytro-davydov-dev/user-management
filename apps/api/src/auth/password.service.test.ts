import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('hashes with argon2id and verifies the same password', async () => {
    const hash = await passwords.hash('correct-horse');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('correct-horse');
    await expect(passwords.verify(hash, 'correct-horse')).resolves.toBe(true);
  });

  it('rejects a mismatched password', async () => {
    const hash = await passwords.hash('correct-horse');
    await expect(passwords.verify(hash, 'wrong-horse')).resolves.toBe(false);
  });

  it('salts each hash', async () => {
    expect(await passwords.hash('correct-horse')).not.toBe(await passwords.hash('correct-horse'));
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    await expect(passwords.verify('not-a-hash', 'correct-horse')).resolves.toBe(false);
  });

  it('refuses passwords shorter than 8 characters', async () => {
    await expect(passwords.hash('short')).rejects.toThrow(/at least 8/);
  });
});
