import {
  ApiErrorSchema,
  type CreateUserInput,
  type ErrorCode,
  type PaginatedResponse,
  type SignInInput,
  type SignUpInput,
  type UpdateUserInput,
  type User,
} from '@um/shared';
import type { BffAuthResponse } from '../bff-types';

/** Any non-2xx BFF response, carrying the shared `{ code, message, details? }` fields. */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** A missing/expired session, as opposed to e.g. wrong credentials on sign-in. */
  get isSessionExpired(): boolean {
    return this.status === 401 && this.code === 'UNAUTHORIZED';
  }
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler = () => {
  window.location.assign('/sign-in');
};

/**
 * Central reaction to an expired session on any request. Providers install a router-based
 * handler; returns a function that restores the previous one.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): () => void {
  const previous = unauthorizedHandler;
  unauthorizedHandler = handler;
  return () => {
    unauthorizedHandler = previous;
  };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiClientError(0, 'SERVICE_UNAVAILABLE', 'Network error. Check your connection.');
  }

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => undefined);
  if (response.ok) return data as T;

  const parsed = ApiErrorSchema.safeParse(data);
  const error = parsed.success
    ? new ApiClientError(
        response.status,
        parsed.data.code,
        parsed.data.message,
        parsed.data.details,
      )
    : new ApiClientError(
        response.status,
        response.status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR',
        response.statusText || 'Request failed',
      );
  if (error.isSessionExpired) unauthorizedHandler();
  throw error;
}

/** Typed access to the BFF (`/api/*`). Never talks to the API host directly. */
export const apiClient = {
  auth: {
    me: () => request<BffAuthResponse>('GET', '/auth/me'),
    signUp: (input: SignUpInput) => request<BffAuthResponse>('POST', '/auth/sign-up', input),
    signIn: (input: SignInInput) => request<BffAuthResponse>('POST', '/auth/sign-in', input),
    signOut: () => request<void>('POST', '/auth/sign-out'),
  },
  users: {
    list: (page: number) => request<PaginatedResponse<User>>('GET', `/users?page=${page}`),
    create: (input: CreateUserInput) => request<User>('POST', '/users', input),
    update: (id: string, input: UpdateUserInput) =>
      request<User>('PATCH', `/users/${encodeURIComponent(id)}`, input),
    delete: (id: string) => request<void>('DELETE', `/users/${encodeURIComponent(id)}`),
  },
};
