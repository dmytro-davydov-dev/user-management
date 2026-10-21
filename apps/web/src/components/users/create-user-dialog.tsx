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
import { useMutation } from '@tanstack/react-query';
import { CreateUserInputSchema, PASSWORD_MIN_LENGTH, type User, USER_STATUSES } from '@um/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { applyServerError } from '@/components/auth/form-errors';
import { FormTextField } from '@/components/auth/form-text-field';
import { apiClient } from '@/lib/client/api-client';
import { STATUS_LABELS } from './status';

type FormInput = z.input<typeof CreateUserInputSchema>;
type FormOutput = z.output<typeof CreateUserInputSchema>;

const FIELDS = ['firstName', 'lastName', 'email', 'password', 'status'] as const;
const EMPTY: FormInput = { firstName: '', lastName: '', email: '', password: '', status: 'ACTIVE' };

interface Props {
  onClose: () => void;
  onCreated: (user: User) => void;
}

/** T7.4. Mounted only while open, so every opening starts from an empty form. */
export function CreateUserDialog({ onClose, onCreated }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(CreateUserInputSchema),
    defaultValues: EMPTY,
    mode: 'onTouched',
  });
  const create = useMutation({
    mutationFn: apiClient.users.create,
    onSuccess: onCreated,
    onError: (error) =>
      setFormError(
        applyServerError(error, FIELDS, setError, { fieldCodes: { EMAIL_TAKEN: 'email' } }),
      ),
  });
  const busy = create.isPending;

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="create-user-title"
      slotProps={{
        paper: {
          component: 'form',
          noValidate: true,
          onSubmit: handleSubmit((values) => {
            if (busy) return;
            setFormError(null);
            create.mutate(values);
          }),
        } as object,
      }}
    >
      <DialogTitle id="create-user-title">New user</DialogTitle>
      <DialogContent>
        <Stack spacing={1} sx={{ pt: 1 }}>
          {formError && (
            <Alert severity="error" role="alert" sx={{ mb: 1 }}>
              {formError}
            </Alert>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }}>
            <FormTextField
              control={control}
              name="firstName"
              label="First name"
              autoComplete="off"
              required
              autoFocus
            />
            <FormTextField
              control={control}
              name="lastName"
              label="Last name"
              autoComplete="off"
              required
            />
          </Stack>
          <FormTextField
            control={control}
            name="email"
            label="Email"
            type="email"
            autoComplete="off"
            required
          />
          <FormTextField
            control={control}
            name="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
            required
          />
          <FormTextField control={control} name="status" label="Status" select>
            {USER_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </MenuItem>
            ))}
          </FormTextField>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={busy}>
          {busy ? 'Creating…' : 'Create user'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
