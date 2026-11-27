import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { createConfiguredCommercialMailTransport } from '../src/notifications/commercial-mail-transport';
import { OrdersService } from '../src/orders/orders.service';
import type { OrderSummary, OrdersProvider } from '../src/orders/orders.types';
import { processC002QaNotice } from '../src/webhooks/ventas/c002-qa.worker';
import { PrismaService } from '../src/prisma/prisma.service';
import { ShipmentWebhookController } from '../src/webhooks/ventas/shipment-webhook.controller';
import {
  SHIPMENT_EVENT_SINK,
  type ShipmentStatusUpdatedEvent,
} from '../src/webhooks/ventas/shipment-event';
import { PrismaShipmentEventSink } from '../src/webhooks/ventas/prisma-shipment-event.sink';
import { ShipmentWebhookService } from '../src/webhooks/ventas/shipment-webhook.service';
import { ShipmentWebhookQaFailure } from '../src/webhooks/ventas/shipment-webhook-qa-failure';

const syntheticToken = 'h5-postgres-test-token-only';
const eventIds = [
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  '77777777-7777-4777-8777-777777777777',
];
const syntheticOrder = 'PED-2099-00320';
// Pedido de prueba que crea Ventas para el ensayo (rango 9xxxx de pedidos de prueba, distinto del de C-002 y del pedido real).
const ventasTestOrder = 'PED-2026-90009';

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
  const qaConfig: Record<string, string> = {};

  beforeAll(async () => {
    prisma = new PrismaService();
    const config = {
      get: (key: string, fallback?: unknown) => key === 'VENTAS_WEBHOOK_TOKEN' ? syntheticToken : qaConfig[key] ?? fallback,
    };
    const module = await Test.createTestingModule({
      controllers: [ShipmentWebhookController],
      providers: [
        ShipmentWebhookService,
        PrismaShipmentEventSink,
        ShipmentWebhookQaFailure,
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
    jest.restoreAllMocks();
    for (const key of Object.keys(qaConfig)) delete qaConfig[key];
    await prisma.$executeRaw`DELETE FROM shipment_webhook_qa_failure WHERE order_id = ${syntheticOrder}`;
    await prisma.$executeRaw`DELETE FROM shipment_webhook_qa_failure WHERE order_id = ${ventasTestOrder}`;
    await prisma.shipmentMailNotice.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.shipmentEventInbox.deleteMany({ where: { eventId: { in: eventIds } } });
  });

  const postEvent = (event: ShipmentStatusUpdatedEvent, correlationId = event.eventId) => request(app.getHttpServer())
    .post('/api/v1/webhooks/ventas/envios')
    .set('X-Webhook-Token', syntheticToken)
    .set('X-Correlation-Id', correlationId)
    .send(event);

  function armQa(orderId = syntheticOrder, expiresAt = new Date(Date.now() + 60_000).toISOString()) {
    qaConfig.VENTAS_WEBHOOK_QA_503_ENABLED = 'true';
    qaConfig.VENTAS_WEBHOOK_QA_503_ORDER_ID = orderId;
    qaConfig.VENTAS_WEBHOOK_QA_503_EXPIRES_AT = expiresAt;
  }

  it('keeps baseline ingestion, duplicate acknowledgement and C-002 queue intact with QA switched off', async () => {
    armQa();
    qaConfig.VENTAS_WEBHOOK_QA_503_ENABLED = 'false';
    const markerWrite = jest.spyOn(prisma, '$executeRaw');
    for (const eventId of eventIds) {
      const orderId = eventId === eventIds[0] ? 'PED-2026-90001' : syntheticOrder;
      const status = eventId === eventIds[0] ? 'DESPACHADO' : 'EN_CAMINO';
      await postEvent(createEvent(eventId, { orderId, publicStatus: status }))
        .expect(200, { data: { accepted: true, duplicate: false } });
    }
    await postEvent(createEvent(eventIds[0], { orderId: 'PED-2026-90001', publicStatus: 'DESPACHADO' }))
      .expect(200, { data: { accepted: true, duplicate: true } });
    expect(markerWrite).not.toHaveBeenCalled();
    expect(await prisma.shipmentEventInbox.count({ where: { eventId: { in: eventIds } } })).toBe(7);
    expect(await prisma.shipmentMailNotice.count({ where: { eventId: { in: eventIds } } })).toBe(1);
  });

  it.each([
    { orderId: 'PED-2026-00092' },
    { orderId: 'PED-2026-90001', c002Order: 'PED-2026-90001' },
    { orderId: syntheticOrder, expiry: '2000-01-01T00:00:00Z' },
    { orderId: syntheticOrder, c002Order: syntheticOrder },
  ])('does not consume QA configuration outside its scope: %j', async ({ orderId, expiry, c002Order }) => {
    if (c002Order) qaConfig.C002_QA_ORDER_ID = c002Order;
    armQa(orderId, expiry);
    const markerWrite = jest.spyOn(prisma, '$executeRaw');
    await postEvent(createEvent(eventIds[0], { orderId })).expect(200, { data: { accepted: true, duplicate: false } });
    expect(markerWrite).not.toHaveBeenCalled();
  });

  it('consumes one QA failure before the inbox insert and accepts the retry under the same identifiers', async () => {
    armQa();
    const event = createEvent(eventIds[0], { orderId: syntheticOrder });
    const correlationId = 'despacho-ventas-marketplace-qa-320';
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const log = jest.spyOn(Logger.prototype, 'log');

    await postEvent(event, correlationId).expect(503, { error: { code: 'SHIPMENT_EVENT_PERSISTENCE_UNAVAILABLE' } });
    expect(await prisma.shipmentEventInbox.count({ where: { eventId: event.eventId } })).toBe(0);
    const markers = await prisma.$queryRaw<{ event_id: string; correlation_id: string }[]>`
      SELECT event_id, correlation_id FROM shipment_webhook_qa_failure WHERE order_id = ${syntheticOrder}
    `;
    expect(markers).toEqual([{ event_id: event.eventId, correlation_id: correlationId }]);
    expect(warn).toHaveBeenCalledWith(JSON.stringify({
      event: 'shipment_webhook_qa_503', correlationId, eventId: event.eventId, orderId: syntheticOrder,
    }));

    await postEvent(event, correlationId).expect(200, { data: { accepted: true, duplicate: false } });
    expect(await prisma.shipmentEventInbox.count({ where: { eventId: event.eventId } })).toBe(1);
    expect(log).toHaveBeenCalledWith(JSON.stringify({
      event: 'shipment_webhook_processed', correlationId, eventId: event.eventId, orderId: syntheticOrder, outcome: 'accepted',
    }));
    await postEvent(createEvent(eventIds[1], { orderId: syntheticOrder }))
      .expect(200, { data: { accepted: true, duplicate: false } });
  });

  it('arms for the Ventas test order in the 9xxxx range, answers 503 once and accepts the retry with the same eventId and body', async () => {
    armQa(ventasTestOrder);
    const event = createEvent(eventIds[0], { orderId: ventasTestOrder });

    await postEvent(event).expect(503, { error: { code: 'SHIPMENT_EVENT_PERSISTENCE_UNAVAILABLE' } });
    expect(await prisma.shipmentEventInbox.count({ where: { eventId: event.eventId } })).toBe(0);
    const markers = await prisma.$queryRaw<{ event_id: string }[]>`
      SELECT event_id FROM shipment_webhook_qa_failure WHERE order_id = ${ventasTestOrder}
    `;
    expect(markers).toEqual([{ event_id: event.eventId }]);

    await postEvent(event).expect(200, { data: { accepted: true, duplicate: false } });
    expect(await prisma.shipmentEventInbox.count({ where: { eventId: event.eventId } })).toBe(1);
    await postEvent(createEvent(eventIds[1], { orderId: ventasTestOrder }))
      .expect(200, { data: { accepted: true, duplicate: false } });
  });

  describe('H-05 ShipmentStatusUpdated v1.0.0 contract (BE #296)', () => {
    it('accepts and persists DESPACHADO for an orderId in PED-AAAA-NNNNN format', async () => {
      const event = createEvent(eventIds[0], { publicStatus: 'DESPACHADO' });

      await postEvent(event).expect(200, { data: { accepted: true, duplicate: false } });

      const stored = await prisma.shipmentEventInbox.findUnique({ where: { eventId: event.eventId } });
      expect(stored).toMatchObject({ orderId: 'PED-2026-00001', payload: event });
    });

    it.each([
      { label: 'an empty publicStatus', overrides: { publicStatus: '' } },
      { label: 'an orderId with fewer than five sequence digits', overrides: { orderId: 'PED-2026-42' } },
    ])('rejects $label without writing to the inbox', async ({ overrides }) => {
      const event = createEvent(eventIds[0], { publicStatus: 'DESPACHADO', ...overrides });

      await postEvent(event).expect(400, { error: { code: 'INVALID_SHIPMENT_EVENT' } });

      expect(await prisma.shipmentEventInbox.count({ where: { eventId: event.eventId } })).toBe(0);
    });

    it('acknowledges a repeated DESPACHADO eventId with duplicate true and one durable row', async () => {
      const event = createEvent(eventIds[0], { publicStatus: 'DESPACHADO' });

      await postEvent(event).expect(200, { data: { accepted: true, duplicate: false } });
      await postEvent(event).expect(200, { data: { accepted: true, duplicate: true } });

      expect(await prisma.shipmentEventInbox.count({ where: { eventId: event.eventId } })).toBe(1);
    });
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

  it('persists both out-of-order statuses without regressing delivered tracking', async () => {
    const orderId = 'PED-2099-99998';
    const delivered = createEvent(eventIds[0], { orderId, publicStatus: 'ENTREGADO' });
    const dispatched = {
      ...createEvent(eventIds[1], { orderId, publicStatus: 'DESPACHADO' }),
      // Even if the late notification has a newer timestamp, delivery is terminal.
      timestamp: '2026-11-24T10:16:00.000Z',
    };
    const summary: OrderSummary = {
      orderId, state: 'PAGADO', total: { amount: 50, currency: 'PEN' }, createdAt: '2026-11-24T10:00:00.000Z',
    };
    const provider: OrdersProvider = {
      getForCustomer: jest.fn().mockResolvedValue(summary),
      listForCustomer: jest.fn(),
    };
    const orders = new OrdersService(new ConfigService({ ORDERS_SOURCE: 'real', NODE_ENV: 'development' }), provider, prisma);
    const getTracking = () => orders.getMyOrderTracking('synthetic-owner', orderId, 'synthetic-session');

    await postEvent(delivered).expect(200, { data: { accepted: true, duplicate: false } });
    await expect(getTracking()).resolves.toMatchObject({ state: 'ENTREGADO' });
    await postEvent(dispatched).expect(200, { data: { accepted: true, duplicate: false } });

    const persisted = await prisma.shipmentEventInbox.findMany({ where: { orderId }, select: { eventId: true } });
    expect(persisted.map(({ eventId }) => eventId).sort()).toEqual([delivered.eventId, dispatched.eventId].sort());
    await expect(getTracking()).resolves.toMatchObject({
      state: 'ENTREGADO',
      milestones: [
        { state: 'ENTREGADO', at: delivered.timestamp },
        { state: 'DESPACHADO', at: dispatched.timestamp },
      ],
    });
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
