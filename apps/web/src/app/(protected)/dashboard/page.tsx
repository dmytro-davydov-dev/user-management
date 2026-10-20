import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Users' };

// The users table and dialogs (T7.2–T7.7) land here in Phase 7.
export default function DashboardPage() {
  return (
    <Stack spacing={1}>
      <Typography variant="h1">Users</Typography>
      <Typography color="text.secondary">Manage accounts, status and access.</Typography>
    </Stack>
  );
}
