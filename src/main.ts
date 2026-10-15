import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NotFoundFilter } from './http/not-found.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const corsOrigins = config.get<string[]>('CORS_ORIGINS', []);

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        const fieldNames = new Set<string>();
        const visit = (items: typeof errors): void => {
          for (const item of items) {
            fieldNames.add(item.property);
            if (item.children?.length) visit(item.children);
          }
        };
        visit(errors);
        const addressFields = new Set([
          'label', 'street', 'district', 'province', 'department', 'reference', 'phone',
          'customerId', 'userId',
        ]);
        const contactFields = new Set([
          'fullName', 'documentType', 'documentNumber', 'email', 'contact',
        ]);
        let code = 'REQUEST_VALIDATION_ERROR';
        if ([...fieldNames].some((field) => contactFields.has(field))) {
          code = 'CONTACT_VALIDATION_ERROR';
        } else if (fieldNames.has('cartVersion')) {
          code = 'CART_VERSION_REQUIRED';
        } else if ([...fieldNames].some((field) => addressFields.has(field))) {
          code = 'ADDRESS_VALIDATION_ERROR';
        }
        return new BadRequestException({ error: { code, fields: [...fieldNames] } });
      },
    }),
  );
  app.useGlobalFilters(new NotFoundFilter());
  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 10000);
  await app.listen(port, '0.0.0.0');
  console.log(`Marketplace NestJS API listening on port ${port}`);
}

void bootstrap();
