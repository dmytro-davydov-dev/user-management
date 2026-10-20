import { describe, expect, it } from 'vitest';
import {
  CreateUserInputSchema,
  PaginationQuerySchema,
  SignUpFormSchema,
  UpdateUserInputSchema,
} from './index';

describe('shared schemas', () => {
  it('trims names and rejects blank ones', () => {
    const ok = CreateUserInputSchema.parse({
      firstName: '  Ada ',
      lastName: 'Lovelace',
      email: 'ADA@Example.com ',
      password: 'secret123',
    });
    expect(ok.firstName).toBe('Ada');
    expect(ok.email).toBe('ada@example.com');
    expect(ok.status).toBe('ACTIVE');
    expect(
      CreateUserInputSchema.safeParse({
        firstName: '   ',
        lastName: 'x',
        email: 'a@b.co',
        password: 'secret123',
      }).success,
    ).toBe(false);
  });

  it('update rejects immutable/unknown fields', () => {
    for (const field of ['createdAt', 'updatedAt', 'loginsCount', 'passwordHash', 'email']) {
      expect(UpdateUserInputSchema.safeParse({ firstName: 'A', [field]: 'x' }).success).toBe(false);
    }
    expect(UpdateUserInputSchema.safeParse({}).success).toBe(false);
    expect(UpdateUserInputSchema.safeParse({ status: 'INACTIVE' }).success).toBe(true);
  });

  it('sign-up form requires matching passwords', () => {
    const base = { firstName: 'A', lastName: 'B', email: 'a@b.co', password: 'secret123' };
    expect(SignUpFormSchema.safeParse({ ...base, confirmPassword: 'secret123' }).success).toBe(
      true,
    );
    const r = SignUpFormSchema.safeParse({ ...base, confirmPassword: 'other' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['confirmPassword']);
  });

  it('pagination defaults and caps limit at 6', () => {
    expect(PaginationQuerySchema.parse({})).toEqual({ page: 1, limit: 6 });
    expect(PaginationQuerySchema.safeParse({ limit: 7 }).success).toBe(false);
    expect(PaginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });
});
