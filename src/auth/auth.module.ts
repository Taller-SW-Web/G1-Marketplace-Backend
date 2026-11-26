import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CartModule } from '../cart/cart.module';
import { PrismaModule } from '../prisma/prisma.module';
import { G7IntegrationModule } from './g7-integration.module';
import { G7SessionService } from './g7-session.service';
import { SessionStore } from './session.store';
import { SessionMiddleware } from './session.middleware';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({
  imports: [PrismaModule, CartModule, G7IntegrationModule],
  controllers: [AuthController, AccountController],
  providers: [AuthService, G7SessionService, SessionStore, SessionMiddleware, AccountService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
