import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface ReadinessResult {
  httpStatus: number;
  body: {
    status: 'UP' | 'DOWN';
    service: string;
    environment: string;
    database: {
      connected: boolean;
      carts?: number;
      wishlistItems?: number;
    };
    timestamp: string;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async checkReadiness(): Promise<ReadinessResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const [carts, wishlistItems] = await Promise.all([
        this.prisma.cart.count(),
        this.prisma.wishlistItem.count(),
      ]);

      return {
        httpStatus: 200,
        body: {
          status: 'UP',
          service: 'g1-marketplace-backend',
          environment: this.config.get<string>('NODE_ENV', 'development'),
          database: { connected: true, carts, wishlistItems },
          timestamp: new Date().toISOString(),
        },
      };
    } catch {
      // Keep DB details out of the public health response.
      this.logger.warn('Readiness check failed: database unavailable');
      return {
        httpStatus: 503,
        body: {
          status: 'DOWN',
          service: 'g1-marketplace-backend',
          environment: this.config.get<string>('NODE_ENV', 'development'),
          database: { connected: false },
          timestamp: new Date().toISOString(),
        },
      };
    }
  }
}
