import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  AuthResponseSchema,
  MeResponseSchema,
  SignInInputSchema,
  SignUpInputSchema,
  type AuthResponse,
  type MeResponse,
  type SignInInput,
  type SignUpInput,
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
import { toAuthResponse } from './auth.mapper';
import { type AuthContext, toPublicSession } from './auth-context';
import { CurrentAuth, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import { toPublicUser } from '../users/user.mapper';

const AUTH_EXAMPLE: AuthResponse = { id: EXAMPLE_SESSION_ID, user: EXAMPLE_USER };
const SIGN_IN_EXAMPLE: SignInInput = { email: 'ada@example.com', password: 'correct-horse' };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('sign-up')
  @ApiOperation({ summary: 'Register and start a session (counts as the first login)' })
  @ApiJsonBody(SignUpInputSchema, {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    password: 'correct-horse',
  })
  @ApiJsonResponse(201, 'User and session created', AuthResponseSchema, AUTH_EXAMPLE)
  @ApiErrors(400, 409)
  async signUp(
    @Body(new ZodValidationPipe(SignUpInputSchema)) body: SignUpInput,
  ): Promise<AuthResponse> {
    return toAuthResponse(await this.auth.signUp(body));
  }

  @Public()
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify credentials and start a session' })
  @ApiJsonBody(SignInInputSchema, SIGN_IN_EXAMPLE)
  @ApiJsonResponse(200, 'Session created', AuthResponseSchema, AUTH_EXAMPLE)
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
  async signIn(
    @Body(new ZodValidationPipe(SignInInputSchema)) body: SignInInput,
  ): Promise<AuthResponse> {
    return toAuthResponse(await this.auth.signIn(body));
  }

  @Get('me')
  @ApiSecurity(SESSION_SECURITY)
  @ApiOperation({ summary: 'Current session and user' })
  @ApiJsonResponse(200, 'Current session and user', MeResponseSchema, {
    session: {
      id: EXAMPLE_SESSION_ID,
      userId: EXAMPLE_USER.id,
      createdAt: '2026-10-20T17:00:00.000Z',
      terminatedAt: null,
      expiresAt: '2026-10-21T17:00:00.000Z',
    },
    user: EXAMPLE_USER,
  } satisfies MeResponse)
  @ApiErrors(401)
  me(@CurrentAuth() auth: AuthContext): MeResponse {
    return { session: toPublicSession(auth.session), user: toPublicUser(auth.user) };
  }
}
