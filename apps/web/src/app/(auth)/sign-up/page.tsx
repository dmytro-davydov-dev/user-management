import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import { SignUpForm } from '@/components/auth/sign-up-form';

export const metadata: Metadata = { title: 'Create account' };

export default function SignUpPage() {
  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h1">Create account</Typography>
        <Typography color="text.secondary">
          Already registered?{' '}
          <Link component={NextLink} href="/sign-in">
            Sign in
          </Link>
        </Typography>
      </Stack>
      <SignUpForm />
    </Stack>
  );
}
