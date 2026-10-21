import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseExceptionFilter } from '@nestjs/core';
import { SaveWishlistItemDto, wishlistValidationError } from '../wishlist/product-id';
import { ApiErrorFilter } from './api-error.filter';
import { corsOptions } from './cors-options';
import { requestIdMiddleware } from './request-id.middleware';
import { validationExceptionFactory } from './validation-exception.factory';
import { CreateDeliveryAddressDto } from '../checkout/dto/delivery-address.dto';
import { CreateOrderRequestDto } from '../checkout/dto/contact.dto';
import { ApplyBenefitDto, CreateQuoteDto, PrepareCheckoutDto } from '../checkout/dto/quote.dto';

export function configureApp(app: INestApplication): void {
  app.use(requestIdMiddleware);
  app.use((req: { url: string }, res: { setHeader(name: string, value: string): void }, next: () => void) => {
    if (/^\/api\/v1\/(wishlist|auth)(?:[/?]|$)/.test(req.url)) res.setHeader('Cache-Control', 'no-store, private');
    next();
  });
  const config = app.get(ConfigService);
  const origins = config.get<string[]>('CORS_ORIGINS', []);
  app.enableCors(corsOptions(origins));
  const defaultValidationError = new ValidationPipe().createExceptionFactory();
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    exceptionFactory: (errors) => errors.some((error) => error.target instanceof SaveWishlistItemDto)
      ? wishlistValidationError(errors)
      : errors.some((error) => [CreateDeliveryAddressDto, CreateOrderRequestDto, ApplyBenefitDto, CreateQuoteDto, PrepareCheckoutDto]
        .some((dto) => error.target instanceof dto))
        ? validationExceptionFactory(errors)
        : defaultValidationError(errors),
  }));
  app.useGlobalFilters(new ApiErrorFilter(new BaseExceptionFilter(app.getHttpAdapter())));
}
