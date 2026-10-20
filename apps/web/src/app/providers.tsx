'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { createQueryClient } from '@/lib/client/query';
import { UnauthorizedRedirect } from '@/lib/client/unauthorized-redirect';
import { ThemeModeProvider } from '@/theme/theme-mode';
import type { ThemeMode } from '@/theme/theme';

export function Providers({
  initialMode,
  children,
}: {
  initialMode: ThemeMode;
  children: ReactNode;
}) {
  const [queryClient] = useState(createQueryClient);
  return (
    <AppRouterCacheProvider options={{ key: 'mui' }}>
      <ThemeModeProvider initialMode={initialMode}>
        <QueryClientProvider client={queryClient}>
          <UnauthorizedRedirect />
          {children}
        </QueryClientProvider>
      </ThemeModeProvider>
    </AppRouterCacheProvider>
  );
}
