import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import NextLink from 'next/link';

export const metadata: Metadata = { title: 'Sign in' };

// The form (T6.2) replaces this shell in Phase 6.
export default function SignInPage() {
  return (
    <Stack spacing={2}>
      <Typography variant="h1">Sign in</Typography>
      <Typography color="text.secondary">
        No account yet?{' '}
        <Link component={NextLink} href="/sign-up">
          Create one
        </Link>
      </Typography>
    </Stack>
  );
}
