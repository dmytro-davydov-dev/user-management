import 'server-only';
import { z } from 'zod';

const WebEnvSchema = z.object({
  /** Where the BFF reaches the API (server-side only; never sent to the browser). */
  API_INTERNAL_URL: z.url().default('http://localhost:4000'),
  /** Set to "true" behind HTTPS so the session cookie gets the Secure flag. */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /** Session cookie lifetime; matches the API's session TTL. */
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24),
});

export type WebEnv = z.output<typeof WebEnvSchema>;

/** Parsed on each call (cheap) so it is read at request time, never baked in at build time. */
export function getServerEnv(): WebEnv {
  const result = WebEnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid web environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
