import { HttpModule } from '@nestjs/axios';
import { Module, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ORDERS_PROVIDER } from './orders.types';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { MockOrdersProvider } from './providers/mock-orders.provider';
import { G5OrdersProvider } from './providers/g5-orders.provider';
import { AuthGuard } from '../security/auth.guard';
import { G7IntegrationModule } from '../auth/g7-integration.module';

@Module({
  imports: [G7IntegrationModule, HttpModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    MockOrdersProvider,
    G5OrdersProvider,
    AuthGuard,
    {
      provide: ORDERS_PROVIDER,
      inject: [ConfigService, MockOrdersProvider, G5OrdersProvider],
      useFactory: (
        config: ConfigService,
        mockProvider: MockOrdersProvider,
        realProvider: G5OrdersProvider,
      ) => {
        const source = config.get<string>('ORDERS_SOURCE', 'unconfigured');
        const environment = config.get<string>('NODE_ENV', 'development');
        if (source === 'mock' && environment !== 'production') {
          return mockProvider;
        }
        if (source === 'real' && environment !== 'test' && config.get<string>('G5_SALES_INTEGRATION_APPROVED') === 'true' &&
            config.get<boolean>('USE_MOCKS', false) === false) return realProvider;

        return {
          listForCustomer: async () => {
            throw new ServiceUnavailableException({
              error: { code: 'ORDERS_INTEGRATION_UNAVAILABLE' },
            });
          },
        };
      },
    },
  ],
})
export class OrdersModule {}
