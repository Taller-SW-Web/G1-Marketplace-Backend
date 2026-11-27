import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '../security/auth.guard';
import { MockHttpAdapter } from './external/mock-http.adapter';
import { MarketplaceGateway } from './external/marketplace.gateway';
import { G5SalesProvider } from './external/g5-sales.provider';
import { G7SalesTokenProvider } from './external/g7-sales-token.provider';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { QuotesService } from './quotes.service';
import { G7IntegrationModule } from '../auth/g7-integration.module';

@Module({
  imports: [
    G7IntegrationModule,
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
    G5SalesProvider,
    G7SalesTokenProvider,
    QuotesService,
    CheckoutService,
  ],
})
export class CheckoutModule {}
