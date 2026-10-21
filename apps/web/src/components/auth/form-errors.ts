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

/**
 * Applies a failed auth request to the form: known fields get inline errors (the first one
 * is focused), everything else becomes a form-level message. Returns that message, if any.
 */
export function applyServerError<T extends FieldValues>(
  error: unknown,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
  fieldCodes: Partial<Record<string, Path<T>>> = {},
): string | null {
  if (!(error instanceof ApiClientError)) return AUTH_ERROR_MESSAGES.GENERIC;

  const codeField = fieldCodes[error.code];
  if (codeField) {
    const message =
      AUTH_ERROR_MESSAGES[error.code as keyof typeof AUTH_ERROR_MESSAGES] ?? error.message;
    setError(codeField, { type: 'server', message }, { shouldFocus: true });
    return null;
  }

  if (error.code === 'VALIDATION_ERROR') {
    const known = validationDetails(error.details).filter((d): d is ValidationDetail =>
      (fields as readonly string[]).includes(d.path),
    );
    known.forEach((d, i) =>
      setError(d.path as Path<T>, { type: 'server', message: d.message }, { shouldFocus: i === 0 }),
    );
    if (known.length > 0) return null;
    return error.message || AUTH_ERROR_MESSAGES.GENERIC;
  }

  if (error.code in AUTH_ERROR_MESSAGES) {
    return AUTH_ERROR_MESSAGES[error.code as keyof typeof AUTH_ERROR_MESSAGES];
  }
  return error.status >= 500 || error.status === 0
    ? AUTH_ERROR_MESSAGES.SERVICE_UNAVAILABLE
    : AUTH_ERROR_MESSAGES.GENERIC;
}
