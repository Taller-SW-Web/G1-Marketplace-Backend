import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseExceptionFilter } from '@nestjs/core';
import { SaveWishlistItemDto, wishlistValidationError } from '../wishlist/product-id';
import { ApiErrorFilter } from './api-error.filter';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const origins = config.get<string[]>('CORS_ORIGINS', []);
  app.enableCors({
    origin: origins.length ? origins : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-customer-id'],
    credentials: true,
  });
  const defaultValidationError = new ValidationPipe().createExceptionFactory();
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    exceptionFactory: (errors) => errors.some((error) => error.target instanceof SaveWishlistItemDto)
      ? wishlistValidationError(errors)
      : defaultValidationError(errors),
  }));
  app.useGlobalFilters(new ApiErrorFilter(new BaseExceptionFilter(app.getHttpAdapter())));
}
