import { redirect } from 'next/navigation';
import { clearSessionUrl, getCurrentAuth } from '@/lib/server/current-user';

/** Entry point: authenticated users go to the dashboard, everyone else to sign-up. */
export default async function HomePage(): Promise<never> {
  const auth = await getCurrentAuth();
  if (auth.status === 'authenticated') redirect('/dashboard');
  redirect(auth.status === 'expired' ? clearSessionUrl('/sign-up') : '/sign-up');
}
