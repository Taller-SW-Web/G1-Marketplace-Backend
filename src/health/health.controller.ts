import { Controller, Get, Res } from '@nestjs/common';
import { HealthService, ReadinessResult } from './health.service';

interface StatusResponse {
  status(code: number): unknown;
}

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get(['', 'health', 'ready'])
  async checkReadiness(
    @Res({ passthrough: true }) response: StatusResponse,
  ): Promise<ReadinessResult['body']> {
    const result = await this.health.checkReadiness();
    response.status(result.httpStatus);
    return result.body;
  }

  @Get('live')
  checkLiveness() {
    return {
      status: 'UP',
      service: 'g1-marketplace-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
