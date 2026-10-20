'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { setUnauthorizedHandler } from './api-client';

/**
 * Any request that comes back 401 UNAUTHORIZED (the BFF has already cleared the dead
 * cookie) drops cached data and lands on /sign-in.
 */
export function UnauthorizedRedirect(): null {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(
    () =>
      setUnauthorizedHandler(() => {
        queryClient.clear();
        router.replace('/sign-in');
      }),
    [router, queryClient],
  );
  return null;
}
