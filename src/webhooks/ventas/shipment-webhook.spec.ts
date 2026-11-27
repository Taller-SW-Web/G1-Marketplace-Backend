import { ServiceUnavailableException, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ShipmentWebhookController } from './shipment-webhook.controller';
import { SHIPMENT_EVENT_SINK, type ShipmentEventSink, type ShipmentStatusUpdatedEvent } from './shipment-event';
import { ShipmentWebhookService } from './shipment-webhook.service';

const syntheticToken = 'synthetic-test-only-header-value';
const event = {
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
    get: (key: string, fallback?: unknown) => key === 'VENTAS_WEBHOOK_TOKEN' ? syntheticToken : fallback,
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
    .set('X-Webhook-Token', syntheticToken)
    .send(event);

  it('accepts the H-05 envelope through the exact X-Webhook-Token header and deduplicates repeated eventId', async () => {
    await postEvent().expect(200, { data: { accepted: true, duplicate: false } });
    await postEvent().expect(200, { data: { accepted: true, duplicate: true } });
    expect(sink.accept).toHaveBeenCalledTimes(2);
    expect(seen.size).toBe(1);
    expect(sink.accept).toHaveBeenLastCalledWith(expect.objectContaining({
      eventId: event.eventId,
      data: expect.objectContaining({ orderId: 'PED-2026-00001', publicStatus: 'EN_CAMINO' }),
    }));
  });

  it.each([
    ['reprogrammed status', { ...event, eventId: '22222222-2222-4222-8222-222222222222', data: { ...event.data, publicStatus: 'REPROGRAMADO', estimatedDeliveryDate: '2026-12-02' } }],
    ['nullable estimated date', { ...event, eventId: '33333333-3333-4333-8333-333333333333', data: { ...event.data, estimatedDeliveryDate: null } }],
    ['unknown public status', { ...event, eventId: '44444444-4444-4444-8444-444444444444', data: { ...event.data, publicStatus: 'ESTADO_FUTURO_NO_CONOCIDO' } }],
  ])('accepts %s as a well-formed H-05 envelope', async (_name, acceptedEvent) => {
    await request(app.getHttpServer()).post('/api/v1/webhooks/ventas/envios')
      .set('X-Webhook-Token', syntheticToken).send(acceptedEvent).expect(200, {
        data: { accepted: true, duplicate: false },
      });
  });

  it('rejects absent or incorrect configured header before processing the event', async () => {
    await request(app.getHttpServer()).post('/api/v1/webhooks/ventas/envios').send(event).expect(401);
    await request(app.getHttpServer()).post('/api/v1/webhooks/ventas/envios')
      .set('X-Webhook-Token', 'wrong-synthetic-value').send(event).expect(401);
    expect(sink.accept).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...event, eventType: 'OtherEvent' }],
    [{ ...event, version: '2.0.0' }],
    [{ ...event, eventId: 'event-shipment-2026-00001' }],
    [{ ...event, timestamp: 'not-a-timestamp' }],
    [{ ...event, timestamp: '2026-02-30T10:15:00.000Z' }],
    [{ ...event, emitter: 'ventas' }],
    [{ ...event, data: { ...event.data, orderId: 'not-a-public-order-id' } }],
    [{ ...event, data: { ...event.data, trackingNumber: undefined } }],
    [{ ...event, data: { ...event.data, trackingNumber: '' } }],
    [{ ...event, data: { ...event.data, estimatedDeliveryDate: undefined } }],
    [{ ...event, data: { ...event.data, estimatedDeliveryDate: '2026-02-30' } }],
  ])('rejects event outside the pinned v1 shape', async (invalidEvent) => {
    await request(app.getHttpServer()).post('/api/v1/webhooks/ventas/envios')
      .set('X-Webhook-Token', syntheticToken).send(invalidEvent).expect(400);
    expect(sink.accept).not.toHaveBeenCalled();
  });

  it('does not treat an upstream idEvento as the H-05 eventId without an agreed mapping', async () => {
    const upstreamIdOnlyEnvelope = {
      ...event,
      eventId: undefined,
      idEvento: event.eventId,
    };

    await request(app.getHttpServer()).post('/api/v1/webhooks/ventas/envios')
      .set('X-Webhook-Token', syntheticToken).send(upstreamIdOnlyEnvelope).expect(400);
    expect(sink.accept).not.toHaveBeenCalled();
  });

  it('returns 503 when the sink cannot persist the event', async () => {
    jest.spyOn(sink, 'accept').mockRejectedValueOnce(new ServiceUnavailableException({
      error: { code: 'SHIPMENT_EVENT_PERSISTENCE_UNAVAILABLE' },
    }));

    await postEvent().expect(503);
    expect(seen.size).toBe(0);
    jest.restoreAllMocks();
  });

  it('fails closed when token configuration is absent', async () => {
    const unconfigured = {
      get: (key: string, fallback?: unknown) => key === 'VENTAS_WEBHOOK_HEADER' ? fallback : undefined,
    };
    const service = new ShipmentWebhookService(unconfigured as ConfigService, sink);
    await expect(service.receive({ 'x-webhook-token': syntheticToken }, event)).rejects.toMatchObject({ status: 503 });
  });
});
