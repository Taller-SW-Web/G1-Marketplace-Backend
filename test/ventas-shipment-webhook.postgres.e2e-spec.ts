import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { createConfiguredCommercialMailTransport } from '../src/notifications/commercial-mail-transport';
import { processC002QaNotice } from '../src/webhooks/ventas/c002-qa.worker';
import { PrismaService } from '../src/prisma/prisma.service';
import { ShipmentWebhookController } from '../src/webhooks/ventas/shipment-webhook.controller';
import {
  SHIPMENT_EVENT_SINK,
  type ShipmentStatusUpdatedEvent,
} from '../src/webhooks/ventas/shipment-event';
import { PrismaShipmentEventSink } from '../src/webhooks/ventas/prisma-shipment-event.sink';
import { ShipmentWebhookService } from '../src/webhooks/ventas/shipment-webhook.service';

const syntheticToken = 'h5-postgres-test-token-only';
const eventIds = [
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
];

function createEvent(eventId: string, overrides: Partial<ShipmentStatusUpdatedEvent['data']> = {}): ShipmentStatusUpdatedEvent {
  return {
    eventId,
    eventType: 'ShipmentStatusUpdated',
    version: '1.0.0',
    timestamp: '2026-11-24T10:15:00.000Z',
    emitter: 'modulo-ventas',
    data: {
      orderId: 'PED-2026-00001',
      publicStatus: 'EN_CAMINO',
      trackingNumber: 'TRACK-H5-TEST-1',
      estimatedDeliveryDate: '2026-11-28',
      ...overrides,
    },
  };
}

const postgresSuite = process.env.RUN_H5_WEBHOOK_POSTGRES === 'true' ? describe : describe.skip;

