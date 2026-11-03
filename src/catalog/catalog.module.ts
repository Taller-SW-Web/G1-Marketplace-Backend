import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogExceptionFilter } from './catalog-exception.filter';
import { CatalogRequestInterceptor } from './catalog-request.interceptor';
import { createProvider } from './provider';
import { CATALOG_PROVIDER } from './types';
import type { CatalogEnvironment } from './types';

@Module({
  controllers: [CatalogController],
  providers: [
    {
      provide: CATALOG_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const keys = [
          'NODE_ENV', 'CATALOG_SOURCE', 'CATALOG_INTEGRATION_APPROVED',
          'PRODUCTOS_BASE_URL', 'PRODUCTOS_SERVICE_TOKEN', 'PRODUCTOS_AUTH_MODE', 'PRODUCTOS_CONTRACT_VERSION',
          'PRODUCTOS_CONTRACT_SHA', 'PRODUCTOS_MEDIA_HOSTS', 'PRODUCTOS_TIMEOUT_MS',
          'CATALOG_FEATURED_ENABLED', 'CATALOG_FEATURED_APPROVED', 'CATALOG_FEATURED_IDS',
        ];
        const env: CatalogEnvironment = Object.fromEntries(keys.map((key) => [key, config.get<string>(key)]));
        return createProvider(env);
      },
    },
    CatalogService, CatalogExceptionFilter, CatalogRequestInterceptor,
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
