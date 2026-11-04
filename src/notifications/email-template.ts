export interface OrderConfirmationTemplateInput {
  orderId: string;
  orderState: 'PAGADO';
  createdAt: string;
  total: { amount: number; currency: string };
  orderDetailUrl: string;
}

export interface RenderedEmailTemplate {
  subject: string;
  text: string;
  html: string;
  payloadVersion: 'C-001-v1';
}
export interface ShipmentUpdateTemplateInput {
  shipmentEventId: string;
  orderId: string;
  publicStatus: 'DESPACHADO' | 'ENTREGADO';
  occurredAt: string;
  estimatedDelivery?: string;
  trackingUrl: string;
}
export interface RenderedShipmentEmail {
  subject: string;
  text: string;
  html: string;
  payloadVersion: 'C-002-v1';
}

/** Deterministic server-side C-001 renderer. It accepts only the authorized order snapshot. */
export function renderOrderConfirmation(input: OrderConfirmationTemplateInput): RenderedEmailTemplate {
  if (!/^PED-\d{4}-\d{5}$/.test(input.orderId) || input.orderState !== 'PAGADO') {
    throw new TypeError('Order confirmation requires a verified public order snapshot.');
  }
  const createdAt = new Date(input.createdAt);
  if (!Number.isFinite(createdAt.getTime()) || !Number.isFinite(input.total.amount)
    || input.total.amount < 0 || !/^[A-Z]{3}$/.test(input.total.currency)) {
    throw new TypeError('Order confirmation snapshot is invalid.');
  }
  const detailUrl = validateInternalUrl(input.orderDetailUrl);
  const date = new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima',
  }).format(createdAt);
  const total = new Intl.NumberFormat('es-PE', {
    style: 'currency', currency: input.total.currency,
  }).format(input.total.amount);
  const subject = `Tu pedido ${input.orderId} fue confirmado`;
  const text = [
    'Tu pedido fue confirmado',
    `Pedido ${input.orderId}`,
    'Estado: Confirmado',
    `Fecha: ${date}`,
    `Total: ${total}`,
    'Gracias por comprar con nosotros. Puedes revisar el estado y los detalles de tu pedido cuando quieras.',
    `Ver mi pedido: ${detailUrl}`,
    'Si no reconoces este pedido, comunícate con nuestros canales oficiales de ayuda.',
  ].join('\n\n');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body><main style="max-width:600px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;color:#202124"><header><strong>Marketplace</strong></header><h1>Tu pedido fue confirmado</h1><p>Pedido <strong>${escapeHtml(input.orderId)}</strong></p><p>Estado: Confirmado</p><p>Fecha: ${escapeHtml(date)}</p><p>Total: <strong>${escapeHtml(total)}</strong></p><p>Gracias por comprar con nosotros. Puedes revisar el estado y los detalles de tu pedido cuando quieras.</p><p><a href="${escapeHtml(detailUrl)}">Ver mi pedido</a></p><p>Si no reconoces este pedido, comunícate con nuestros canales oficiales de ayuda.</p><footer><small>Correo transaccional C-001-v1.</small></footer></main></body></html>`;
  return { subject, text, html, payloadVersion: 'C-001-v1' };
}

/** Deterministic C-002 renderer from a normalized public shipment event. */
export function renderShipmentUpdate(input: ShipmentUpdateTemplateInput): RenderedShipmentEmail {
  if (!/^[A-Za-z0-9._:-]{1,255}$/.test(input.shipmentEventId)
    || !/^PED-\d{4}-\d{5}$/.test(input.orderId)
    || !['DESPACHADO', 'ENTREGADO'].includes(input.publicStatus)) {
    throw new TypeError('Shipment update snapshot is invalid.');
  }
  const occurredAt = new Date(input.occurredAt);
  if (!Number.isFinite(occurredAt.getTime())) throw new TypeError('Shipment event timestamp is invalid.');
  if (input.estimatedDelivery !== undefined && !isCalendarDate(input.estimatedDelivery)) {
    throw new TypeError('Shipment estimated date is invalid.');
  }
  const trackingUrl = validateInternalUrl(input.trackingUrl);
  const stateLabel = input.publicStatus === 'DESPACHADO' ? 'En camino' : 'Entregado';
  const occurred = new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima',
  }).format(occurredAt);
  const estimated = input.estimatedDelivery
    ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' })
      .format(new Date(`${input.estimatedDelivery}T12:00:00.000Z`))
    : undefined;
  const subject = `Actualización de tu pedido ${input.orderId}: ${stateLabel}`;
  const text = [
    'Tu pedido tiene una actualización',
    `Pedido ${input.orderId}`,
    `Estado: ${stateLabel}`,
    `Actualizado el ${occurred}`,
    ...(estimated ? [`Entrega estimada: ${estimated}`] : []),
    `Ver seguimiento: ${trackingUrl}`,
    'Consulta el seguimiento para ver la información más reciente.',
  ].join('\n\n');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body><main style="max-width:600px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;color:#202124"><header><strong>Marketplace</strong></header><h1>Tu pedido tiene una actualización</h1><p>Pedido <strong>${escapeHtml(input.orderId)}</strong></p><p>Estado: ${escapeHtml(stateLabel)}</p><p>Actualizado el ${escapeHtml(occurred)}</p>${estimated ? `<p>Entrega estimada: ${escapeHtml(estimated)}</p>` : ''}<p><a href="${escapeHtml(trackingUrl)}">Ver seguimiento</a></p><p>Consulta el seguimiento para ver la información más reciente.</p><footer><small>Correo transaccional C-002-v1.</small></footer></main></body></html>`;
  return { subject, text, html, payloadVersion: 'C-002-v1' };
}

export function buildOrderDetailUrl(origin: string, orderId: string): string {
  if (!/^PED-\d{4}-\d{5}$/.test(orderId)) throw new TypeError('Order ID is invalid.');
  const parsed = new URL(origin);
  if (parsed.username || parsed.password || parsed.search || parsed.hash
    || (parsed.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.protocol === 'http:'))
    || parsed.origin !== origin) throw new TypeError('Marketplace origin must be an explicit trusted origin.');
  return `${parsed.origin}/mis-pedidos/${encodeURIComponent(orderId)}`;
}

function validateInternalUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) {
    throw new TypeError('Email CTA must use an approved HTTPS or local loopback URL.');
  }
  if (parsed.username || parsed.password || parsed.hash || /(?:access[_-]?token|jwt|email)=/i.test(parsed.search)) {
    throw new TypeError('Email CTA must not contain credentials or personal data.');
  }
  return parsed.toString();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
