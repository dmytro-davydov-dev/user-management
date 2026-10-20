import { Injectable } from '@nestjs/common';
import { PASSWORD_MIN_LENGTH } from '@um/shared';
import { argon2id, hash, verify } from 'argon2';

/** Argon2id hashing (OWASP-recommended). Hashes embed their own salt and parameters. */
@Injectable()
export class PasswordService {
  async hash(plain: string): Promise<string> {
    if (plain.length < PASSWORD_MIN_LENGTH) {
      throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
    }
    return hash(plain, { type: argon2id });
  }

  /** Returns false (never throws) for a mismatch or a malformed hash. */
  async verify(passwordHash: string, plain: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plain);
    } catch {
      return false;
    }
  }
}
