import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MOCK_ORDERS } from '../fixtures/orders.fixture';
import {
  ListOrdersQuery,
  OrdersHistoryResponse,
  OrdersProvider,
} from '../orders.types';

const peruDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
});

@Injectable()
export class MockOrdersProvider implements OrdersProvider {
  async listForCustomer(
    customerId: string,
    query: ListOrdersQuery,
    _accessToken?: string,
  ): Promise<OrdersHistoryResponse> {
    const customerOrders = MOCK_ORDERS
      .filter((order) => {
        if (order.ownerCustomerId !== customerId || (query.state && order.state !== query.state)) return false;
        if (!query.from && !query.to) return true;
        const date = peruDate.format(new Date(order.createdAt));
        return (!query.from || date >= query.from) && (!query.to || date <= query.to);
      })
      .map((order) => ({
        orderId: order.orderId,
        state: order.state,
        total: order.total,
        createdAt: order.createdAt,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const start = query.page * query.pageSize;
    const data = customerOrders.slice(start, start + query.pageSize);

    return {
      data,
      page: {
        number: query.page,
        size: query.pageSize,
        totalElements: customerOrders.length,
        totalPages: Math.ceil(customerOrders.length / query.pageSize),
      },
    };
  }

  async getForCustomer(orderId: string, _accessToken?: string, customerId?: string) {
    const order = MOCK_ORDERS.find((candidate) => candidate.orderId === orderId);
    if (!order) throw new NotFoundException({ error: { code: 'ORDER_NOT_FOUND' } });
    if (order.ownerCustomerId !== customerId) throw new ForbiddenException({ error: { code: 'ORDERS_ACCESS_DENIED' } });
    return {
      orderId: order.orderId,
      state: order.state,
      total: order.total,
      createdAt: order.createdAt,
    };
  }
}
