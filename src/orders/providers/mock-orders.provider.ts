import { Injectable } from '@nestjs/common';
import { MOCK_ORDERS, MOCK_ORDER_DETAILS } from '../fixtures/orders.fixture';
import {
  ListOrdersQuery,
  OrdersHistoryResponse,
  OrdersProvider,
} from '../orders.types';

@Injectable()
export class MockOrdersProvider implements OrdersProvider {
  async listForCustomer(
    customerId: string,
    query: ListOrdersQuery,
  ): Promise<OrdersHistoryResponse> {
    const customerOrders = MOCK_ORDERS
      .filter((order) => order.ownerCustomerId === customerId)
      .map((order) => ({
        orderId: order.orderId,
        state: order.state,
        total: order.total,
        createdAt: order.createdAt,
      }))
      .filter((order) => !query.state || order.state === query.state)
      .filter((order) => {
        const createdOn = dateInPeru(order.createdAt);
        return (!query.from || createdOn >= query.from) && (!query.to || createdOn <= query.to);
      })
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

  async getForCustomer(customerId: string, orderId: string) {
    const detail = MOCK_ORDER_DETAILS.find(
      (order) => order.ownerCustomerId === customerId && order.orderId === orderId,
    );
    if (!detail) return null;
    const { ownerCustomerId: _ownerCustomerId, ...publicDetail } = detail;
    return publicDetail;
  }

  async getTrackingForCustomer(customerId: string, orderId: string) {
    const detail = await this.getForCustomer(customerId, orderId);
    if (!detail) return null;
    if (detail.state === 'CREADO' || detail.state === 'PAGADO' || detail.state === 'EN_PREPARACION') return { state: 'NOT_READY', milestones: [] };
    return {
      state: detail.state,
      ...(detail.shipping?.estimatedDelivery ? { estimatedDelivery: detail.shipping.estimatedDelivery } : {}),
      milestones: detail.milestones,
    };
  }
}

function dateInPeru(timestamp: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
