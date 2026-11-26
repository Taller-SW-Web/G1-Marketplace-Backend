import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { requestIdMiddleware } from '../src/http/request-id.middleware';
import {
  SHIPMENT_EVENT_SINK,
  type ShipmentEventSink,
  type ShipmentStatusUpdatedEvent,
} from '../src/webhooks/ventas/shipment-event';
import { ShipmentWebhookController } from '../src/webhooks/ventas/shipment-webhook.controller';
import { ShipmentWebhookService } from '../src/webhooks/ventas/shipment-webhook.service';

function makeEvent(eventId: string, orderId = 'PED-2026-90001'): ShipmentStatusUpdatedEvent {
  return {
    eventId,
    eventType: 'ShipmentStatusUpdated',
    version: '1.0.0',
    timestamp: '2026-11-26T16:05:47.000Z',
    emitter: 'modulo-ventas',
    data: {
      orderId,
      publicStatus: 'EN_CAMINO',
      trackingNumber: 'TRK-DESP-90001',
      estimatedDeliveryDate: '2026-11-28',
    },
  };
}

describe('Shipment webhook E2E: duplicate, retry and failure with correlation-id (BE #320)', () => {
  const token = 'test-webhook-secret-token';
  let app: INestApplication;
  let webhookService: ShipmentWebhookService;
  const inbox = new Set<string>();
  let failNextAccept = false;

  const sink: ShipmentEventSink = {
    async accept(event) {
      if (failNextAccept) {
        failNextAccept = false;
        throw new Error('Simulated transient DB/downstream timeout');
      }
      if (inbox.has(event.eventId)) return 'duplicate';
      inbox.add(event.eventId);
      return 'accepted';
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ShipmentWebhookController],
      providers: [
        ShipmentWebhookService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: unknown) => (key === 'VENTAS_WEBHOOK_TOKEN' ? token : fallback),
          },
        },
        { provide: SHIPMENT_EVENT_SINK, useValue: sink },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(requestIdMiddleware);
    await app.init();
    webhookService = moduleRef.get(ShipmentWebhookService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    inbox.clear();
    failNextAccept = false;
    jest.restoreAllMocks();
  });

  it('handles duplicate delivery with same eventId and preserves correlation-id trace', async () => {
    const corrId = 'despacho-ventas-mk-001';
    const eventId = '11111111-1111-4111-8111-111111111111';
    const logSpy = jest.spyOn((webhookService as unknown as { logger: { log: (m: string) => void } }).logger, 'log');

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/ventas/envios')
      .set('X-Webhook-Token', token)
      .set('X-Request-Id', corrId)
      .set('X-Correlation-Id', corrId)
      .send(makeEvent(eventId))
      .expect(200)
      .expect('X-Request-Id', corrId)
      .expect({ data: { accepted: true, duplicate: false } });

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/ventas/envios')
      .set('X-Webhook-Token', token)
      .set('X-Request-Id', corrId)
      .set('X-Correlation-Id', corrId)
      .send(makeEvent(eventId))
      .expect(200)
      .expect('X-Request-Id', corrId)
      .expect({ data: { accepted: true, duplicate: true } });

    expect(inbox.size).toBe(1);
    const traces = logSpy.mock.calls.map((c) => JSON.parse(c[0]) as Record<string, string>);
    expect(traces).toEqual([
      { event: 'shipment_webhook_processed', correlationId: corrId, eventId, orderId: 'PED-2026-90001', outcome: 'accepted' },
      { event: 'shipment_webhook_processed', correlationId: corrId, eventId, orderId: 'PED-2026-90001', outcome: 'duplicate' },
    ]);
  });

  it('recovers on retry with the same eventId after a transient 500 failure', async () => {
    const corrId = 'despacho-ventas-mk-retry-002';
    const eventId = '22222222-2222-4222-8222-222222222222';
    failNextAccept = true;

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/ventas/envios')
      .set('X-Webhook-Token', token)
      .set('X-Request-Id', corrId)
      .set('X-Correlation-Id', corrId)
      .send(makeEvent(eventId, 'PED-2026-90003'))
      .expect(500)
      .expect('X-Request-Id', corrId);

    expect(inbox.has(eventId)).toBe(false);

    // Retry from Ventas with the exact same eventId and correlationId
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/ventas/envios')
      .set('X-Webhook-Token', token)
      .set('X-Request-Id', corrId)
      .set('X-Correlation-Id', corrId)
      .send(makeEvent(eventId, 'PED-2026-90003'))
      .expect(200)
      .expect('X-Request-Id', corrId)
      .expect({ data: { accepted: true, duplicate: false } });

    expect(inbox.has(eventId)).toBe(true);
  });

  it('rejects unauthorized (401) and malformed (400) webhook calls with correlation trace and no secret leak', async () => {
    const corrId = 'despacho-ventas-mk-fail-003';
    const warnSpy = jest.spyOn((webhookService as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn');

    const unauth = await request(app.getHttpServer())
      .post('/api/v1/webhooks/ventas/envios')
      .set('X-Request-Id', corrId)
      .set('X-Correlation-Id', corrId)
      .send(makeEvent('33333333-3333-4333-8333-333333333333'))
      .expect(401)
      .expect('X-Request-Id', corrId);
    expect(JSON.stringify(unauth.body)).not.toContain(token);

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/ventas/envios')
      .set('X-Webhook-Token', token)
      .set('X-Request-Id', corrId)
      .set('X-Correlation-Id', corrId)
      .send({ invalid: true })
      .expect(400)
      .expect('X-Request-Id', corrId);

    const warns = warnSpy.mock.calls.map((c) => JSON.parse(c[0]) as Record<string, string>);
    expect(warns).toEqual([
      { event: 'shipment_webhook_rejected', correlationId: corrId, code: 'WEBHOOK_UNAUTHORIZED' },
      { event: 'shipment_webhook_rejected', correlationId: corrId, code: 'INVALID_SHIPMENT_EVENT' },
    ]);
  });
});
