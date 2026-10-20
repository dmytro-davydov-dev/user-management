import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  AuthResponseSchema,
  SignInInputSchema,
  type AuthResponse,
  type SignInInput,
} from '@um/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  ApiErrors,
  ApiJsonBody,
  ApiJsonResponse,
  EXAMPLE_SESSION_ID,
  EXAMPLE_USER,
  SESSION_SECURITY,
} from '../docs/openapi';
import type { AuthContext } from './auth-context';
import { AllowEndedSession, CurrentAuth, Public } from './auth.decorators';
import { toAuthResponse } from './auth.mapper';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
  ) {}

  /** Credential-verified: the body is `{ email, password }`; a bare `userId` is rejected (400). */
  @Public()
  @Post()
  @ApiOperation({ summary: 'Create a session from email + password' })
  @ApiJsonBody(SignInInputSchema, { email: 'ada@example.com', password: 'correct-horse' })
  @ApiJsonResponse(201, 'Session created', AuthResponseSchema, {
    id: EXAMPLE_SESSION_ID,
    user: EXAMPLE_USER,
  })
  @ApiErrors(
    400,
    [
      401,
      'Invalid credentials',
      {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      },
    ],
    403,
  )
  async create(
    @Body(new ZodValidationPipe(SignInInputSchema)) body: SignInInput,
  ): Promise<AuthResponse> {
    return toAuthResponse(await this.auth.signIn(body));
  }

  /**
   * Terminates one of the caller's own sessions. Idempotent: an already-terminated (or
   * expired) caller session is still accepted here, so a repeated sign-out returns 204.
   */
  @Delete(':id')
  @AllowEndedSession()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiSecurity(SESSION_SECURITY)
  @ApiOperation({ summary: "Terminate one of the caller's sessions (idempotent)" })
  @ApiErrors(400, 401, [
    404,
    'Unknown session or owned by another user',
    {
      code: 'NOT_FOUND',
      message: 'Session not found',
    },
  ])
  async terminate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    await this.sessions.terminate(id, auth.user.id);
  }
}
