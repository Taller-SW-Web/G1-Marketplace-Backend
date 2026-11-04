import { MockOrdersProvider } from './mock-orders.provider';

describe('MockOrdersProvider', () => {
  const provider = new MockOrdersProvider();

  it('filters by owner, published state and inclusive Peru calendar dates before pagination', async () => {
    const result = await provider.listForCustomer('customer-demo-001', {
      page: 0,
      pageSize: 10,
      state: 'PAGADO',
      from: '2026-09-27',
      to: '2026-09-27',
    });

    expect(result.data.map((order) => order.orderId)).toEqual(['PED-MOCK-001']);
    expect(result.page).toEqual({ number: 0, size: 10, totalElements: 1, totalPages: 1 });
    expect(result.data[0]).not.toHaveProperty('ownerCustomerId');
  });

  it('does not expose another customer’s orders and returns a valid empty page', async () => {
    const result = await provider.listForCustomer('customer-demo-empty', {
      page: 0,
      pageSize: 10,
    });

    expect(result.data).toEqual([]);
    expect(result.page).toEqual({ number: 0, size: 10, totalElements: 0, totalPages: 0 });
  });

  it('applies filters before slicing the selected page', async () => {
    const result = await provider.listForCustomer('customer-demo-001', {
      page: 1,
      pageSize: 1,
      from: '2026-09-01',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].orderId).toBe('PED-MOCK-002');
    expect(result.page.totalElements).toBe(2);
    expect(result.page.totalPages).toBe(2);
  });

  it('returns only the owner’s historical snapshot and neutralizes another owner', async () => {
    const owned = await provider.getForCustomer('customer-demo-002', 'PED-MOCK-004');
    const otherOwner = await provider.getForCustomer('customer-demo-001', 'PED-MOCK-004');
    expect(owned?.total.amount).toBe(210);
    expect(owned?.lines[0].unitPrice.amount).toBe(210);
    expect(owned).not.toHaveProperty('ownerCustomerId');
    expect(otherOwner).toBeNull();
  });

  it('distinguishes mock tracking not ready from an available tracking timeline', async () => {
    expect(await provider.getTrackingForCustomer('customer-demo-001', 'PED-MOCK-001')).toEqual({ state: 'NOT_READY', milestones: [] });
    const available = await provider.getTrackingForCustomer('customer-demo-002', 'PED-MOCK-004');
    expect(available?.state).toBe('DESPACHADO');
    expect(available?.milestones).toHaveLength(4);
    expect(available).not.toHaveProperty('coordinates');
  });
});
