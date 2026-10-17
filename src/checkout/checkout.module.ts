import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '../security/auth.guard';
import { MockHttpAdapter } from './external/mock-http.adapter';
import { MarketplaceGateway } from './external/marketplace.gateway';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { QuotesService } from './quotes.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        timeout: config.get<number>('HTTP_TIMEOUT_MS', 3000),
      }),
    }),
  ],
  controllers: [CheckoutController],
  providers: [
    AuthGuard,
    MockHttpAdapter,
    MarketplaceGateway,
    QuotesService,
    CheckoutService,
  ],
})
export class CheckoutModule {}
