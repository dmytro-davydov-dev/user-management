import type { NextRequest } from 'next/server';
import { startSession } from '@/lib/server/auth-routes';

export const dynamic = 'force-dynamic';

export function POST(request: NextRequest) {
  return startSession(request, '/auth/sign-in');
}
