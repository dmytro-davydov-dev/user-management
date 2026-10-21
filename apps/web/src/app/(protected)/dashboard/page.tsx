import type { Metadata } from 'next';
import { UsersDashboard } from '@/components/users/users-dashboard';
import { requireUser } from '@/lib/server/current-user';

export const metadata: Metadata = { title: 'Users' };

export default async function DashboardPage() {
  // Deduplicated with the layout's call (React `cache`): no second API request.
  const user = await requireUser();
  return <UsersDashboard currentUserId={user.id} />;
}
