import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaShipmentEventSink } from './prisma-shipment-event.sink';
import type { ShipmentStatusUpdatedEvent } from './shipment-event';

const event: ShipmentStatusUpdatedEvent = {
  eventId: '11111111-1111-4111-8111-111111111111',
  eventType: 'ShipmentStatusUpdated',
  version: '1.0.0',
  timestamp: '2026-11-24T10:15:00.000Z',
  emitter: 'modulo-ventas',
  data: {
    orderId: 'PED-2026-00001',
    publicStatus: 'EN_CAMINO',
    trackingNumber: 'TRACK-LOCAL-1',
    estimatedDeliveryDate: '2026-11-28',
  },
};

describe('PrismaShipmentEventSink', () => {
  const prisma = { shipmentEventInbox: { create: jest.fn() } };
  const sink = new PrismaShipmentEventSink(prisma as unknown as PrismaService);

  const uniqueConflict = (target: unknown) => new Prisma.PrismaClientKnownRequestError('unique conflict', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });

  beforeEach(() => jest.resetAllMocks());

  it('persists the full event before acknowledging it', async () => {
    prisma.shipmentEventInbox.create.mockResolvedValue({ eventId: event.eventId });

    await expect(sink.accept(event)).resolves.toBe('accepted');
    expect(prisma.shipmentEventInbox.create).toHaveBeenCalledWith({
      data: {
        eventId: event.eventId,
        orderId: event.data.orderId,
        payload: event,
      },
    });
  });

  it('treats a concurrent eventId unique-key collision as a duplicate', async () => {
    prisma.shipmentEventInbox.create
      .mockImplementationOnce(async () => ({ eventId: event.eventId }))
      .mockImplementationOnce(async () => { throw uniqueConflict(['event_id']); });

    await expect(Promise.all([sink.accept(event), sink.accept(event)]))
      .resolves.toEqual(['accepted', 'duplicate']);
    expect(prisma.shipmentEventInbox.create).toHaveBeenCalledTimes(2);
  });

  it('does not mistake a different unique constraint for an event duplicate', async () => {
    prisma.shipmentEventInbox.create.mockRejectedValue(uniqueConflict(['another_column']));

    await expect(sink.accept(event)).rejects.toMatchObject({
      status: 503,
      response: { error: { code: 'SHIPMENT_EVENT_PERSISTENCE_UNAVAILABLE' } },
    });
  });

  it('fails closed when durable persistence is unavailable', async () => {
    prisma.shipmentEventInbox.create.mockRejectedValue(new Error('database unavailable'));

    await expect(sink.accept(event)).rejects.toMatchObject({
      status: 503,
      response: { error: { code: 'SHIPMENT_EVENT_PERSISTENCE_UNAVAILABLE' } },
    });
  });
});
