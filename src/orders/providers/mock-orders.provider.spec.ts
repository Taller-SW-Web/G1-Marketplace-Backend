import { MockOrdersProvider } from './mock-orders.provider';

describe('mock orders filters', () => {
  const provider = new MockOrdersProvider();
  const page = { page: 0, pageSize: 10 };

  it('filters the authenticated customer by status before paginating', async () => {
    const result = await provider.listForCustomer('customer-demo-001', { ...page, state: 'PAGADO' });
    expect(result.data.map(({ orderId }) => orderId)).toEqual(['PED-MOCK-001']);
    expect(result.page.totalElements).toBe(1);
  });

  it('uses inclusive Peru dates and supports independent bounds', async () => {
    for (const filters of [
      { from: '2026-09-27', to: '2026-09-27' },
      { from: '2026-09-27' },
    ]) {
      const result = await provider.listForCustomer('customer-demo-001', { ...page, ...filters });
      expect(result.data.map(({ orderId }) => orderId)).toEqual(['PED-MOCK-001']);
    }
    const earlier = await provider.listForCustomer('customer-demo-001', { ...page, to: '2026-09-18' });
    expect(earlier.data.map(({ orderId }) => orderId)).toEqual(['PED-MOCK-002']);
  });
});
