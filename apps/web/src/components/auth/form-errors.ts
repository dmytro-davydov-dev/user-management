import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiClientError } from '@/lib/client/api-client';

/** Copy for server errors that are not tied to a single field. */
export const AUTH_ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid email or password.',
  USER_INACTIVE: 'This account is inactive. Contact an administrator to reactivate it.',
  EMAIL_TAKEN: 'An account with this email already exists.',
  SERVICE_UNAVAILABLE: 'The service is unavailable right now. Please try again shortly.',
  FORBIDDEN: 'The request was blocked. Reload the page and try again.',
  GENERIC: 'Something went wrong. Please try again.',
} as const;

interface ValidationDetail {
  path: string;
  message: string;
}

/** Normalises the API's `details[{ path, message }]` (path as string or segment array). */
function validationDetails(details: unknown): ValidationDetail[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return [];
    const { path, message } = item as { path?: unknown; message?: unknown };
    if (typeof message !== 'string') return [];
    const key = Array.isArray(path) ? path.join('.') : typeof path === 'string' ? path : '';
    return key ? [{ path: key, message }] : [];
  });
}

type MessageKey = keyof typeof AUTH_ERROR_MESSAGES | string;

export interface ServerErrorOptions<T extends FieldValues> {
  /** Error codes that belong to one field, e.g. `{ EMAIL_TAKEN: 'email' }`. */
  fieldCodes?: Partial<Record<string, Path<T>>>;
  /** Per-form copy overriding `AUTH_ERROR_MESSAGES` for specific codes. */
  messages?: Partial<Record<MessageKey, string>>;
}

/**
 * Applies a failed request to a form: known fields get inline errors (the first one is
 * focused), everything else becomes a form-level message. Returns that message, if any.
 */
export function applyServerError<T extends FieldValues>(
  error: unknown,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
  { fieldCodes = {}, messages = {} }: ServerErrorOptions<T> = {},
): string | null {
  const copy = (code: string): string | undefined =>
    messages[code] ?? AUTH_ERROR_MESSAGES[code as keyof typeof AUTH_ERROR_MESSAGES];

  if (!(error instanceof ApiClientError)) return copy('GENERIC') ?? AUTH_ERROR_MESSAGES.GENERIC;

  const codeField = fieldCodes[error.code];
  if (codeField) {
    setError(
      codeField,
      { type: 'server', message: copy(error.code) ?? error.message },
      { shouldFocus: true },
    );
    return null;
  }

  if (error.code === 'VALIDATION_ERROR') {
    const known = validationDetails(error.details).filter((d) =>
      (fields as readonly string[]).includes(d.path),
    );
    known.forEach((d, i) =>
      setError(d.path as Path<T>, { type: 'server', message: d.message }, { shouldFocus: i === 0 }),
    );
    if (known.length > 0) return null;
    return error.message || AUTH_ERROR_MESSAGES.GENERIC;
  }

  const known = copy(error.code);
  if (known) return known;
  return error.status >= 500 || error.status === 0
    ? AUTH_ERROR_MESSAGES.SERVICE_UNAVAILABLE
    : AUTH_ERROR_MESSAGES.GENERIC;
}
