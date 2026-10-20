import { applyDecorators, type INestApplication } from '@nestjs/common';
import { ApiBody, ApiResponse, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { type ApiError, ApiErrorSchema, SESSION_HEADER, type User } from '@um/shared';
import { z } from 'zod';

export const SESSION_SECURITY = 'session';

type SchemaObject = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];
type OpenAPIObject = ReturnType<typeof SwaggerModule.createDocument>;

/**
 * OpenAPI schema generated from the shared Zod contract, so docs cannot drift from validation.
 * Zod's verbose regex `pattern`s (uuid, datetime) are dropped; `format` already says it.
 */
export function openApiSchema(
  schema: z.ZodType,
  io: 'input' | 'output',
  example?: unknown,
): SchemaObject {
  const json = stripPatterns(z.toJSONSchema(schema, { io, target: 'openapi-3.0' })) as object;
  return (example === undefined ? json : { ...json, example }) as SchemaObject;
}

function stripPatterns(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPatterns);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'pattern' && key !== '$schema')
      .map(([key, v]) => [key, stripPatterns(v)]),
  );
}

export const ApiJsonBody = (schema: z.ZodType, example: unknown): MethodDecorator =>
  ApiBody({ schema: openApiSchema(schema, 'input', example) });

export const ApiJsonResponse = (
  status: number,
  description: string,
  schema: z.ZodType,
  example: unknown,
): MethodDecorator =>
  ApiResponse({ status, description, schema: openApiSchema(schema, 'output', example) });

const ERROR_EXAMPLES: Record<number, ApiError> = {
  400: {
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    details: [{ path: 'email', message: 'Invalid email address' }],
  },
  401: { code: 'UNAUTHORIZED', message: 'A valid session is required (X-Session-Id header)' },
  403: { code: 'USER_INACTIVE', message: 'Account is inactive' },
  404: { code: 'NOT_FOUND', message: 'Resource not found' },
  409: { code: 'EMAIL_TAKEN', message: 'Email is already registered' },
};

/** Documents error responses with the shared `{ code, message, details? }` shape. */
export function ApiErrors(
  ...entries: Array<number | [number, string, ApiError?]>
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...entries.map((entry) => {
      const [status, description, example] = Array.isArray(entry) ? entry : [entry];
      return ApiResponse({
        status,
        description: description ?? ERROR_EXAMPLES[status]?.code ?? 'Error',
        schema: openApiSchema(ApiErrorSchema, 'output', example ?? ERROR_EXAMPLES[status]),
      });
    }),
  );
}

export const EXAMPLE_USER: User = {
  id: '6f1c2b8e-3c1a-4d0e-9f53-2b1f8f7f4a10',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  status: 'ACTIVE',
  loginsCount: 1,
  createdAt: '2026-10-20T17:00:00.000Z',
  updatedAt: '2026-10-20T17:00:00.000Z',
};

export const EXAMPLE_SESSION_ID = '0b6f9c3e-6d2a-4f61-8a57-3c9e1d2f4b80';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('User Management API')
    .setDescription(
      `Session-authenticated user management. Send the session id returned by sign-up / sign-in ` +
        `in the \`${SESSION_HEADER}\` header on every protected request.`,
    )
    .setVersion('0.1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Session-Id' }, SESSION_SECURITY)
    .build();
  return SwaggerModule.createDocument(app, config);
}

/** Serves Swagger UI at /docs and the JSON at /docs-json. Call only outside production. */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, () => buildOpenApiDocument(app));
}