postgresSuite('Ventas H-05 webhook — disposable PostgreSQL persistence', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    const config = {
      get: (key: string, fallback?: unknown) => key === 'VENTAS_WEBHOOK_TOKEN' ? syntheticToken : fallback,
    };
    const module = await Test.createTestingModule({
      controllers: [ShipmentWebhookController],
      providers: [
        ShipmentWebhookService,
        PrismaShipmentEventSink,
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: prisma },
        { provide: SHIPMENT_EVENT_SINK, useExisting: PrismaShipmentEventSink },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    const migration = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE migration_name = '20261124000100_shipment_event_inbox'
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `;
    expect(migration).toHaveLength(1);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  afterEach(async () => {
    await prisma.shipmentMailNotice.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.shipmentEventInbox.deleteMany({ where: { eventId: { in: eventIds } } });
    jest.restoreAllMocks();
  });

  const postEvent = (event: ShipmentStatusUpdatedEvent, correlationId = event.eventId) => request(app.getHttpServer())
    .post('/api/v1/webhooks/ventas/envios')
    .set('X-Webhook-Token', syntheticToken)
    .set('X-Correlation-Id', correlationId)
    .send(event);

  it('applies the inbox migration and returns 200 for a repeated eventId with one durable row', async () => {
    const shipmentEvent = createEvent(eventIds[0]);

    await postEvent(shipmentEvent).expect(200, { data: { accepted: true, duplicate: false } });
    await postEvent(shipmentEvent).expect(200, { data: { accepted: true, duplicate: true } });

    expect(await prisma.shipmentEventInbox.count({ where: { eventId: eventIds[0] } })).toBe(1);
  });

  it('acknowledges and persists a syntactically valid event for an unknown order', async () => {
    const shipmentEvent = createEvent(eventIds[1], {
      orderId: 'PED-2099-99999',
      publicStatus: 'ESTADO_FUTURO_NO_CONOCIDO',
      estimatedDeliveryDate: null,
    });

    await postEvent(shipmentEvent).expect(200, { data: { accepted: true, duplicate: false } });

    const stored = await prisma.shipmentEventInbox.findUnique({ where: { eventId: eventIds[1] } });
    expect(stored).toMatchObject({ orderId: 'PED-2099-99999', payload: shipmentEvent });
  });

  const qaSettings = {
    orderId: 'PED-2026-00001',
    to: 'comprador-qa@example.org',
    eventAfter: new Date('2000-01-01T00:00:00Z'),
    webOrigin: 'https://marketplace.example.org',
  };

  function stubBrevo(response: () => Response) {
    const fetchImpl = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(async () => response());
    const transport = createConfiguredCommercialMailTransport({
      MAIL_PROVIDER: 'brevo',
      BREVO_ENABLED: 'true',
      BREVO_API_KEY: 'unit-test-only',
      BREVO_SENDER_EMAIL: 'marketplace-qa@example.org',
    }, fetchImpl);
    return { fetchImpl, transport };
  }

  it('sends C-002 once after DESPACHADO across repeats and concurrent consumers', async () => {
    const event = createEvent(eventIds[0], { publicStatus: 'DESPACHADO' });
    await postEvent(event).expect(200);
    await postEvent(event).expect(200, { data: { accepted: true, duplicate: true } });
    expect(await prisma.shipmentMailNotice.count({ where: { eventId: event.eventId } })).toBe(1);

    // These events must remain unclaimed: a different order, an older receipt
    // and a state for which the database never queues C-002.
    await postEvent(createEvent(eventIds[1], { orderId: 'PED-2026-00002', publicStatus: 'DESPACHADO' })).expect(200);
    await postEvent(createEvent(eventIds[2], { publicStatus: 'DESPACHADO' })).expect(200);
    await prisma.shipmentEventInbox.update({
      where: { eventId: eventIds[2] },
      data: { receivedAt: new Date('1999-12-31T23:59:59Z') },
    });
    await postEvent(createEvent(eventIds[3], { publicStatus: 'ENTREGADO' })).expect(200);

    const providerId = '<qa-c002@provider.example.org>';
    const { fetchImpl, transport } = stubBrevo(() => Response.json({ messageId: providerId }, { status: 201 }));
    const queue = prisma.shipmentMailNotice;
    const results = await Promise.all([
      processC002QaNotice(queue, qaSettings, transport),
      processC002QaNotice(queue, qaSettings, transport),
    ]);
    expect(results.filter(result => result.status === 'sent')).toHaveLength(1);
    await expect(processC002QaNotice(queue, qaSettings, transport)).resolves.toEqual({ status: 'idle' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, request] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://api.brevo.com/v3/smtp/email');
    expect(JSON.parse(String(request?.body))).toMatchObject({
      to: [{ email: qaSettings.to }],
      textContent: expect.stringContaining(`/mis-pedidos/${qaSettings.orderId}/seguimiento`),
    });
    await expect(queue.findUnique({ where: { eventId: event.eventId } })).resolves.toMatchObject({
      attemptedAt: expect.any(Date),
      sentAt: expect.any(Date),
      providerMessageId: providerId,
    });
    for (const eventId of [eventIds[1], eventIds[2]]) {
      await expect(queue.findUnique({ where: { eventId } })).resolves.toMatchObject({
        attemptedAt: null,
        sentAt: null,
        providerMessageId: null,
      });
    }
    await expect(queue.findUnique({ where: { eventId: eventIds[3] } })).resolves.toBeNull();
  });

  it('keeps an unconfirmed delivery claimed without marking it sent or retrying', async () => {
    const event = createEvent(eventIds[0], { publicStatus: 'DESPACHADO', estimatedDeliveryDate: null });
    await postEvent(event).expect(200);
    const { fetchImpl, transport } = stubBrevo(() => Response.json({}, { status: 503 }));
    const queue = prisma.shipmentMailNotice;
    await expect(processC002QaNotice(queue, qaSettings, transport)).resolves.toEqual({
      status: 'unconfirmed',
      eventId: event.eventId,
    });
    await expect(processC002QaNotice(queue, qaSettings, transport)).resolves.toEqual({ status: 'idle' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(queue.findUnique({ where: { eventId: event.eventId } })).resolves.toMatchObject({
      attemptedAt: expect.any(Date),
      sentAt: null,
      providerMessageId: null,
    });
  });

  it('correlates a persistence 503 and a successful retry with one durable inbox row', async () => {
    const eventId = eventIds[2];
    const correlationId = 'despacho-ventas-mk-retry-002';
    const shipmentEvent = createEvent(eventId);
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const log = jest.spyOn(Logger.prototype, 'log');
    const insert = jest.spyOn(prisma.shipmentEventInbox, 'create').mockRejectedValueOnce(new Error('synthetic database write failure'));

    await postEvent(shipmentEvent, correlationId).expect(503, {
      error: { code: 'SHIPMENT_EVENT_PERSISTENCE_UNAVAILABLE' },
    });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(await prisma.shipmentEventInbox.count({ where: { eventId } })).toBe(0);
    expect(warn).toHaveBeenCalledWith(JSON.stringify({
      event: 'shipment_webhook_persistence_failed', correlationId, eventId, code: 'SHIPMENT_EVENT_PERSISTENCE_UNAVAILABLE',
    }));
    expect(log).not.toHaveBeenCalled();

    await postEvent(shipmentEvent, correlationId).expect(200, { data: { accepted: true, duplicate: false } });
    expect(insert).toHaveBeenCalledTimes(2);
    expect(await prisma.shipmentEventInbox.count({ where: { eventId } })).toBe(1);
    expect(log).toHaveBeenCalledWith(JSON.stringify({
      event: 'shipment_webhook_processed', correlationId, eventId, orderId: shipmentEvent.data.orderId, outcome: 'accepted',
    }));
  });
});
