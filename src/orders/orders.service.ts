import { Inject, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ListOrdersQuery,
  ORDERS_PROVIDER,
  OrdersHistoryResponse,
  OrdersProvider,
} from './orders.types';
import { MOCK_CUSTOMER_IDS } from './fixtures/orders.fixture';
import { PrismaService } from '../prisma/prisma.service';
import { ShipmentEventConsumerService } from '../notifications/shipment-event-consumer.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly config: ConfigService,
    @Inject(ORDERS_PROVIDER) private readonly provider: OrdersProvider,
    private readonly prisma: PrismaService,
    private readonly shipmentEvents: ShipmentEventConsumerService,
  ) {}

  async listMyOrders(
    query: ListOrdersQuery,
    accessToken?: string,
  ): Promise<OrdersHistoryResponse> {
    const source = this.config.get<string>('ORDERS_SOURCE', 'unconfigured');
    const environment = this.config.get<string>('NODE_ENV', 'development');
    if (source === 'g5') {
      if (!accessToken) throw new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } });
      return this.provider.listForCustomer('', query, accessToken);
    }
    if (source !== 'mock' || environment === 'production') {
      throw new ServiceUnavailableException({
        error: { code: 'ORDERS_INTEGRATION_UNAVAILABLE' },
      });
    }

    const mockCustomerId = this.config.get<string>('ORDERS_MOCK_CUSTOMER_ID');

    if (
      !mockCustomerId ||
      !(MOCK_CUSTOMER_IDS as readonly string[]).includes(mockCustomerId)
    ) {
      throw new ServiceUnavailableException({
        error: { code: 'MOCK_CUSTOMER_NOT_CONFIGURED' },
      });
    }

    return this.provider.listForCustomer(mockCustomerId, query);
  }

  async getMyOrder(orderId: string, accessToken?: string) {
    const source = this.config.get<string>('ORDERS_SOURCE', 'unconfigured');
    const environment = this.config.get<string>('NODE_ENV', 'development');
    if (source === 'g5') {
      if (!accessToken) throw new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } });
      const detail = await this.provider.getForCustomer?.('', orderId, accessToken);
      if (!detail) throw new NotFoundException({ error: { code: 'ORDER_NOT_AVAILABLE' } });
      return { data: detail };
    }
    if (source !== 'mock' || environment === 'production') {
      throw new ServiceUnavailableException({ error: { code: 'ORDERS_INTEGRATION_UNAVAILABLE' } });
    }
    const mockCustomerId = this.config.get<string>('ORDERS_MOCK_CUSTOMER_ID');
    if (!mockCustomerId || !(MOCK_CUSTOMER_IDS as readonly string[]).includes(mockCustomerId)) {
      throw new ServiceUnavailableException({ error: { code: 'MOCK_CUSTOMER_NOT_CONFIGURED' } });
    }
    const detail = await this.provider.getForCustomer?.(mockCustomerId, orderId);
    if (!detail) {
      // Neutral response avoids exposing whether an ID belongs to another fixture customer.
      throw new NotFoundException({ error: { code: 'ORDER_NOT_AVAILABLE' } });
    }
    return { data: detail };
  }

  async getMyOrderTracking(orderId: string, accessToken?: string) {
    const source = this.config.get<string>('ORDERS_SOURCE', 'unconfigured');
    const environment = this.config.get<string>('NODE_ENV', 'development');
    if (source === 'g5') {
      if (!accessToken) throw new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } });
      const detail = await this.provider.getForCustomer?.('', orderId, accessToken);
      if (!detail) throw new NotFoundException({ error: { code: 'ORDER_NOT_AVAILABLE' } });

      // G5 proves ownership using the caller's session. Only then may G1 expose
      // the webhook projection associated with this order.
      await this.shipmentEvents.reconcilePendingNotifications(orderId);
      const events = await this.prisma.shipmentWebhookEvent.findMany({
        where: { orderId },
        orderBy: [{ occurredAt: 'asc' }, { eventId: 'asc' }],
      });
      const milestones = [...detail.milestones];
      for (const event of events) {
        const at = event.occurredAt.toISOString();
        if (!milestones.some((milestone) => milestone.state === event.publicStatus && Date.parse(milestone.at) === event.occurredAt.getTime())) {
          milestones.push({ state: event.publicStatus, at });
        }
      }
      milestones.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));

      const latestEvent = events.at(-1);
      if (latestEvent) {
        return {
          status: 200,
          body: { data: {
            state: latestEvent.publicStatus,
            trackingNumber: latestEvent.trackingNumber,
            ...(latestEvent.estimatedDeliveryDate
              ? { estimatedDelivery: latestEvent.estimatedDeliveryDate.toISOString().slice(0, 10) }
              : {}),
            milestones,
          } },
        };
      }
      if (detail.state === 'CREADO' || detail.state === 'PAGADO' || detail.state === 'EN_PREPARACION') {
        return { status: 202, body: { error: { code: 'TRACKING_NOT_READY' } } };
      }
      return {
        status: 200,
        body: { data: {
          state: detail.state,
          ...(detail.shipping?.estimatedDelivery ? { estimatedDelivery: detail.shipping.estimatedDelivery } : {}),
          milestones,
        } },
      };
    }
    if (source !== 'mock' || environment === 'production') {
      throw new ServiceUnavailableException({ error: { code: 'TRACKING_UNAVAILABLE' } });
    }
    const mockCustomerId = this.config.get<string>('ORDERS_MOCK_CUSTOMER_ID');
    if (!mockCustomerId || !(MOCK_CUSTOMER_IDS as readonly string[]).includes(mockCustomerId)) {
      throw new ServiceUnavailableException({ error: { code: 'MOCK_CUSTOMER_NOT_CONFIGURED' } });
    }
    const tracking = await this.provider.getTrackingForCustomer?.(mockCustomerId, orderId);
    if (!tracking) throw new NotFoundException({ error: { code: 'ORDER_NOT_AVAILABLE' } });
    return tracking.state === 'NOT_READY'
      ? { status: 202, body: { error: { code: 'TRACKING_NOT_READY' } } }
      : { status: 200, body: { data: tracking } };
  }
}
