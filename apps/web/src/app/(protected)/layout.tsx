import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { requireUser } from '@/lib/server/current-user';

/** Everything below is rendered only after the API confirms the session. */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
