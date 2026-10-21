'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMutation } from '@tanstack/react-query';
import {
  NameSchema,
  type UpdateUserInput,
  type User,
  USER_STATUSES,
  UserStatusSchema,
} from '@um/shared';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { applyServerError } from '@/components/auth/form-errors';
import { FormTextField } from '@/components/auth/form-text-field';
import { ApiClientError, apiClient } from '@/lib/client/api-client';
import { formatDateTime } from './format';
import { STATUS_LABELS } from './status';

const EditUserFormSchema = z.object({
  firstName: NameSchema,
  lastName: NameSchema,
  status: UserStatusSchema,
});
type FormInput = z.input<typeof EditUserFormSchema>;
type FormOutput = z.output<typeof EditUserFormSchema>;

const FIELDS = ['firstName', 'lastName', 'status'] as const;

/**
 * Only what changed is sent. Names are never sent for a user who ends up INACTIVE: the API
 * would reject the whole request (status is applied first, then the rename is refused).
 */
export function buildUpdate(user: User, values: FormOutput): UpdateUserInput {
  const update: UpdateUserInput = {};
  if (values.status !== user.status) update.status = values.status;
  if (values.status === 'ACTIVE') {
    if (values.firstName !== user.firstName) update.firstName = values.firstName;
    if (values.lastName !== user.lastName) update.lastName = values.lastName;
  }
  return update;
}

interface Props {
  user: User;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (user: User) => void;
  /** The user was deleted elsewhere (404). */
  onGone: () => void;
}

/** T7.5. Mounted per user, so the form always starts from that user's saved values. */
export function EditUserDialog({ user, isSelf, onClose, onSaved, onGone }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError, setValue } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(EditUserFormSchema),
    defaultValues: { firstName: user.firstName, lastName: user.lastName, status: user.status },
    mode: 'onTouched',
  });
  const status = useWatch({ control, name: 'status' });
  const namesLocked = status === 'INACTIVE';

  // Switching to INACTIVE discards unsaved name edits, so the form shows what will be saved.
  useEffect(() => {
    if (!namesLocked) return;
    setValue('firstName', user.firstName, { shouldValidate: true });
    setValue('lastName', user.lastName, { shouldValidate: true });
  }, [namesLocked, setValue, user.firstName, user.lastName]);

  const update = useMutation({
    mutationFn: (input: UpdateUserInput) => apiClient.users.update(user.id, input),
    onSuccess: onSaved,
    onError: (error) => {
      if (error instanceof ApiClientError && error.code === 'NOT_FOUND') return onGone();
      setFormError(
        applyServerError(error, FIELDS, setError, {
          messages: {
            USER_INACTIVE: 'Inactive users can’t be renamed. Set the status to Active first.',
          },
        }),
      );
    },
  });
  const busy = update.isPending;

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="edit-user-title"
      slotProps={{
        paper: {
          component: 'form',
          noValidate: true,
          onSubmit: handleSubmit((values) => {
            if (busy) return;
            const input = buildUpdate(user, values);
            if (Object.keys(input).length === 0) return onClose();
            setFormError(null);
            update.mutate(input);
          }),
        } as object,
      }}
    >
      <DialogTitle id="edit-user-title">Edit user</DialogTitle>
      <DialogContent>
        <Stack spacing={1} sx={{ pt: 1 }}>
          {formError && (
            <Alert severity="error" role="alert" sx={{ mb: 1 }}>
              {formError}
            </Alert>
          )}
          <FormTextField control={control} name="status" label="Status" select autoFocus>
            {USER_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </MenuItem>
            ))}
          </FormTextField>
          {isSelf && namesLocked && user.status === 'ACTIVE' && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              You’re deactivating your own account. You stay signed in until you sign out, but you
              won’t be able to sign in again until someone reactivates you.
            </Alert>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }}>
            <FormTextField
              control={control}
              name="firstName"
              label="First name"
              autoComplete="off"
              disabled={namesLocked}
              required
            />
            <FormTextField
              control={control}
              name="lastName"
              label="Last name"
              autoComplete="off"
              disabled={namesLocked}
              required
            />
          </Stack>
          {namesLocked && (
            <Alert severity="info" sx={{ mb: 1 }}>
              Inactive users can’t be renamed. Set the status to Active to edit names.
            </Alert>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }}>
            <TextField
              label="Email"
              value={user.email}
              fullWidth
              helperText=" "
              slotProps={{ input: { readOnly: true } }}
            />
            <TextField
              label="Created"
              value={formatDateTime(user.createdAt)}
              fullWidth
              helperText="Set when the account was created"
              slotProps={{ input: { readOnly: true } }}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
