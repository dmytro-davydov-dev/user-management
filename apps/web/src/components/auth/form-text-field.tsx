'use client';

import TextField, { type TextFieldProps } from '@mui/material/TextField';
import { type Control, Controller, type FieldValues, type Path } from 'react-hook-form';

type Props<T extends FieldValues> = Omit<
  TextFieldProps,
  'name' | 'value' | 'onChange' | 'onBlur' | 'error' | 'helperText' | 'inputRef'
> & {
  control: Control<T>;
  name: Path<T>;
  /** Shown when the field has no error. */
  hint?: string;
};

/** MUI TextField bound to React Hook Form; the error message doubles as helper text. */
export function FormTextField<T extends FieldValues>({ control, name, hint, ...props }: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { ref, value, disabled, ...field }, fieldState: { error } }) => (
        <TextField
          {...props}
          {...field}
          disabled={Boolean(props.disabled ?? disabled)}
          value={(value as string | undefined) ?? ''}
          inputRef={ref}
          error={Boolean(error)}
          helperText={error?.message ?? hint ?? ' '}
          fullWidth
        />
      )}
    />
  );
}
