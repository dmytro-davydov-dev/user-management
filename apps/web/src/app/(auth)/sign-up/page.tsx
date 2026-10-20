import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import NextLink from 'next/link';

export const metadata: Metadata = { title: 'Create account' };

// The form (T6.1) replaces this shell in Phase 6.
export default function SignUpPage() {
  return (
    <Stack spacing={2}>
      <Typography variant="h1">Create account</Typography>
      <Typography color="text.secondary">
        Already registered?{' '}
        <Link component={NextLink} href="/sign-in">
          Sign in
        </Link>
      </Typography>
    </Stack>
  );
}
