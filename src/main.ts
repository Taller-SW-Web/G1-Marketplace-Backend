import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './http/configure-app';
import { requestIdMiddleware } from './http/request-id.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  configureApp(app);
  // Correlación de respuestas (contrato API-F011 §3): conserva o genera
  // `X-Request-Id` en toda petición, también en las que no matchean ruta.
  app.use(requestIdMiddleware);
  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 10000);
  await app.listen(port, '0.0.0.0');
  console.log(`Marketplace NestJS API listening on port ${port}`);
}

void bootstrap();
