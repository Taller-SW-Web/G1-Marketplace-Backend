import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from './api-error';
import { ApiErrorFilter } from './api-error.filter';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const origins = config.get<string[]>('CORS_ORIGINS', []);
  app.enableCors({
    origin: origins.length ? origins : false,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    exceptionFactory: (errors) => {
      const onlyProduct = errors.length === 1 && errors[0].property === 'productId'
        && !errors[0].constraints?.whitelistValidation;
      return new ApiError(400, onlyProduct ? 'INVALID_PRODUCT_ID' : 'INVALID_REQUEST',
        onlyProduct ? 'Identificador de producto inválido' : 'Cuerpo de solicitud inválido');
    },
  }));
  app.useGlobalFilters(new ApiErrorFilter());
}
