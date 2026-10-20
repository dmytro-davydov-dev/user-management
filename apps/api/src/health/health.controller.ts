import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { ApiError } from '@um/shared';
import { Public } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthResponse {
  status: 'ok';
  database: 'up';
}

@Public()
@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    if (!(await this.prisma.ping())) {
      const body: ApiError = { code: 'SERVICE_UNAVAILABLE', message: 'Database unavailable' };
      throw new ServiceUnavailableException(body);
    }
    return { status: 'ok', database: 'up' };
  }
}
