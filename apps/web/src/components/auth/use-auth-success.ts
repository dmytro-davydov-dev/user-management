'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { queryKeys } from '@/lib/client/query';

/**
 * After sign-up/sign-in (T6.3): drop any cached identity and *replace* the auth page in
 * history, so Back from the dashboard does not return to the form. Middleware would bounce
 * an authenticated user off the auth pages anyway; `replace` keeps history clean.
 */
export function useAuthSuccess(): () => Promise<void> {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
    router.replace('/dashboard');
  }, [router, queryClient]);
}
