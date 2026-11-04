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

export interface HistoricalOrderLine {
  sku: string;
  description: string;
  quantity: number;
  unitPrice: OrderTotal;
}

export interface OrderMilestone {
  state: string;
  at: string;
}

export interface OrderDetail extends OrderSummary {
  lines: HistoricalOrderLine[];
  milestones: OrderMilestone[];
  shipping?: {
    estimatedDelivery?: string;
    locationSummary?: string;
    emailMasked?: string;
    phoneMasked?: string;
  };
}

export interface OrderTracking {
  state: string;
  estimatedDelivery?: string;
  milestones: OrderMilestone[];
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

export type PublishedOrderState =
  | 'CREADO'
  | 'PAGADO'
  | 'EN_PREPARACION'
  | 'DESPACHADO'
  | 'ENTREGADO'
  | 'ANULADO';

export interface OrdersProvider {
  listForCustomer(
    customerId: string,
    query: ListOrdersQuery,
    accessToken?: string,
  ): Promise<OrdersHistoryResponse>;
  getForCustomer?(customerId: string, orderId: string, accessToken?: string): Promise<OrderDetail | null>;
  getTrackingForCustomer?(customerId: string, orderId: string): Promise<OrderTracking | null>;
}

export const ORDERS_PROVIDER = Symbol('ORDERS_PROVIDER');
