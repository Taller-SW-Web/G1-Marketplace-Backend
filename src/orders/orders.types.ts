export interface OrderTotal {
  amount: number;
  currency: string;
}

export interface OrderSummary {
  orderId: string;
  state: string;
  total: OrderTotal;
  createdAt: string;
}

export interface OrdersPage {
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface OrdersHistoryResponse {
  data: OrderSummary[];
  page: OrdersPage;
}

export interface ListOrdersQuery {
  page: number;
  pageSize: number;
  state?: PublishedOrderState;
  from?: string;
  to?: string;
}

export type PublishedOrderState = 'CREADO' | 'PAGADO' | 'EN_PREPARACION' | 'DESPACHADO' | 'ENTREGADO' | 'ANULADO';

export interface OrdersProvider {
  listForCustomer(
    customerId: string,
    query: ListOrdersQuery,
    accessToken?: string,
  ): Promise<OrdersHistoryResponse>;
  getForCustomer(orderId: string, accessToken?: string, customerId?: string): Promise<OrderSummary>;
}

export const ORDERS_PROVIDER = Symbol('ORDERS_PROVIDER');
