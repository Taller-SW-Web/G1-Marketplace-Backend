import { Module, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ORDERS_PROVIDER } from './orders.types';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { MockOrdersProvider } from './providers/mock-orders.provider';
import { G5OrdersProvider } from './providers/g5-orders.provider';
import { OptionalAuthGuard } from '../security/optional-auth.guard';
import { AuthGuard } from '../security/auth.guard';
import { G7IntegrationModule } from '../auth/g7-integration.module';
import { CartModule } from '../cart/cart.module';
import { ReorderService } from './reorder.service';
import { MockReorderCommerceProvider } from './providers/mock-reorder-commerce.provider';
import { REORDER_COMMERCE_PROVIDER } from './reorder.types';

@Module({
  imports: [G7IntegrationModule, CartModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    ReorderService,
    MockOrdersProvider,
    MockReorderCommerceProvider,
    G5OrdersProvider,
    AuthGuard,
    OptionalAuthGuard,
    {
      provide: ORDERS_PROVIDER,
      inject: [ConfigService, MockOrdersProvider, G5OrdersProvider],
      useFactory: (
        config: ConfigService,
        mockProvider: MockOrdersProvider,
        g5Provider: G5OrdersProvider,
      ) => {
        const source = config.get<string>('ORDERS_SOURCE', 'unconfigured');
        const environment = config.get<string>('NODE_ENV', 'development');
        if (source === 'mock' && environment !== 'production') {
          return mockProvider;
        }
        if (source === 'g5') return g5Provider;

        return {
          listForCustomer: async () => {
            throw new ServiceUnavailableException({
              error: { code: 'ORDERS_INTEGRATION_UNAVAILABLE' },
            });
          },
        };
      },
    },
    {
      provide: REORDER_COMMERCE_PROVIDER,
      inject: [ConfigService, MockReorderCommerceProvider],
      useFactory: (config: ConfigService, mockProvider: MockReorderCommerceProvider) =>
        config.get<string>('REORDER_SOURCE') === 'mock'
          ? mockProvider
          : { checkSku: async () => { throw new ServiceUnavailableException({ error: { code: 'COMMERCE_DATA_UNAVAILABLE' } }); } },
    },
  ],
})
export class OrdersModule {}
