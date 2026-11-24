import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ShipmentWebhookController } from './shipment-webhook.controller';
import { SHIPMENT_EVENT_SINK, type ShipmentEventSink, type ShipmentStatusUpdatedEvent } from './shipment-event';
import { ShipmentWebhookService } from './shipment-webhook.service';

const syntheticToken = 'synthetic-test-only-header-value';
const event = {
  eventId: 'event-shipment-2026-00001',
  eventType: 'ShipmentStatusUpdated',
  version: '1.0.0',
  timestamp: '2026-11-24T10:15:00.000Z',
  emitter: 'ventas',
  data: {
    orderId: 'PED-2026-00001',
    publicStatus: 'EN_CAMINO',
    trackingNumber: 'TRACK-LOCAL-1',
    estimatedDeliveryDate: '2026-11-28',
  },
};

describe('Ventas shipment webhook — offline HTTP contract', () => {
  let app: INestApplication;
  const seen = new Set<string>();
  const sink: ShipmentEventSink = {
    accept: jest.fn(async (shipmentEvent: ShipmentStatusUpdatedEvent) => {
      if (seen.has(shipmentEvent.eventId)) return 'duplicate';
      seen.add(shipmentEvent.eventId);
      return 'accepted';
    }),
  };
  const config = {
    get: (key: string, fallback?: unknown) => ({
      VENTAS_WEBHOOK_HEADER: 'x-ventas-signature',
      VENTAS_WEBHOOK_TOKEN: syntheticToken,
    } as Record<string, unknown>)[key] ?? fallback,
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ShipmentWebhookController],
      providers: [
        ShipmentWebhookService,
        { provide: ConfigService, useValue: config },
        { provide: SHIPMENT_EVENT_SINK, useValue: sink },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app?.close(); });
  beforeEach(() => { seen.clear(); jest.clearAllMocks(); });

  const postEvent = () => request(app.getHttpServer())
    .post('/api/v1/webhooks/ventas/envios')
    .set('x-ventas-signature', syntheticToken)
    .send(event);

  it('accepts a valid v1 event and deduplicates repeated eventId through the sink', async () => {
    await postEvent().expect(200, { data: { accepted: true, duplicate: false } });
    await postEvent().expect(200, { data: { accepted: true, duplicate: true } });
    expect(sink.accept).toHaveBeenCalledTimes(2);
    expect(seen.size).toBe(1);
    expect(sink.accept).toHaveBeenLastCalledWith(expect.objectContaining({
      eventId: event.eventId,
      data: expect.objectContaining({ orderId: 'PED-2026-00001', publicStatus: 'EN_CAMINO' }),
    }));
  });

  it('rejects absent or incorrect configured header before processing the event', async () => {
    await request(app.getHttpServer()).post('/api/v1/webhooks/ventas/envios').send(event).expect(401);
    await request(app.getHttpServer()).post('/api/v1/webhooks/ventas/envios')
      .set('x-ventas-signature', 'wrong-synthetic-value').send(event).expect(401);
    expect(sink.accept).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...event, eventType: 'OtherEvent' }],
    [{ ...event, version: '2.0.0' }],
    [{ ...event, eventId: '  ' }],
    [{ ...event, timestamp: 'not-a-timestamp' }],
    [{ ...event, data: { ...event.data, orderId: 'not-a-public-order-id' } }],
    [{ ...event, data: { ...event.data, estimatedDeliveryDate: '2026-02-30' } }],
  ])('rejects event outside the pinned v1 shape', async (invalidEvent) => {
    await request(app.getHttpServer()).post('/api/v1/webhooks/ventas/envios')
      .set('x-ventas-signature', syntheticToken).send(invalidEvent).expect(400);
    expect(sink.accept).not.toHaveBeenCalled();
  });

  it('fails closed when token configuration is absent', async () => {
    const unconfigured = {
      get: (key: string, fallback?: unknown) => key === 'VENTAS_WEBHOOK_HEADER' ? 'authorization' : fallback,
    };
    const service = new ShipmentWebhookService(unconfigured as ConfigService, sink);
    await expect(service.receive({ authorization: syntheticToken }, event)).rejects.toMatchObject({ status: 503 });
  });
});
