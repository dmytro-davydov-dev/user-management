import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiErrorSchema, type ApiError, type ErrorCode } from '@um/shared';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client';

const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/** Prisma codes for "cannot reach / lost the database". */
const PRISMA_CONNECTION_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);
/** Node / Postgres codes surfaced by the pg driver adapter when the DB is unreachable. */
const DRIVER_CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
]);

export interface MappedError {
  status: number;
  body: ApiError;
}

/**
 * Maps any thrown value to the shared `{ code, message, details? }` error shape.
 * Exported separately from the filter so the mapping can be unit-tested directly.
 */
export function mapException(exception: unknown): MappedError {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const parsed = ApiErrorSchema.safeParse(response);
    if (parsed.success) return { status, body: parsed.data };
    return {
      status,
      body: { code: STATUS_CODES[status] ?? 'INTERNAL_ERROR', message: exception.message },
    };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2002') {
      return {
        status: HttpStatus.CONFLICT,
        body: { code: 'CONFLICT', message: 'Resource already exists' },
      };
    }
    if (exception.code === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        body: { code: 'NOT_FOUND', message: 'Resource not found' },
      };
    }
    if (PRISMA_CONNECTION_CODES.has(exception.code)) return unavailable();
  }

  if (exception instanceof Prisma.PrismaClientInitializationError) return unavailable();
  if (isDriverConnectionError(exception)) return unavailable();

  // Express body-parser errors (malformed JSON, payload too large) carry an HTTP status.
  const bodyParserStatus = clientErrorStatus(exception);
  if (bodyParserStatus !== undefined) {
    return {
      status: bodyParserStatus,
      body: {
        code: STATUS_CODES[bodyParserStatus] ?? 'VALIDATION_ERROR',
        message:
          bodyParserStatus === HttpStatus.BAD_REQUEST ? 'Malformed request body' : 'Bad request',
      },
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  };
}

function unavailable(): MappedError {
  return {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    body: { code: 'SERVICE_UNAVAILABLE', message: 'Database unavailable' },
  };
}

function isDriverConnectionError(error: unknown): boolean {
  let current: unknown = error;
  // Adapter errors may wrap the original pg error in `cause`.
  for (let depth = 0; depth < 3 && current instanceof Object; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && DRIVER_CONNECTION_CODES.has(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function clientErrorStatus(error: unknown): number | undefined {
  if (!(error instanceof Error) || !('type' in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = mapException(exception);
    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
    }
    host.switchToHttp().getResponse<Response>().status(status).json(body);
  }
}
