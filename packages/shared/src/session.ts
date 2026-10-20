import { z } from 'zod';
import { UserSchema } from './user';

export const SESSION_HEADER = 'x-session-id';

export const SessionSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  createdAt: z.iso.datetime(),
  terminatedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime(),
});
export type Session = z.infer<typeof SessionSchema>;

/** Returned by sign-up, sign-in and POST /sessions: `id` is the session identifier. */
export const AuthResponseSchema = z.object({
  id: z.uuid(),
  user: UserSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const MeResponseSchema = z.object({
  session: SessionSchema,
  user: UserSchema,
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
