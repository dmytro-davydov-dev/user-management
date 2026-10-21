import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import { SignInForm } from '@/components/auth/sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h1">Sign in</Typography>
        <Typography color="text.secondary">
          No account yet?{' '}
          <Link component={NextLink} href="/sign-up">
            Create one
          </Link>
        </Typography>
      </Stack>
      <SignInForm />
    </Stack>
  );
}
