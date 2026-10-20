import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client';
import { ApiException } from './api-exception';
import { ApiExceptionFilter, mapException } from './api-exception.filter';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('prisma error', { code, clientVersion: 'test' });

describe('mapException', () => {
  it('passes ApiException bodies through unchanged', () => {
    const details = [{ path: 'email', message: 'Invalid' }];
    const result = mapException(
      new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Validation failed', details),
    );
    expect(result).toEqual({
      status: 400,
      body: { code: 'VALIDATION_ERROR', message: 'Validation failed', details },
    });
  });

  it('maps built-in Nest exceptions by status', () => {
    expect(mapException(new BadRequestException('Validation failed (uuid is expected)'))).toEqual({
      status: 400,
      body: { code: 'VALIDATION_ERROR', message: 'Validation failed (uuid is expected)' },
    });
    expect(mapException(new NotFoundException()).body.code).toBe('NOT_FOUND');
  });

  it('maps Prisma P2002 to 409 CONFLICT', () => {
    expect(mapException(prismaError('P2002'))).toMatchObject({
      status: 409,
      body: { code: 'CONFLICT' },
    });
  });

  it('maps Prisma P2025 to 404 NOT_FOUND', () => {
    expect(mapException(prismaError('P2025'))).toMatchObject({
      status: 404,
      body: { code: 'NOT_FOUND' },
    });
  });

  it.each(['P1001', 'P1002', 'P1017'])('maps Prisma %s to 503', (code) => {
    expect(mapException(prismaError(code))).toMatchObject({
      status: 503,
      body: { code: 'SERVICE_UNAVAILABLE' },
    });
  });

  it('maps Prisma initialization errors to 503', () => {
    const error = new Prisma.PrismaClientInitializationError('cannot connect', 'test');
    expect(mapException(error).status).toBe(503);
  });

  it('maps driver connection errors (including wrapped causes) to 503', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    expect(mapException(refused).status).toBe(503);
    expect(mapException(new Error('adapter error', { cause: refused })).status).toBe(503);
  });

  it('maps malformed JSON bodies to 400', () => {
    const parseError = Object.assign(new SyntaxError('Unexpected token'), {
      status: 400,
      type: 'entity.parse.failed',
    });
    expect(mapException(parseError)).toEqual({
      status: 400,
      body: { code: 'VALIDATION_ERROR', message: 'Malformed request body' },
    });
  });

  it('hides unknown errors behind a generic 500', () => {
    expect(mapException(new Error('secret internals'))).toEqual({
      status: 500,
      body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(mapException(prismaError('P2003')).status).toBe(500);
  });
});

describe('ApiExceptionFilter', () => {
  it('writes the mapped status and body to the response', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) };

    new ApiExceptionFilter().catch(prismaError('P2025'), host as never);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ code: 'NOT_FOUND', message: 'Resource not found' });
  });
});
