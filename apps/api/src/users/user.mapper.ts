import type { User } from '@um/shared';
import type { Prisma } from '../generated/prisma/client';

/**
 * The only columns ever read for API responses. `passwordHash` is deliberately absent,
 * so it cannot leak even if a response path forgets the mapper.
 */
export const publicUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  status: true,
  loginsCount: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect;

export type PublicUserRecord = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

/**
 * Builds the public representation field by field, so extra properties on the input
 * (e.g. a full row including `passwordHash`) are never copied through.
 */
export function toPublicUser(record: PublicUserRecord): User {
  return {
    id: record.id,
    firstName: record.firstName,
    lastName: record.lastName,
    email: record.email,
    status: record.status,
    loginsCount: record.loginsCount,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
