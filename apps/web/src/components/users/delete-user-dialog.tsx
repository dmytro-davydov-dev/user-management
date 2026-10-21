'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { useMutation } from '@tanstack/react-query';
import type { User } from '@um/shared';
import { ApiClientError, apiClient } from '@/lib/client/api-client';
import { fullName } from './format';

interface Props {
  user: User;
  isSelf: boolean;
  onClose: () => void;
  /** Called after a 204, or a 404 (already gone: the outcome the admin asked for). */
  onDeleted: (user: User) => void;
}

/** T7.6. Nothing is deleted until "Delete" is confirmed here. */
export function DeleteUserDialog({ user, isSelf, onClose, onDeleted }: Props) {
  const remove = useMutation({
    mutationFn: () => apiClient.users.delete(user.id),
    onSuccess: () => onDeleted(user),
    onError: (error) => {
      if (error instanceof ApiClientError && error.code === 'NOT_FOUND') onDeleted(user);
    },
  });
  const busy = remove.isPending;
  const failed =
    remove.isError &&
    !(remove.error instanceof ApiClientError && remove.error.code === 'NOT_FOUND');

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="delete-user-title"
      aria-describedby="delete-user-description"
    >
      <DialogTitle id="delete-user-title">
        {isSelf ? 'Delete your account?' : `Delete ${fullName(user)}?`}
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="delete-user-description">
          {isSelf
            ? 'Your account and all of its sessions are deleted permanently, and you will be signed out.'
            : `${user.email} and all of their sessions are deleted permanently. This can’t be undone.`}
        </DialogContentText>
        {failed && (
          <Alert severity="error" role="alert" sx={{ mt: 2 }}>
            Couldn’t delete the user. Please try again.
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy} autoFocus>
          Cancel
        </Button>
        <Button color="error" variant="contained" onClick={() => remove.mutate()} disabled={busy}>
          {busy ? 'Deleting…' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
