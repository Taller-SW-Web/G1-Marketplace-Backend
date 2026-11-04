import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../../http/api-error';
import { ListOrdersQuery, OrderDetail, OrdersHistoryResponse, OrdersProvider } from '../orders.types';

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const publicStates = new Set(['CREADO', 'PAGADO', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO', 'ANULADO']);
const unavailable = () => new ServiceUnavailableException({ error: { code: 'ORDERS_INTEGRATION_UNAVAILABLE' } });

function safeSummaryPart(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ');
  return normalized && normalized.length <= 80 ? normalized : undefined;
}

function maskedEmail(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 254) return undefined;
  const match = /^([^\s@]+)@([^\s@.]+)(?:\.[^\s@.]+)+$/.exec(value.trim());
  if (!match) return undefined;
  return `${match[1]![0]}•••@•••`;
}

function maskedPhone(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 4 && digits.length <= 20 ? `••••••${digits.slice(-3)}` : undefined;
}

/** Server-side adapter for G5. The end-user JWT is forwarded only for the authenticated request. */
@Injectable()
export class G5OrdersProvider implements OrdersProvider {
  constructor(private readonly config: ConfigService) {}

  async listForCustomer(_customerId: string, query: ListOrdersQuery, accessToken?: string): Promise<OrdersHistoryResponse> {
    const params = new URLSearchParams({ page: String(query.page + 1), pageSize: String(query.pageSize) });
    if (query.state) params.set('estado', query.state);
    if (query.from) params.set('desde', query.from);
    if (query.to) params.set('hasta', query.to);
    const value = await this.request(`/pedidos/me?${params.toString()}`, accessToken);
    if (!isRecord(value) || !Array.isArray(value.items) || !Number.isSafeInteger(value.total) || Number(value.total) < 0
      || !Number.isSafeInteger(value.page) || !Number.isSafeInteger(value.pageSize)) throw unavailable();
    const items = value.items.map((item) => {
      if (!isRecord(item) || typeof item.pedidoId !== 'string' || typeof item.estado !== 'string' || !publicStates.has(item.estado)
        || typeof item.total !== 'number' || !Number.isFinite(item.total) || typeof item.moneda !== 'string'
        || !/^[A-Z]{3}$/.test(item.moneda) || typeof item.fechaCreacion !== 'string' || Number.isNaN(Date.parse(item.fechaCreacion))) throw unavailable();
      return { orderId: item.pedidoId, state: item.estado, total: { amount: item.total, currency: item.moneda }, createdAt: item.fechaCreacion };
    });
    const number = Number(value.page) - 1;
    if (number !== query.page || Number(value.pageSize) !== query.pageSize || items.length > Number(value.pageSize)) throw unavailable();
    return { data: items, page: { number, size: Number(value.pageSize), totalElements: Number(value.total), totalPages: Math.ceil(Number(value.total) / Number(value.pageSize)) } };
  }

  async getForCustomer(_customerId: string, orderId: string, accessToken?: string): Promise<OrderDetail | null> {
    try {
      const value = await this.request(`/pedidos/${encodeURIComponent(orderId)}`, accessToken);
      if (!isRecord(value) || typeof value.pedidoId !== 'string' || typeof value.estado !== 'string' || !publicStates.has(value.estado)
        || typeof value.fechaCreacion !== 'string' || Number.isNaN(Date.parse(value.fechaCreacion)) || !Array.isArray(value.items)
        || !Array.isArray(value.historialEstados)) throw unavailable();
      const payment = value.pago;
      if (!isRecord(payment) || typeof payment.total !== 'number' || !Number.isFinite(payment.total)
        || typeof payment.moneda !== 'string' || !/^[A-Z]{3}$/.test(payment.moneda)) throw unavailable();
      const lines = value.items.map((line) => {
        if (!isRecord(line) || typeof line.sku !== 'string' || typeof line.descripcion !== 'string'
          || !Number.isSafeInteger(line.cantidad) || Number(line.cantidad) < 1 || typeof line.precioUnitario !== 'number' || !Number.isFinite(line.precioUnitario) || line.precioUnitario < 0) throw unavailable();
        return { sku: line.sku, description: line.descripcion, quantity: Number(line.cantidad), unitPrice: { amount: line.precioUnitario, currency: payment.moneda as string } };
      });
      const milestones = value.historialEstados.map((event) => {
        if (!isRecord(event) || typeof event.estado !== 'string' || typeof event.fecha !== 'string' || Number.isNaN(Date.parse(event.fecha))) throw unavailable();
        return { state: event.estado, at: event.fecha };
      });
      let shipping: OrderDetail['shipping'];
      if (isRecord(value.envio)) {
        const locationParts = [value.envio.distrito, value.envio.provincia, value.envio.departamento]
          .map(safeSummaryPart).filter((part): part is string => Boolean(part));
        const locationSummary = [...new Map(locationParts.map((part) => [part.toLocaleLowerCase('es-PE'), part])).values()]
          .join(', ') || undefined;
        const contact = isRecord(value.contacto) ? value.contacto : undefined;
        const estimatedDelivery = typeof value.envio.fechaEstimadaEntrega === 'string'
          && !Number.isNaN(Date.parse(value.envio.fechaEstimadaEntrega))
          ? value.envio.fechaEstimadaEntrega
          : undefined;
        const emailMasked = contact ? maskedEmail(contact.email) : undefined;
        const phoneMasked = contact ? maskedPhone(contact.telefono) : undefined;
        if (estimatedDelivery || locationSummary || emailMasked || phoneMasked) {
          shipping = {
            ...(estimatedDelivery ? { estimatedDelivery } : {}),
            ...(locationSummary ? { locationSummary } : {}),
            ...(emailMasked ? { emailMasked } : {}),
            ...(phoneMasked ? { phoneMasked } : {}),
          };
        }
      }
      return { orderId: value.pedidoId, state: value.estado, total: { amount: payment.total, currency: payment.moneda }, createdAt: value.fechaCreacion, lines, milestones, ...(shipping ? { shipping } : {}) };
    } catch (error) {
      if (error instanceof ApiError && [403, 404].includes(error.getStatus())) return null;
      throw error;
    }
  }

  private async request(path: string, accessToken?: string): Promise<unknown> {
    if (!accessToken) throw new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } });
    const configured = this.config.get<string>('G5_API_URL');
    if (!configured) throw unavailable();
    let base: URL;
    try { base = new URL(configured); } catch { throw unavailable(); }
    if (base.username || base.password || base.search || base.hash
      || (base.protocol !== 'https:' && !(this.config.get<string>('NODE_ENV') !== 'production' && base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)))) throw unavailable();
    let response: Response;
    try {
      response = await fetch(new URL(`/api/v1${path}`, base), {
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
        cache: 'no-store', redirect: 'error',
        // Render cold starts may take 1–2 minutes; keep this separate from G7's short auth timeout.
        signal: AbortSignal.timeout(this.config.get<number>('G5_HTTP_TIMEOUT_MS', 150000)),
      });
    } catch { throw unavailable(); }
    let body: unknown;
    try { body = await response.json(); } catch { throw unavailable(); }
    if (response.status === 401) throw new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } });
    if (response.status === 403 || response.status === 404) {
      if (!path.startsWith('/pedidos/me?')) throw new ApiError(404, 'ORDER_NOT_AVAILABLE', 'Pedido no disponible.');
      if (response.status === 403) throw new ApiError(403, 'FORBIDDEN', 'No tienes acceso a tus pedidos.');
      throw new ApiError(403, 'FORBIDDEN', 'No tienes acceso a los pedidos.');
    }
    if (response.status === 400 && isRecord(body) && typeof body.codigo === 'string'
      && ['RANGO_FECHAS_INVALIDO', 'FORMATO_INVALIDO', 'PAGINACION_INVALIDA'].includes(body.codigo)) {
      const status = body.codigo === 'PAGINACION_INVALIDA' ? 400 : 400;
      throw new ApiError(status, body.codigo, 'Revisa los filtros de tus pedidos.');
    }
    if (!response.ok) throw unavailable();
    return body;
  }
}
