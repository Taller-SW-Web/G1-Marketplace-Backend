import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ListOrdersQuery,
  ORDERS_PROVIDER,
  OrdersHistoryResponse,
  OrdersProvider,
} from './orders.types';
import { MOCK_CUSTOMER_IDS } from './fixtures/orders.fixture';

@Injectable()
export class OrdersService {
  constructor(
    private readonly config: ConfigService,
    @Inject(ORDERS_PROVIDER) private readonly provider: OrdersProvider,
  ) {}

  async listMyOrders(
    customerId: string,
    query: ListOrdersQuery,
    accessToken: string,
  ): Promise<OrdersHistoryResponse> {
    const source = this.config.get<string>('ORDERS_SOURCE', 'unconfigured');
    const environment = this.config.get<string>('NODE_ENV', 'development');

    if (source === 'real' && environment !== 'test') {
      return this.provider.listForCustomer(customerId, query, accessToken);
    }
    if (source !== 'mock' || environment === 'production') {
      throw new ServiceUnavailableException({
        error: { code: 'ORDERS_INTEGRATION_UNAVAILABLE' },
      });
    }

    if (
      !(MOCK_CUSTOMER_IDS as readonly string[]).includes(customerId)
    ) {
      throw new ServiceUnavailableException({
        error: { code: 'MOCK_CUSTOMER_NOT_CONFIGURED' },
      });
    }

    return this.provider.listForCustomer(customerId, query, accessToken);
  }
}
