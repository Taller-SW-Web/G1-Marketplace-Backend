import type { SalesOrder } from '../src/checkout/checkout.types';
import { CommercialMailTransport, deliverCommercialMail } from '../src/notifications/commercial-mail-delivery';
import { createConfiguredCommercialMailTransport } from '../src/notifications/commercial-mail-transport';
import { EmailConfiguration, EmailSnapshot } from '../src/notifications/email-template';

const marketplaceOrigin = 'https://marketplace.example.invalid';
const orderUrl = `${marketplaceOrigin}/mis-pedidos`;
const config: EmailConfiguration = { marketplaceOrigin, orderUrl, trackingUrl: orderUrl, supportUrl: orderUrl };
const orderId = 'PED-2026-90001';
const order: SalesOrder = {
  pedidoId: orderId, estado: 'PAGADO', total: { amount: 79.90, currency: 'PEN' },
  createdAt: '2026-11-24T14:30:00Z',
};
const confirmedAt = '2026-11-24T15:00:00Z';

interface ShipmentFixture {
  eventId: string;
  timestamp: string;
  data: { orderId: string; publicStatus: string; estimatedDeliveryDate: string | null };
}

const dispatched: ShipmentFixture = {
  eventId: '30ba2519-8e05-4d78-af35-4153d1a12f4c',
  timestamp: '2026-11-24T17:00:00Z',
  data: { orderId, publicStatus: 'DESPACHADO', estimatedDeliveryDate: '2026-11-25' },
};
const delivered: ShipmentFixture = {
  eventId: '86c5de77-ccd5-42e8-9c62-68b908e1631b',
  timestamp: '2026-11-25T17:00:00Z',
  data: { orderId, publicStatus: 'ENTREGADO', estimatedDeliveryDate: null },
};

/** Simulates the agreement with Sales. Deduplication lasts for this fixture run only. */
export function createFixtureMailRunner(expectedOrderId: string, to: string, transport: CommercialMailTransport) {
  const seen = new Set<string>();
  const skip = { status: 'skipped' } as const;

  async function deliverOnce(key: string, snapshot: EmailSnapshot) {
    if (seen.has(key)) return { status: 'duplicate' } as const;
    seen.add(key);
    return deliverCommercialMail(snapshot, to, config, transport);
  }

  return {
    async onOrderDetail(detail: SalesOrder, observedAt: string) {
      if (detail.pedidoId !== expectedOrderId || detail.estado !== 'PAGADO') return skip;
      if (detail.total.currency !== 'PEN' || !Number.isFinite(detail.total.amount)) {
        throw new Error('MAIL_FIXTURE_ORDER_TOTAL_INVALID');
      }
      return deliverOnce(`ORDER_CONFIRMATION:${detail.pedidoId}`, {
        type: 'ORDER_CONFIRMATION', state: detail.estado, orderId: detail.pedidoId,
        occurredAt: observedAt, totalCents: Math.round(detail.total.amount * 100),
        items: [{ name: 'Botella deportiva', quantity: 1, lineTotalCents: 7990 }],
      });
    },
    async onShipmentEvent(event: ShipmentFixture) {
      const { orderId, publicStatus, estimatedDeliveryDate } = event.data;
      if (orderId !== expectedOrderId || publicStatus !== 'DESPACHADO') return skip;
      return deliverOnce(`SHIPMENT_UPDATE:${event.eventId}`, {
        type: 'SHIPMENT_UPDATE', state: publicStatus, orderId, occurredAt: event.timestamp,
        ...(estimatedDeliveryDate ? { estimatedDelivery: estimatedDeliveryDate } : {}),
      });
    },
  };
}

async function main() {
  const transport = createConfiguredCommercialMailTransport(process.env);
  const to = process.env.MAIL_DEMO_TO?.trim() ??
    (process.env.MAIL_PROVIDER === 'mailpit' ? 'qa-marketplace@example.invalid' : '');
  if (!to) throw new Error('MAIL_DEMO_TO_REQUIRED');
  const fixtures = createFixtureMailRunner(orderId, to, transport);
  function log(state: string, result: { status: string }) {
    console.log(JSON.stringify({ environment: 'LOCAL_FIXTURE', state, ...result }));
  }
  log(order.estado, await fixtures.onOrderDetail(order, confirmedAt));
  log(dispatched.data.publicStatus, await fixtures.onShipmentEvent(dispatched));
  log(delivered.data.publicStatus, await fixtures.onShipmentEvent(delivered));
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'MAIL_DEMO_FAILED');
    process.exitCode = 1;
  });
}
