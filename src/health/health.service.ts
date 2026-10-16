import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ReadinessResult {
  httpStatus: number;
  body: {
    status: 'UP' | 'DOWN';
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async checkReadiness(): Promise<ReadinessResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        httpStatus: 200,
        body: {
          status: 'UP',
        },
      };
    } catch {
      // Keep DB details out of the public health response.
      this.logger.warn('Readiness check failed: database unavailable');
      return {
        httpStatus: 503,
        body: {
          status: 'DOWN',
        },
      };
    }
  }
}
