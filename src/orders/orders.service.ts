import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ListOrdersQuery,
  ORDERS_PROVIDER,
  OrdersHistoryResponse,
  OrdersProvider,
} from './orders.types';
import { MOCK_CUSTOMER_IDS } from './fixtures/orders.fixture';
import { PrismaService } from '../prisma/prisma.service';
import { parseShipmentStatusUpdatedEvent } from '../webhooks/ventas/shipment-event';

@Injectable()
export class OrdersService {
  constructor(
    private readonly config: ConfigService,
    @Inject(ORDERS_PROVIDER) private readonly provider: OrdersProvider,
    private readonly prisma: PrismaService,
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

  async getOrderForCustomer(customerId: string, orderId: string, accessToken: string) {
    const source = this.config.get<string>('ORDERS_SOURCE', 'unconfigured');
    const environment = this.config.get<string>('NODE_ENV', 'development');
    if (source === 'real' && environment !== 'test') {
      return this.provider.getForCustomer(orderId, accessToken, customerId);
    }
    if (source !== 'mock' || environment === 'production') {
      throw new ServiceUnavailableException({ error: { code: 'ORDERS_INTEGRATION_UNAVAILABLE' } });
    }
    if (!(MOCK_CUSTOMER_IDS as readonly string[]).includes(customerId)) {
      throw new ServiceUnavailableException({ error: { code: 'MOCK_CUSTOMER_NOT_CONFIGURED' } });
    }
    return this.provider.getForCustomer(orderId, accessToken, customerId);
  }

  async getMyOrderTracking(customerId: string, orderId: string, accessToken: string) {
    // G5 authorizes the buyer before the local inbox can be consulted.
    const summary = await this.getOrderForCustomer(customerId, orderId, accessToken);
    if (summary.orderId !== orderId) {
      throw new NotFoundException({ error: { code: 'ORDER_NOT_FOUND' } });
    }

    let state = summary.state;
    let trackingNumber: string | undefined;
    let estimatedDelivery: string | undefined;
    const milestones: Array<{ state: string; at: string }> = [];

    if (this.config.get<string>('ORDERS_SOURCE') === 'real') {
      const rows = await this.prisma.shipmentEventInbox.findMany({
        where: { orderId },
        select: { payload: true },
      });
      const events = rows.flatMap(({ payload }) => {
        const event = parseShipmentStatusUpdatedEvent(payload);
        return event?.data.orderId === orderId && (
          event.data.publicStatus === 'DESPACHADO' || event.data.publicStatus === 'ENTREGADO'
        ) ? [event] : [];
      }).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
        || a.eventId.localeCompare(b.eventId));

      const seenMilestones = new Set<string>();
      for (const { data, timestamp } of events) {
        const at = new Date(timestamp).toISOString();
        const key = `${data.publicStatus}:${at}`;
        if (!seenMilestones.has(key)) {
          seenMilestones.add(key);
          milestones.push({ state: data.publicStatus, at });
        }
        // An out-of-order dispatch cannot regress a delivered or cancelled order.
        if (state === 'ANULADO') continue;
        if (state === 'ENTREGADO' && data.publicStatus === 'DESPACHADO') {
          trackingNumber ??= data.trackingNumber;
          continue;
        }
        state = data.publicStatus;
        trackingNumber = data.trackingNumber;
        estimatedDelivery = data.estimatedDeliveryDate ?? undefined;
      }
    }

    if (state === 'CREADO' || state === 'PAGADO' || state === 'EN_PREPARACION') return null;
    return {
      state,
      ...(trackingNumber ? { trackingNumber } : {}),
      ...(estimatedDelivery ? { estimatedDelivery } : {}),
      milestones,
    };
  }
}
