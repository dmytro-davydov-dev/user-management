'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useMutation } from '@tanstack/react-query';
import { type SignInInput, SignInInputSchema } from '@um/shared';
import type { z } from 'zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { apiClient } from '@/lib/client/api-client';
import { applyServerError } from './form-errors';
import { FormTextField } from './form-text-field';
import { useAuthSuccess } from './use-auth-success';

type SignInFormInput = z.input<typeof SignInInputSchema>;

const FIELDS = ['email', 'password'] as const;

/**
 * T6.2: sign-in. Wrong credentials (401 INVALID_CREDENTIALS) and inactive accounts
 * (403 USER_INACTIVE) are form-level messages; the generic 401 copy never says which
 * field was wrong.
 */
export function SignInForm() {
  const onSuccess = useAuthSuccess();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError, setValue, setFocus } = useForm<
    SignInFormInput,
    unknown,
    SignInInput
  >({
    resolver: zodResolver(SignInInputSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  const signIn = useMutation({
    mutationFn: apiClient.auth.signIn,
    onSuccess,
    onError: (error) => {
      const message = applyServerError(error, FIELDS, setError);
      setFormError(message);
      if (message) {
        // Retry starts from an empty password; email is kept.
        setValue('password', '');
        setFocus('password');
      }
    },
  });

  const busy = signIn.isPending || signIn.isSuccess;

  return (
    <Stack
      component="form"
      noValidate
      aria-label="Sign in"
      onSubmit={handleSubmit((values) => {
        if (busy) return; // Enter in a field must not resubmit while pending.
        setFormError(null);
        signIn.mutate(values);
      })}
      spacing={1}
    >
      {formError && (
        <Alert severity="error" role="alert" sx={{ mb: 2 }}>
          {formError}
        </Alert>
      )}
      <FormTextField
        control={control}
        name="email"
        label="Email"
        type="email"
        autoComplete="username"
        inputMode="email"
        required
        autoFocus
      />
      <FormTextField
        control={control}
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
      />
      <Button type="submit" variant="contained" size="large" disabled={busy} sx={{ mt: 1 }}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </Stack>
  );
}
