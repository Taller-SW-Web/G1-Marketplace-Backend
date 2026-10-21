import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CartModule } from '../cart/cart.module';
import { PrismaModule } from '../prisma/prisma.module';
import { G7Client } from './g7.client';
import { G7SessionService } from './g7-session.service';
import { SessionStore } from './session.store';
import { SessionMiddleware } from './session.middleware';

@Module({
  imports: [PrismaModule, CartModule],
  controllers: [AuthController],
  providers: [AuthService, G7Client, G7SessionService, SessionStore, SessionMiddleware],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
