import { HttpStatus, Injectable } from '@nestjs/common';
import type { SignInInput, SignUpInput } from '@um/shared';
import { ApiException } from '../common/api-exception';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthContext } from './auth-context';
import { PasswordService } from './password.service';
import { SessionsService } from './sessions.service';

@Injectable()
export class AuthService {
  /** Verified against for unknown emails so both paths cost one argon2 verification. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
  ) {}

  /** Creates the user and its first session in one transaction (sign-up counts as a login). */
  async signUp(input: SignUpInput): Promise<AuthContext> {
    const passwordHash = await this.passwords.hash(input.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { id } = await tx.user.create({
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            passwordHash,
          },
          select: { id: true },
        });
        return this.sessions.createForUser(id, tx);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiException(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'Email is already registered');
      }
      throw error;
    }
  }

  /**
   * Verifies credentials, then creates a session. The inactive check happens only after
   * the password is verified, so account status is never revealed to a wrong password.
   */
  async signIn({ email, password }: SignInInput): Promise<AuthContext> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });
    const valid = await this.passwords.verify(
      user?.passwordHash ?? (await this.getDummyHash()),
      password,
    );
    if (!user || !valid) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'Invalid email or password',
      );
    }
    return this.sessions.createForUser(user.id);
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash('timing-equalizer-not-a-password');
    return this.dummyHash;
  }
}
