import { OrderDetail, OrderSummary } from '../orders.types';

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
    state: 'DESPACHADO',
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
  {
    ownerCustomerId: 'customer-demo-002',
    orderId: 'PED-MOCK-004',
    state: 'DESPACHADO',
    total: { amount: 210, currency: 'PEN' },
    createdAt: '2026-10-02T16:00:00.000Z',
  },
];

export const MOCK_CUSTOMER_IDS = [
  'customer-demo-001',
  'customer-demo-002',
  'customer-demo-empty',
] as const;

/** Synthetic detail snapshots. Prices and descriptions are historical fixtures. */
export const MOCK_ORDER_DETAILS: readonly (OrderDetail & { ownerCustomerId: string })[] = [
  {
    ...MOCK_ORDERS[0],
    lines: [
      { sku: 'MOCK-AERO-42', description: 'Audífonos inalámbricos (snapshot de prueba)', quantity: 1, unitPrice: { amount: 355, currency: 'PEN' } },
    ],
    milestones: [
      { state: 'CREADO', at: '2026-09-27T18:30:00.000Z' },
      { state: 'PAGADO', at: '2026-09-27T18:35:00.000Z' },
    ],
    shipping: { estimatedDelivery: '2026-10-02', locationSummary: 'San Isidro, Lima', emailMasked: 'c•••@•••', phoneMasked: '••••••888' },
  },
  {
    ...MOCK_ORDERS[1],
    lines: [
      { sku: 'MOCK-CASE-01', description: 'Funda protectora (snapshot de prueba)', quantity: 1, unitPrice: { amount: 129.9, currency: 'PEN' } },
    ],
    milestones: [
      { state: 'CREADO', at: '2026-09-18T12:15:00.000Z' },
      { state: 'PAGADO', at: '2026-09-18T12:18:00.000Z' },
      { state: 'EN_PREPARACION', at: '2026-09-19T10:00:00.000Z' },
      { state: 'DESPACHADO', at: '2026-09-20T09:30:00.000Z' },
    ],
    shipping: { estimatedDelivery: '2026-09-25', locationSummary: 'Miraflores, Lima', emailMasked: 'c•••@•••', phoneMasked: '••••••888' },
  },
  {
    ...MOCK_ORDERS[2],
    lines: [
      { sku: 'MOCK-CABLE-01', description: 'Cable USB (snapshot de prueba)', quantity: 1, unitPrice: { amount: 74.5, currency: 'PEN' } },
    ],
    milestones: [
      { state: 'CREADO', at: '2026-09-12T09:00:00.000Z' },
      { state: 'ANULADO', at: '2026-09-12T09:10:00.000Z' },
    ],
  },
  {
    ...MOCK_ORDERS[3],
    lines: [
      { sku: 'MOCK-TEE-02', description: 'Polo deportivo (snapshot de prueba)', quantity: 1, unitPrice: { amount: 210, currency: 'PEN' } },
    ],
    milestones: [
      { state: 'CREADO', at: '2026-10-02T16:00:00.000Z' },
      { state: 'PAGADO', at: '2026-10-02T16:05:00.000Z' },
      { state: 'EN_PREPARACION', at: '2026-10-03T10:00:00.000Z' },
      { state: 'DESPACHADO', at: '2026-10-04T09:30:00.000Z' },
    ],
    shipping: { estimatedDelivery: '2026-10-08', locationSummary: 'San Isidro, Lima', emailMasked: 'c•••@•••', phoneMasked: '••••••888' },
  },
];
