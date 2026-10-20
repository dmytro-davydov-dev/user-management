import { CreateUserInputSchema, PaginationQuerySchema, UpdateUserInputSchema } from '@um/shared';
import { describe, expect, it } from 'vitest';
import { ApiException } from './api-exception';
import { ZodValidationPipe } from './zod-validation.pipe';

const validCreate = {
  firstName: '  Ada ',
  lastName: ' Lovelace  ',
  email: ' Ada@Example.COM ',
  password: 'correct-horse',
};

function errorOf(fn: () => unknown): ApiException {
  try {
    fn();
  } catch (error) {
    if (error instanceof ApiException) return error;
  }
  throw new Error('expected an ApiException');
}

describe('ZodValidationPipe', () => {
  const createPipe = new ZodValidationPipe(CreateUserInputSchema);
  const updatePipe = new ZodValidationPipe(UpdateUserInputSchema);

  it('trims names, normalizes email and defaults status to ACTIVE', () => {
    expect(createPipe.transform(validCreate)).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: 'correct-horse',
      status: 'ACTIVE',
    });
  });

  it('rejects whitespace-only names with field details', () => {
    const error = errorOf(() => createPipe.transform({ ...validCreate, firstName: '   ' }));
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ path: 'firstName', message: 'Required' }],
    });
  });

  it.each(['createdAt', 'updatedAt', 'loginsCount', 'passwordHash', 'email', 'password'])(
    'rejects %s in an update payload',
    (field) => {
      const error = errorOf(() => updatePipe.transform({ firstName: 'Ada', [field]: 'x' }));
      expect(error.getStatus()).toBe(400);
    },
  );

  it('rejects an empty update payload', () => {
    expect(errorOf(() => updatePipe.transform({})).getStatus()).toBe(400);
  });

  it('coerces pagination query strings and enforces the page size cap', () => {
    const pipe = new ZodValidationPipe(PaginationQuerySchema);
    expect(pipe.transform({ page: '2' })).toEqual({ page: 2, limit: 6 });
    expect(errorOf(() => pipe.transform({ limit: '7' })).getStatus()).toBe(400);
    expect(errorOf(() => pipe.transform({ page: '0' })).getStatus()).toBe(400);
  });
});
