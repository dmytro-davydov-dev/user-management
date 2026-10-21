import { z } from 'zod';
import { EmailSchema, NameSchema, PASSWORD_MAX_LENGTH, PasswordSchema } from './user';

/** Server-side sign-up payload (no confirmation field; that is a client concern). */
export const SignUpInputSchema = z
  .object({
    firstName: NameSchema,
    lastName: NameSchema,
    email: EmailSchema,
    password: PasswordSchema,
  })
  .strict();
export type SignUpInput = z.infer<typeof SignUpInputSchema>;

/** Client-side sign-up form: adds password confirmation checked before any request. */
export const SignUpFormSchema = SignUpInputSchema.extend({
  confirmPassword: z.string().min(1, 'Required'),
}).refine((v) => v.password === v.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
export type SignUpForm = z.infer<typeof SignUpFormSchema>;

export const SignInInputSchema = z
  .object({
    email: EmailSchema,
    password: z
      .string()
      .min(1, 'Required')
      .max(PASSWORD_MAX_LENGTH, `At most ${PASSWORD_MAX_LENGTH} characters`),
  })
  .strict();
export type SignInInput = z.infer<typeof SignInInputSchema>;
