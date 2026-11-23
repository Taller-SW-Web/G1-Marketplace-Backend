export interface EmailItem {
  name: string;
  quantity: number;
  lineTotalCents: number;
}

interface OrderConfirmation {
  type: 'ORDER_CONFIRMATION';
  orderId: string;
  state: 'PAGADO';
  occurredAt: string;
  totalCents: number;
  items?: readonly EmailItem[];
}

const dispatchLabels = {
  ASIGNADO: 'Asignado',
  EN_CAMINO: 'En camino',
  REPROGRAMADO: 'Entrega reprogramada',
  INCIDENCIA: 'Incidencia en la entrega',
  ENTREGADO: 'Entregado',
} as const;

interface ShipmentUpdate {
  type: 'SHIPMENT_UPDATE';
  orderId: string;
  state: keyof typeof dispatchLabels;
  occurredAt: string;
  estimatedDelivery?: string;
}

export type EmailSnapshot = OrderConfirmation | ShipmentUpdate;

export interface EmailConfiguration {
  marketplaceOrigin: string;
  orderUrl: string;
  trackingUrl: string;
  supportUrl: string;
}

interface EmailContent {
  subject: string;
  preheader: string;
  title: string;
  introduction: string;
  facts: readonly (readonly [label: string, value: string])[];
  action: string;
  actionUrl: string;
  supportUrl: string;
  logoUrl: string;
}

const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const eventTime = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Lima',
});
const calendarDate = new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'UTC' });

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function formatMoney(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('EMAIL_AMOUNT_INVALID');
  return money.format(cents / 100);
}

function publicUrl(value: string, origin: URL): string {
  const url = new URL(value);
  if (url.origin !== origin.origin || url.username || url.password || url.search || url.hash) {
    throw new Error('EMAIL_URL_NOT_ALLOWED');
  }
  return url.href;
}

function formatEstimatedDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('EMAIL_DATE_INVALID');
  }
  return calendarDate.format(date);
}

function merchandise(items: readonly EmailItem[] = []): [string, string][] {
  return items.map(item => {
    const name = item.name.trim().replace(/\s+/g, ' ');
    if (!name || !Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new Error('EMAIL_ITEM_INVALID');
    return [`${item.quantity} × ${name}`, formatMoney(item.lineTotalCents)];
  });
}

function buildContent(snapshot: EmailSnapshot, config: EmailConfiguration): EmailContent {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(snapshot.orderId)) throw new Error('EMAIL_ORDER_INVALID');
  const origin = new URL(config.marketplaceOrigin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.href !== `${origin.origin}/`) {
    throw new Error('EMAIL_ORIGIN_INVALID');
  }
  const occurredAt = new Date(snapshot.occurredAt);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(snapshot.occurredAt) || !/(Z|[+-]\d{2}:\d{2})$/.test(snapshot.occurredAt) || Number.isNaN(occurredAt.getTime())) {
    throw new Error('EMAIL_DATE_INVALID');
  }
  const common = {
    supportUrl: publicUrl(config.supportUrl, origin),
    logoUrl: new URL('/brand/logo-ink.png', origin).href,
  };
  const order: [string, string] = ['Pedido', snapshot.orderId];

  if (snapshot.type === 'ORDER_CONFIRMATION') {
    if (snapshot.state !== 'PAGADO') throw new Error('EMAIL_ORDER_NOT_PAID');
    return {
      ...common,
      subject: `Tu pedido ${snapshot.orderId} fue confirmado`,
      preheader: 'Tu compra está confirmada. Consulta los detalles de tu pedido.',
      title: 'Tu pedido fue confirmado',
      introduction: 'Gracias por comprar en Inka Athletics Marketplace. Este es el resumen de tu pedido.',
      facts: [order, ['Estado', 'Pagado · Pago simulado confirmado por Ventas'], ['Fecha', eventTime.format(occurredAt)],
        ...merchandise(snapshot.items), ['Total', formatMoney(snapshot.totalCents)]],
      action: 'Ver mi pedido',
      actionUrl: publicUrl(config.orderUrl, origin),
    };
  }
  if (snapshot.type !== 'SHIPMENT_UPDATE' || !Object.hasOwn(dispatchLabels, snapshot.state)) {
    throw new Error('EMAIL_SHIPMENT_INVALID');
  }
  const stateLabel = dispatchLabels[snapshot.state];
  const facts: [string, string][] = [order, ['Estado', stateLabel], ['Actualizado', eventTime.format(occurredAt)]];
  if (snapshot.estimatedDelivery && snapshot.state !== 'ENTREGADO') {
    facts.push(['Entrega estimada', formatEstimatedDate(snapshot.estimatedDelivery)]);
  }
  return {
    ...common,
    subject: `Actualización de tu pedido ${snapshot.orderId}: ${stateLabel}`,
    preheader: snapshot.estimatedDelivery && snapshot.state !== 'ENTREGADO'
      ? 'Consulta el estado y la fecha estimada de tu entrega.' : 'Consulta el estado más reciente de tu entrega.',
    title: 'Tu pedido tiene una actualización',
    introduction: 'Estos son los últimos datos de despacho disponibles para tu pedido.',
    facts,
    action: 'Ver seguimiento',
    actionUrl: publicUrl(config.trackingUrl, origin),
  };
}

