import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
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
    await prisma.shipmentEventInbox.deleteMany({ where: { eventId: { in: eventIds } } });
    jest.restoreAllMocks();
  });

  const postEvent = (event: ShipmentStatusUpdatedEvent) => request(app.getHttpServer())
    .post('/api/v1/webhooks/ventas/envios')
    .set('X-Webhook-Token', syntheticToken)
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

  it('returns 503 when the inbox insert fails and leaves no row', async () => {
    const shipmentEvent = createEvent(eventIds[2]);
    const insert = jest.spyOn(prisma.shipmentEventInbox, 'create').mockRejectedValueOnce(new Error('synthetic database write failure'));

    await postEvent(shipmentEvent).expect(503);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(await prisma.shipmentEventInbox.count({ where: { eventId: eventIds[2] } })).toBe(0);
  });
});
