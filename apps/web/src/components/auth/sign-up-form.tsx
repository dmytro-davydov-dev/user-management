'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useMutation } from '@tanstack/react-query';
import { PASSWORD_MIN_LENGTH, type SignUpForm as SignUpValues, SignUpFormSchema } from '@um/shared';
import type { z } from 'zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { apiClient } from '@/lib/client/api-client';
import { applyServerError } from './form-errors';
import { FormTextField } from './form-text-field';
import { useAuthSuccess } from './use-auth-success';

type SignUpFormInput = z.input<typeof SignUpFormSchema>;

const FIELDS = ['firstName', 'lastName', 'email', 'password', 'confirmPassword'] as const;

/**
 * T6.1: sign-up with client-side password confirmation. The shared `SignUpFormSchema`
 * refine runs before submit, so a mismatch never reaches the network.
 */
export function SignUpForm() {
  const onSuccess = useAuthSuccess();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError } = useForm<SignUpFormInput, unknown, SignUpValues>({
    resolver: zodResolver(SignUpFormSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', confirmPassword: '' },
    mode: 'onTouched',
  });

  const signUp = useMutation({
    mutationFn: ({ confirmPassword: _confirm, ...input }: SignUpValues) =>
      apiClient.auth.signUp(input),
    onSuccess,
    onError: (error) =>
      setFormError(
        applyServerError(error, FIELDS, setError, { fieldCodes: { EMAIL_TAKEN: 'email' } }),
      ),
  });

  const busy = signUp.isPending || signUp.isSuccess;

  return (
    <Stack
      component="form"
      noValidate
      aria-label="Create account"
      onSubmit={handleSubmit((values) => {
        if (busy) return; // Enter in a field must not resubmit while pending.
        setFormError(null);
        signUp.mutate(values);
      })}
      spacing={1}
    >
      {formError && (
        <Alert severity="error" role="alert" sx={{ mb: 2 }}>
          {formError}
        </Alert>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.5, sm: 2 }}>
        <FormTextField
          control={control}
          name="firstName"
          label="First name"
          autoComplete="given-name"
          required
          autoFocus
        />
        <FormTextField
          control={control}
          name="lastName"
          label="Last name"
          autoComplete="family-name"
          required
        />
      </Stack>
      <FormTextField
        control={control}
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
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
      <FormTextField
        control={control}
        name="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
      />
      <Button type="submit" variant="contained" size="large" disabled={busy} sx={{ mt: 1 }}>
        {busy ? 'Creating account…' : 'Create account'}
      </Button>
    </Stack>
  );
}