function orderSummary(facts: EmailContent['facts']): string {
  return facts.map(([label, value]) => `
    <tr>
      <th scope="row" align="left" style="padding:10px 14px;font-size:14px;border-bottom:1px solid #DEE2E6">${escapeHtml(label)}</th>
      <td style="padding:10px 14px;font-size:14px;border-bottom:1px solid #DEE2E6">${escapeHtml(value)}</td>
    </tr>`).join('');
}

function transactionalEmail(content: EmailContent): string {
  return `<!doctype html>
<html lang="es-PE"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;background:#F7F5F0;color:#1B1812;font:16px/1.5 Arial,Helvetica,sans-serif">
<p hidden style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(content.preheader)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F7F5F0"><tr><td align="center" style="padding:20px 12px">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #DEE2E6;border-top:4px solid #1B1812">
<tr><td style="padding:0 24px 24px">
<img src="${escapeHtml(content.logoUrl)}" width="144" height="108" alt="Inka Athletics" style="display:block;border:0">
<h1 style="font-size:28px;line-height:1.2;margin:0 0 14px">${escapeHtml(content.title)}</h1>
<p style="margin:0 0 20px;color:#495057">${escapeHtml(content.introduction)}</p>
<table width="100%" cellspacing="0" cellpadding="0" aria-label="Resumen del pedido" style="border-collapse:collapse;background:#F7F5F0">${orderSummary(content.facts)}</table>
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0"><tr><td bgcolor="#F76707" style="border-radius:8px;mso-padding-alt:14px 22px">
<a href="${escapeHtml(content.actionUrl)}" style="display:block;color:#1B1812;font-weight:bold;padding:14px 22px;text-decoration:none;line-height:22px">${escapeHtml(content.action)}</a>
</td></tr></table>
<p style="margin:0;font-size:14px"><a href="${escapeHtml(content.supportUrl)}" style="color:#1B1812;text-decoration:underline">Ayuda con mi pedido</a></p>
</td></tr><tr><td style="padding:16px 24px;border-top:1px solid #DEE2E6;font-size:13px;color:#495057">Inka Athletics Marketplace</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

/** Pure rendering from a snapshot already authorized by the caller. */
export function renderTransactionalEmail(snapshot: EmailSnapshot, config: EmailConfiguration) {
  const content = buildContent(snapshot, config);
  const text = [content.title, content.introduction, '',
    ...content.facts.map(([label, value]) => `${label}: ${value}`), '',
    `${content.action}: ${content.actionUrl}`, `Ayuda con mi pedido: ${content.supportUrl}`, '', 'Inka Athletics Marketplace',
  ].join('\n');
  return { subject: content.subject, html: transactionalEmail(content), text, type: snapshot.type, payloadVersion: 'v1' as const };
}
