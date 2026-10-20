import { z } from 'zod';

export const USER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const UserStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 255;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const NameSchema = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(NAME_MAX_LENGTH, `At most ${NAME_MAX_LENGTH} characters`);

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH)
  .pipe(z.email('Invalid email address'));

export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `At most ${PASSWORD_MAX_LENGTH} characters`);

/** Public user representation. Never contains the password hash. */
export const UserSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  status: UserStatusSchema,
  loginsCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const CreateUserInputSchema = z
  .object({
    firstName: NameSchema,
    lastName: NameSchema,
    email: EmailSchema,
    password: PasswordSchema,
    status: UserStatusSchema.default('ACTIVE'),
  })
  .strict();
export type CreateUserInput = z.input<typeof CreateUserInputSchema>;

/**
 * Only names and status are updatable. createdAt, updatedAt, loginsCount,
 * email and password are rejected by `.strict()`.
 */
export const UpdateUserInputSchema = z
  .object({
    firstName: NameSchema.optional(),
    lastName: NameSchema.optional(),
    status: UserStatusSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
export type UpdateUserInput = z.infer<typeof UpdateUserInputSchema>;
