import { deliverCommercialMail } from '../src/notifications/commercial-mail-delivery';
import { createConfiguredCommercialMailTransport } from '../src/notifications/commercial-mail-transport';
import { EmailConfiguration, EmailSnapshot } from '../src/notifications/email-template';

const marketplaceOrigin = 'https://marketplace.example.invalid';
const orderUrl = `${marketplaceOrigin}/mis-pedidos`;
const config: EmailConfiguration = { marketplaceOrigin, orderUrl, trackingUrl: orderUrl, supportUrl: orderUrl };
const orderId = 'PED-2026-90001';
const cases = [
  {
    type: 'ORDER_CONFIRMATION', state: 'PAGADO', orderId, occurredAt: '2026-11-24T15:00:00Z',
    totalCents: 7990, items: [{ name: 'Botella deportiva', quantity: 1, lineTotalCents: 7990 }],
  },
  {
    type: 'SHIPMENT_UPDATE', state: 'DESPACHADO', orderId, occurredAt: '2026-11-24T17:00:00Z',
    estimatedDelivery: '2026-11-25',
  },
  {
    type: 'SHIPMENT_UPDATE', state: 'ENTREGADO', orderId, occurredAt: '2026-11-25T17:00:00Z',
  },
] as const satisfies readonly EmailSnapshot[];

async function main() {
  const transport = createConfiguredCommercialMailTransport(process.env);
  const to = process.env.MAIL_DEMO_TO?.trim() ??
    (process.env.MAIL_PROVIDER === 'mailpit' ? 'qa-marketplace@example.invalid' : '');
  if (!to) throw new Error('MAIL_DEMO_TO_REQUIRED');
  for (const snapshot of cases) {
    const result = await deliverCommercialMail(snapshot, to, config, transport);
    console.log(JSON.stringify({ environment: 'LOCAL_FIXTURE', state: snapshot.state, ...result }));
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'MAIL_DEMO_FAILED');
  process.exitCode = 1;
});
