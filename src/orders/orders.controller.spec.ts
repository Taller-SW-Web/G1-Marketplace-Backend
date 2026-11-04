import { ApiError } from '../http/api-error';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('OrdersController', () => {
  const service = { listMyOrders: jest.fn(), getMyOrder: jest.fn(), getMyOrderTracking: jest.fn() } as unknown as OrdersService;
  const config = { get: jest.fn((key: string) => key === 'ORDERS_SOURCE' ? 'mock' : 'test') };
  const response = { setHeader: jest.fn(), status: jest.fn() };
  const reorderService = { reorder: jest.fn() };
  const controller = new OrdersController(service, config as never, reorderService as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a bad range before calling the provider service', async () => {
    await expect(controller.listMyOrders({ from: '2026-10-02', to: '2026-10-01' }, response))
      .rejects.toMatchObject({ status: 400, response: { code: 'RANGO_FECHAS_INVALIDO' } });
    expect(service.listMyOrders).not.toHaveBeenCalled();
  });

  it('maps accepted query values to the local orders service', async () => {
    (service.listMyOrders as jest.Mock).mockResolvedValue({ data: [], page: { number: 0, size: 10, totalElements: 0, totalPages: 0 } });
    await controller.listMyOrders({ state: 'PAGADO', from: '2026-10-01', to: '2026-10-31', page: '1' }, response);
    expect(service.listMyOrders).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      state: 'PAGADO',
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('rejects unknown query parameters, including attempts to choose a customer', async () => {
    await expect(controller.listMyOrders({ customerId: 'customer-demo-002' }, response)).rejects.toBeInstanceOf(ApiError);
    expect(service.listMyOrders).not.toHaveBeenCalled();
  });

  it('returns an order detail only through the validated path identifier', async () => {
    (service.getMyOrder as jest.Mock).mockResolvedValue({ data: { orderId: 'PED-MOCK-004' } });
    await expect(controller.getMyOrder('PED-MOCK-004')).resolves.toEqual({ data: { orderId: 'PED-MOCK-004' } });
    await expect(controller.getMyOrder('bad/id')).rejects.toMatchObject({ status: 400 });
    expect(service.getMyOrder).toHaveBeenCalledTimes(1);
  });

  it('preserves the 202 tracking-not-ready contract', async () => {
    (service.getMyOrderTracking as jest.Mock).mockResolvedValue({ status: 202, body: { error: { code: 'TRACKING_NOT_READY' } } });
    await expect(controller.getMyOrderTracking('PED-MOCK-002', response)).resolves.toEqual({ error: { code: 'TRACKING_NOT_READY' } });
    expect(response.status).toHaveBeenCalledWith(202);
  });

  it('accepts only an empty reorder body and forwards the authenticated owner', async () => {
    reorderService.reorder.mockResolvedValue({ data: { cartId: 'cart-1', version: 2, added: [], adjustments: [] } });
    await expect(controller.reorder('PED-MOCK-001', undefined, {
      user: { sub: '11111111-1111-4111-8111-111111111111' },
      headers: { authorization: 'Bearer fixture-token', 'idempotency-key': '33333333-3333-4333-8333-333333333333' },
    } as never)).resolves.toMatchObject({ data: { cartId: 'cart-1' } });
    expect(reorderService.reorder).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111', 'PED-MOCK-001', '33333333-3333-4333-8333-333333333333', 'fixture-token',
    );
    await expect(controller.reorder('PED-MOCK-001', { customerId: 'other' }, { headers: {} } as never))
      .rejects.toMatchObject({ status: 400 });
    await expect(controller.reorder('PED-MOCK-001', undefined, { headers: {} } as never))
      .rejects.toMatchObject({ status: 400, response: { error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } } });
    await expect(controller.reorder('PED-MOCK-001', undefined, {
      headers: { 'idempotency-key': '33333333-3333-1333-8333-333333333333' },
    } as never)).rejects.toMatchObject({ status: 400, response: { error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } } });
  });
});
