export interface Money {
  amount: number;
  currency: string;
}

export interface DeliveryAddress {
  addressId: string;
  label?: string;
  street: string;
  district: string;
  province: string;
  department: string;
  reference?: string;
  phone: string;
}

export interface QuoteLine {
  sku: string;
  quantity: number;
}

export interface CheckoutQuote {
  quoteId: string;
  expiresAt: string;
  subtotal: Money;
  discount: Money;
  shipping: Money & { estimatedDays: number };
  total: Money;
  lines: QuoteLine[];
  addressId: string;
  cartVersion: number;
  selectedBenefit?: {
    type: 'COUPON';
    id: string;
    discount: Money;
  };
}

export interface CheckoutContact {
  fullName: string;
  documentType: 'DNI' | 'RUC' | 'CE' | 'PASAPORTE';
  documentNumber: string;
  phone: string;
  email: string;
}

export interface SalesOrder {
  pedidoId: string;
  estado: 'CREADO' | 'PAGADO' | 'ANULADO';
  total: Money;
  createdAt: string;
  failureCode?: string;
}

export interface CheckoutOperationView {
  checkoutOperationId: string;
  state: 'PREPARED' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
  orderId?: string;
  orderState?: SalesOrder['estado'];
  total?: Money;
  createdAt?: string;
  revalidatedAt?: string;
  failureCode?: string;
  recoveryRequired?: boolean;
}

export interface CheckoutOperationStatusView {
  state: CheckoutOperationView['state'];
  order?: {
    orderId: string;
    state: SalesOrder['estado'];
    total: Money;
    createdAt: string;
  };
  failureCode?: string;
  recoveryRequired?: boolean;
}
