import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';
import type { OrderSummary, OrdersProvider } from './orders.types';

describe('orders shipment tracking on the Ventas summary', () => {
  const orderId = 'PED-2026-00001';
  const buyer = 'customer-a';
  const token = 'session-user-a';
  const summary: OrderSummary = {
    orderId, state: 'PAGADO', total: { amount: 50, currency: 'PEN' }, createdAt: '2026-11-26T12:00:00Z',
  };
  const event = {
    eventId: '9d7bae6f-a590-4c3d-8d52-4ee4e0fcdb40',
    eventType: 'ShipmentStatusUpdated', version: '1.0.0', emitter: 'modulo-ventas',
    timestamp: '2026-11-26T13:00:00Z',
    data: { orderId, publicStatus: 'DESPACHADO', trackingNumber: 'QA-123', estimatedDeliveryDate: null },
  };
  const getForCustomer = jest.fn();
  const findMany = jest.fn();
  const orders = new OrdersService(
    new ConfigService({ ORDERS_SOURCE: 'real', NODE_ENV: 'development' }),
    { getForCustomer } as unknown as OrdersProvider,
    { shipmentEventInbox: { findMany } } as unknown as PrismaService,
  );

  beforeEach(() => {
    getForCustomer.mockReset().mockResolvedValue(summary);
    findMany.mockReset().mockResolvedValue([]);
  });

  it.each([new ForbiddenException(), new NotFoundException()])('propagates Ventas denial before reading the inbox', async (denial) => {
    getForCustomer.mockRejectedValue(denial);
    await expect(orders.getMyOrderTracking(buyer, orderId, token)).rejects.toBe(denial);
    expect(getForCustomer).toHaveBeenCalledWith(orderId, token, buyer);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('ignores a mismatched order returned by an upstream integration', async () => {
    getForCustomer.mockResolvedValue({ ...summary, orderId: 'PED-2026-00002' });
    await expect(orders.getMyOrderTracking(buyer, orderId, token)).rejects.toMatchObject({ status: 404 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns pending before dispatch and shows the event timeline afterwards', async () => {
    await expect(orders.getMyOrderTracking(buyer, orderId, token)).resolves.toBeNull();
    findMany.mockResolvedValue([{ payload: event }, { payload: event }, {
      payload: { ...event, data: { ...event.data, publicStatus: 'OTRO' } },
    }]);
    await expect(orders.getMyOrderTracking(buyer, orderId, token)).resolves.toEqual({
      state: 'DESPACHADO', trackingNumber: 'QA-123',
      milestones: [{ state: 'DESPACHADO', at: '2026-11-26T13:00:00.000Z' }],
    });
  });

  it('does not regress a delivered order on a late dispatch notification', async () => {
    getForCustomer.mockResolvedValue({ ...summary, state: 'ENTREGADO' });
    findMany.mockResolvedValue([{ payload: event }]);
    await expect(orders.getMyOrderTracking(buyer, orderId, token)).resolves.toMatchObject({ state: 'ENTREGADO' });
  });
});
