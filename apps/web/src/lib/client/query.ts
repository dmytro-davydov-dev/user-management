import { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from './api-client';

export const queryKeys = {
  me: ['me'] as const,
  users: ['users'] as const,
  usersPage: (page: number) => ['users', page] as const,
};

/** Client errors (4xx) are final; only network/5xx failures are retried. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          !(error instanceof ApiClientError && error.status >= 400 && error.status < 500) &&
          failureCount < 2,
      },
      mutations: { retry: false },
    },
  });
}
