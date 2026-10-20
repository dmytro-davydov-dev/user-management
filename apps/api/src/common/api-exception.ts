import { HttpException, type HttpStatus } from '@nestjs/common';
import type { ApiError, ErrorCode } from '@um/shared';

/** HttpException whose response body is already the shared `{ code, message, details? }` shape. */
export class ApiException extends HttpException {
  constructor(status: HttpStatus, code: ErrorCode, message: string, details?: unknown) {
    const body: ApiError = details === undefined ? { code, message } : { code, message, details };
    super(body, status);
  }
}
