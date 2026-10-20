import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ApiException } from './api-exception';

export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Parses a request part with a shared Zod schema. Schemas are `.strict()`, so unknown
 * keys are rejected rather than silently dropped. Returns the parsed (trimmed, defaulted) value.
 */
@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const details: ValidationIssue[] = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Validation failed',
        details,
      );
    }
    return result.data;
  }
}
