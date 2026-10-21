'use client';

import PersonAddAlt1Outlined from '@mui/icons-material/PersonAddAlt1Outlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Pagination from '@mui/material/Pagination';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@um/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/client/api-client';
import { queryKeys } from '@/lib/client/query';
import { usePageParam } from '@/lib/client/use-page-param';
import { CreateUserDialog } from './create-user-dialog';
import { DeleteUserDialog } from './delete-user-dialog';
import { EditUserDialog } from './edit-user-dialog';
import { fullName } from './format';
import { UsersTable } from './users-table';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; user: User }
  | { kind: 'delete'; user: User };

interface Toast {
  severity: 'success' | 'error';
  message: string;
}

/**
 * T7.2–T7.8: paginated users with create/edit/delete. Mutations are not optimistic: the
 * table only changes after the API confirms and `['users']` is refetched.
 */
export function UsersDashboard({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = usePageParam();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [toast, setToast] = useState<Toast | null>(null);

  const query = useQuery({
    queryKey: queryKeys.usersPage(page),
    queryFn: () => apiClient.users.list(page),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const pagination = data?.pagination;
  const outOfRange =
    !!data &&
    !query.isPlaceholderData &&
    data.data.length === 0 &&
    !!pagination &&
    pagination.totalPages > 0 &&
    page > pagination.totalPages;

  // A page past the end (stale link, or rows deleted elsewhere) moves to the last page.
  useEffect(() => {
    if (outOfRange && pagination) setPage(pagination.totalPages, { replace: true });
  }, [outOfRange, pagination, setPage]);

  const close = useCallback(() => setDialog({ kind: 'none' }), []);
  const refreshUsers = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.users }),
    [queryClient],
  );

  const onCreated = (user: User) => {
    close();
    setToast({ severity: 'success', message: `Created ${fullName(user)}` });
    // Newest first: the new user is on page 1.
    setPage(1);
    void refreshUsers();
  };

  const onSaved = (user: User) => {
    close();
    setToast({ severity: 'success', message: `Saved ${fullName(user)}` });
    void refreshUsers();
    // Your own name is shown in the app bar, which is rendered on the server.
    if (user.id === currentUserId) router.refresh();
  };

  const onGone = () => {
    close();
    setToast({ severity: 'error', message: 'That user no longer exists.' });
    void refreshUsers();
  };

  const onDeleted = async (user: User) => {
    close();
    if (user.id === currentUserId) {
      // The API already ended every session of this user; clear the cookie and leave.
      await apiClient.auth.signOut().catch(() => undefined);
      queryClient.clear();
      router.replace('/sign-in');
      return;
    }
    setToast({ severity: 'success', message: `Deleted ${fullName(user)}` });
    // Deleting the last row of a page moves to the previous page.
    if (data && data.data.length === 1 && page > 1) setPage(page - 1, { replace: true });
    void refreshUsers();
  };

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'flex-end' } }}
      >
        <Box>
          <Typography variant="h1">Users</Typography>
          <Typography color="text.secondary" aria-live="polite">
            {pagination ? summary(page, pagination.limit, pagination.total) : ' '}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<PersonAddAlt1Outlined />}
          onClick={() => setDialog({ kind: 'create' })}
        >
          New user
        </Button>
      </Stack>

      {query.isError ? (
        <Alert
          severity="error"
          role="alert"
          action={
            <Button color="inherit" size="small" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        >
          Couldn’t load users. {query.error.message}
        </Alert>
      ) : data && data.pagination.total === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
          <Typography variant="h2" component="p" gutterBottom>
            No users yet
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Create the first account to get started.
          </Typography>
          <Button variant="outlined" onClick={() => setDialog({ kind: 'create' })}>
            New user
          </Button>
        </Paper>
      ) : (
        <Box sx={{ position: 'relative' }}>
          {query.isFetching && data && (
            <LinearProgress
              aria-label="Refreshing users"
              sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}
            />
          )}
          <UsersTable
            users={data && !outOfRange ? data.data : undefined}
            currentUserId={currentUserId}
            onEdit={(user) => setDialog({ kind: 'edit', user })}
            onDelete={(user) => setDialog({ kind: 'delete', user })}
          />
        </Box>
      )}

      {pagination && pagination.totalPages > 1 && !query.isError && (
        <Pagination
          count={pagination.totalPages}
          page={Math.min(page, pagination.totalPages)}
          onChange={(_, next) => setPage(next)}
          color="primary"
          sx={{ alignSelf: 'center' }}
          getItemAriaLabel={(type, p, selected) =>
            type === 'page' ? `${selected ? '' : 'Go to '}page ${p}` : `Go to ${type} page`
          }
        />
      )}

      {dialog.kind === 'create' && <CreateUserDialog onClose={close} onCreated={onCreated} />}
      {dialog.kind === 'edit' && (
        <EditUserDialog
          user={dialog.user}
          isSelf={dialog.user.id === currentUserId}
          onClose={close}
          onSaved={onSaved}
          onGone={onGone}
        />
      )}
      {dialog.kind === 'delete' && (
        <DeleteUserDialog
          user={dialog.user}
          isSelf={dialog.user.id === currentUserId}
          onClose={close}
          onDeleted={(user) => void onDeleted(user)}
        />
      )}

      <Snackbar
        open={toast !== null}
        autoHideDuration={5000}
        onClose={(_, reason) => reason !== 'clickaway' && setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Stack>
  );
}

function summary(page: number, limit: number, total: number): string {
  if (total === 0) return 'No users';
  const from = Math.min((page - 1) * limit + 1, total);
  const to = Math.min(page * limit, total);
  return `${from}–${to} of ${total} ${total === 1 ? 'user' : 'users'}`;
}
