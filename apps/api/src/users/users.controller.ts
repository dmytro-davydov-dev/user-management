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
import {
  CreateUserInputSchema,
  PaginationQuerySchema,
  UpdateUserInputSchema,
  type PaginatedResponse,
  type PaginationQuery,
  type UpdateUserInput,
  type User,
} from '@um/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { type CreateUserData, UsersService } from './users.service';

const uuidPipe = new ParseUUIDPipe();

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
  ): Promise<PaginatedResponse<User>> {
    return this.users.list(query);
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateUserInputSchema)) body: CreateUserData): Promise<User> {
    return this.users.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', uuidPipe) id: string,
    @Body(new ZodValidationPipe(UpdateUserInputSchema)) body: UpdateUserInput,
  ): Promise<User> {
    return this.users.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', uuidPipe) id: string): Promise<void> {
    return this.users.delete(id);
  }
}
