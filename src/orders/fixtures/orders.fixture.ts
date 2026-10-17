import { OrderSummary } from '../orders.types';

/** Synthetic H3 data only. It contains no real customer information. */
export interface FixtureOrder extends OrderSummary {
  ownerCustomerId: string;
}

export const MOCK_ORDERS: readonly FixtureOrder[] = [
  {
    ownerCustomerId: 'customer-demo-001',
    orderId: 'PED-MOCK-001',
    state: 'PAGADO',
    total: { amount: 355, currency: 'PEN' },
    createdAt: '2026-09-27T18:30:00.000Z',
  },
  {
    ownerCustomerId: 'customer-demo-001',
    orderId: 'PED-MOCK-002',
    state: 'CREADO',
    total: { amount: 129.9, currency: 'PEN' },
    createdAt: '2026-09-18T12:15:00.000Z',
  },
  {
    ownerCustomerId: 'customer-demo-002',
    orderId: 'PED-MOCK-003',
    state: 'ANULADO',
    total: { amount: 74.5, currency: 'PEN' },
    createdAt: '2026-09-12T09:00:00.000Z',
  },
];

export const MOCK_CUSTOMER_IDS = [
  'customer-demo-001',
  'customer-demo-002',
  'customer-demo-empty',
] as const;
