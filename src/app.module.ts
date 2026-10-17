import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CheckoutModule } from './checkout/checkout.module';
import { HealthModule } from './health/health.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { CartModule } from './cart/cart.module';

function validateEnvironment(config: Record<string, unknown>) {
  const port = Number(config.PORT ?? 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const databaseUrl = config.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
    throw new Error('DATABASE_URL is required');
  }

  let databaseProtocol: string;
  try {
    databaseProtocol = new URL(databaseUrl).protocol;
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL');
  }
  if (databaseProtocol !== 'postgres:' && databaseProtocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use PostgreSQL');
  }

  const corsOrigins = String(config.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const nodeEnv = String(config.NODE_ENV ?? 'development').toLowerCase();
  const useMocksValue = String(config.USE_MOCKS ?? 'false').toLowerCase();
  if (useMocksValue !== 'true' && useMocksValue !== 'false') {
    throw new Error('USE_MOCKS must be true or false');
  }
  if (useMocksValue === 'true' && nodeEnv === 'production') {
    throw new Error('USE_MOCKS cannot be enabled in production');
  }

  const httpTimeoutMs = Number(config.HTTP_TIMEOUT_MS ?? 3000);
  if (!Number.isInteger(httpTimeoutMs) || httpTimeoutMs < 1 || httpTimeoutMs > 30000) {
    throw new Error('HTTP_TIMEOUT_MS must be an integer between 1 and 30000');
  }

  const authIssuer = String(
    config.AUTH_ISSUER ?? (nodeEnv === 'production' ? '' : 'http://127.0.0.1:4010'),
  );
  const authJwksUrl = String(
    config.AUTH_JWKS_URL ??
      (nodeEnv === 'production' ? '' : 'http://127.0.0.1:4010/jwks'),
  );

  const ordersSource = String(config.ORDERS_SOURCE ?? 'unconfigured');
  if (!['mock', 'unconfigured'].includes(ordersSource)) {
    throw new Error('ORDERS_SOURCE must be mock or unconfigured');
  }
  if (ordersSource === 'mock' && nodeEnv === 'production') {
    throw new Error('ORDERS_SOURCE=mock is not allowed in production');
  }

  return {
    ...config,
    PORT: port,
    CORS_ORIGINS: corsOrigins,
    ORDERS_SOURCE: ordersSource,
    NODE_ENV: nodeEnv,
    USE_MOCKS: useMocksValue === 'true',
    HTTP_TIMEOUT_MS: httpTimeoutMs,
    AUTH_ISSUER: authIssuer,
    AUTH_JWKS_URL: authJwksUrl,
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    HealthModule,
    OrdersModule,
    CartModule,
    CheckoutModule,
  ],
})
export class AppModule {}
