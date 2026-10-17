import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export function corsOptions(origins: string[]): CorsOptions {
  return {
    origin: origins.length > 0 ? origins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'x-customer-id'],
  };
}
