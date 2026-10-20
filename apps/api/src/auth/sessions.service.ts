import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiException } from '../common/api-exception';
import type { Env } from '../config/env';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { publicUserSelect } from '../users/user.mapper';
import { type AuthContext, isSessionActive, sessionSelect } from './auth-context';

const HOUR_MS = 3_600_000;

@Injectable()
export class SessionsService {
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs = config.get('SESSION_TTL_HOURS', { infer: true }) * HOUR_MS;
  }

  /**
   * Creates a session and counts the login atomically. The user row is locked
   * (`SELECT … FOR UPDATE`) first, so a concurrent deactivation either commits before
   * (→ 403, no session) or waits until this transaction is done; concurrent sign-ins
   * serialize on the lock, so `loginsCount` always equals the sessions created.
   *
   * Pass `tx` to join an existing transaction (sign-up creates the user in the same one).
   */
  createForUser(userId: string, tx?: Prisma.TransactionClient): Promise<AuthContext> {
    if (tx) return this.createInTransaction(tx, userId);
    return this.prisma.$transaction((inner) => this.createInTransaction(inner, userId));
  }

  private async createInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<AuthContext> {
    const [locked] = await tx.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    if (!locked) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'User not found');
    if (locked.status !== 'ACTIVE') {
      throw new ApiException(HttpStatus.FORBIDDEN, 'USER_INACTIVE', 'Account is inactive');
    }

    const session = await tx.session.create({
      data: { userId, expiresAt: new Date(Date.now() + this.ttlMs) },
      select: sessionSelect,
    });
    const user = await tx.user.update({
      where: { id: userId },
      data: { loginsCount: { increment: 1 } },
      select: publicUserSelect,
    });
    return { session, user };
  }

  /**
   * Looks up a session with its user. Returns null when it does not exist or, unless
   * `allowEnded` is set, when it is terminated or expired.
   */
  async resolve(id: string, { allowEnded = false } = {}): Promise<AuthContext | null> {
    const row = await this.prisma.session.findUnique({
      where: { id },
      select: { ...sessionSelect, user: { select: publicUserSelect } },
    });
    if (!row) return null;
    const { user, ...session } = row;
    if (!allowEnded && !isSessionActive(session)) return null;
    return { session, user };
  }

  /**
   * Ends one of the caller's own sessions. Another user's (or an unknown) session is
   * reported as 404 so IDs cannot be probed. `terminatedAt` is set once; repeats are no-ops.
   */
  async terminate(id: string, callerUserId: string): Promise<void> {
    const owned = await this.prisma.session.findFirst({
      where: { id, userId: callerUserId },
      select: { id: true },
    });
    if (!owned) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Session not found');
    await this.prisma.session.updateMany({
      where: { id, terminatedAt: null },
      data: { terminatedAt: new Date() },
    });
  }
}
