import { Injectable } from '@nestjs/common';
import { MOCK_ORDERS } from '../fixtures/orders.fixture';
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
}
