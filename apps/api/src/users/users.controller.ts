import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  CreateUserInputSchema,
  paginatedResponseSchema,
  PaginationQuerySchema,
  UpdateUserInputSchema,
  USERS_PAGE_SIZE,
  UserSchema,
  type PaginatedResponse,
  type PaginationQuery,
  type UpdateUserInput,
  type User,
} from '@um/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  ApiErrors,
  ApiJsonBody,
  ApiJsonResponse,
  EXAMPLE_USER,
  SESSION_SECURITY,
} from '../docs/openapi';
import { type CreateUserData, UsersService } from './users.service';

const uuidPipe = new ParseUUIDPipe();

@ApiTags('users')
@ApiSecurity(SESSION_SECURITY)
@ApiErrors(401)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users, newest first (6 per page)' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: USERS_PAGE_SIZE, default: USERS_PAGE_SIZE },
  })
  @ApiJsonResponse(200, 'One page of users', paginatedResponseSchema(UserSchema), {
    data: [EXAMPLE_USER],
    pagination: { page: 1, limit: 6, total: 1, totalPages: 1 },
  } satisfies PaginatedResponse<User>)
  @ApiErrors(400)
  list(
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
  ): Promise<PaginatedResponse<User>> {
    return this.users.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a user' })
  @ApiJsonBody(CreateUserInputSchema, {
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    password: 'cobol-1959',
    status: 'ACTIVE',
  })
  @ApiJsonResponse(201, 'User created', UserSchema, { ...EXAMPLE_USER, loginsCount: 0 })
  @ApiErrors(400, 409)
  create(@Body(new ZodValidationPipe(CreateUserInputSchema)) body: CreateUserData): Promise<User> {
    return this.users.create(body);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update names and/or status',
    description:
      'Status is applied first: reactivate + rename succeeds; renaming an inactive user is 403.',
  })
  @ApiJsonBody(UpdateUserInputSchema, { firstName: 'Augusta', status: 'ACTIVE' })
  @ApiJsonResponse(200, 'Updated user', UserSchema, { ...EXAMPLE_USER, firstName: 'Augusta' })
  @ApiErrors(
    400,
    [
      403,
      'Inactive users cannot change their name',
      {
        code: 'USER_INACTIVE',
        message: 'Inactive users cannot change their name',
      },
    ],
    404,
  )
  update(
    @Param('id', uuidPipe) id: string,
    @Body(new ZodValidationPipe(UpdateUserInputSchema)) body: UpdateUserInput,
  ): Promise<User> {
    return this.users.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user and all of its sessions' })
  @ApiErrors(400, 404)
  delete(@Param('id', uuidPipe) id: string): Promise<void> {
    return this.users.delete(id);
  }
}
