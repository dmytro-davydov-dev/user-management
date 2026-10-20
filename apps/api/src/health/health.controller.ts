import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { ApiError } from '@um/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthResponse {
  status: 'ok';
  database: 'up';
}

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
