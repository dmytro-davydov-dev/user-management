import { validateEnv } from '../../src/config/env';

const DATABASE_URL = 'postgresql://app:secret@localhost:5432/user_management';

describe('validateEnv', () => {
  it('applies defaults and coerces numbers', () => {
    expect(validateEnv({ DATABASE_URL, API_PORT: '4100' })).toEqual({
      NODE_ENV: 'development',
      API_PORT: 4100,
      DATABASE_URL,
      SESSION_TTL_HOURS: 24,
    });
  });

  it('rejects a missing or non-postgres DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/postgresql/);
  });

  it('rejects invalid numbers', () => {
    expect(() => validateEnv({ DATABASE_URL, SESSION_TTL_HOURS: '0' })).toThrow(
      /SESSION_TTL_HOURS/,
    );
    expect(() => validateEnv({ DATABASE_URL, API_PORT: 'abc' })).toThrow(/API_PORT/);
  });
});
