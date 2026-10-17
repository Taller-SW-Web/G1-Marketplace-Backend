import { Module, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ORDERS_PROVIDER } from './orders.types';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { MockOrdersProvider } from './providers/mock-orders.provider';

@Module({
  controllers: [OrdersController],
  providers: [
    OrdersService,
    MockOrdersProvider,
    {
      provide: ORDERS_PROVIDER,
      inject: [ConfigService, MockOrdersProvider],
      useFactory: (
        config: ConfigService,
        mockProvider: MockOrdersProvider,
      ) => {
        const source = config.get<string>('ORDERS_SOURCE', 'unconfigured');
        const environment = config.get<string>('NODE_ENV', 'development');
        if (source === 'mock' && environment !== 'production') {
          return mockProvider;
        }

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
