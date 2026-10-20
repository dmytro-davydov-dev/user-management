import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CreateUserInputSchema,
  PaginatedResponse,
  PaginationQuery,
  UpdateUserInput,
  User,
} from '@um/shared';
import type { z } from 'zod';
import { PasswordService } from '../auth/password.service';
import { ApiException } from '../common/api-exception';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { publicUserSelect, toPublicUser } from './user.mapper';

/** Parsed create payload: names/email trimmed, status defaulted by the shared schema. */
export type CreateUserData = z.output<typeof CreateUserInputSchema>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  /** Newest first; `id` breaks ties so pages are stable when createdAt collides. */
  async list({ page, limit }: PaginationQuery): Promise<PaginatedResponse<User>> {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        select: publicUserSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      data: rows.map(toPublicUser),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async create(input: CreateUserData): Promise<User> {
    const passwordHash = await this.passwords.hash(input.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          status: input.status,
          passwordHash,
        },
        select: publicUserSelect,
      });
      return toPublicUser(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiException(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'Email is already registered');
      }
      throw error;
    }
  }

  /**
   * Status is applied first, then names, in one transaction:
   * - reactivate + rename in one request succeeds;
   * - deactivate + rename is rejected (403) and nothing is written.
   * The name update is conditional on `status = 'ACTIVE'` so a concurrent
   * deactivation cannot slip a rename through.
   */
  async update(id: string, input: UpdateUserInput): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      if (input.status !== undefined) {
        await tx.user.update({
          where: { id },
          data: { status: input.status },
          select: { id: true },
        });
      }

      const names: Prisma.UserUpdateManyMutationInput = {};
      if (input.firstName !== undefined) names.firstName = input.firstName;
      if (input.lastName !== undefined) names.lastName = input.lastName;

      if (Object.keys(names).length > 0) {
        const { count } = await tx.user.updateMany({
          where: { id, status: 'ACTIVE' },
          data: names,
        });
        if (count === 0) {
          const exists = await tx.user.findUnique({ where: { id }, select: { id: true } });
          if (!exists) throw notFound();
          throw new ApiException(
            HttpStatus.FORBIDDEN,
            'USER_INACTIVE',
            'Inactive users cannot change their name',
          );
        }
      }

      const user = await tx.user.findUnique({ where: { id }, select: publicUserSelect });
      if (!user) throw notFound();
      return toPublicUser(user);
    });
  }

  /** Sessions are removed by the `ON DELETE CASCADE` foreign key in the same statement. */
  async delete(id: string): Promise<void> {
    const { count } = await this.prisma.user.deleteMany({ where: { id } });
    if (count === 0) throw notFound();
  }
}

function notFound(): ApiException {
  return new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'User not found');
}
