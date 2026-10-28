import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../http/api-error';

export interface SalesCsatRequest {
  pedidoId: string; clienteId: string; canal: 'MARKETPLACE'; puntuacion: number; comentario: string;
}

export abstract class CsatGateway {
  abstract assertDelivered(orderId: string, customerId: string, token: string): Promise<void>;
  abstract submit(payload: SalesCsatRequest, token: string): Promise<void>;
}

@Injectable()
export class SalesCsatGateway extends CsatGateway {
  constructor(private readonly config: ConfigService) { super(); }

  private async request(key: string, path: string, token: string, body?: SalesCsatRequest): Promise<Response> {
    try {
      const base = new URL(this.config.get<string>(key, ''));
      const timeout = Number(this.config.get('HTTP_TIMEOUT_MS', 3000));
      if (base.username || base.password || base.search || base.hash || base.pathname !== '/'
        || (base.protocol !== 'https:' && !(this.config.get('NODE_ENV') !== 'production'
          && base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)))
        || !Number.isInteger(timeout) || timeout < 100 || timeout > 5000) throw new Error('Configuration');
      // Forward only the already validated human access token. Never retry a CSAT mutation.
      return await fetch(new URL(path, base), { method: body ? 'POST' : 'GET', redirect: 'error',
        signal: AbortSignal.timeout(timeout), headers: { Authorization: `Bearer ${token}`,
          Accept: 'application/json', 'X-Correlation-Id': randomUUID(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new ApiError(503, 'SALES_UNAVAILABLE', 'Evaluación no disponible temporalmente'); }
  }

  async assertDelivered(orderId: string, customerId: string, token: string): Promise<void> {
    const response = await this.request('CSAT_SALES_BASE_URL', `/api/v1/pedidos/${encodeURIComponent(orderId)}`, token);
    if (response.status === 403) throw new ApiError(403, 'ORDER_FORBIDDEN', 'Pedido no disponible');
    if (response.status === 404) throw new ApiError(404, 'ORDER_NOT_AVAILABLE', 'Pedido no disponible');
    if (response.status === 401) throw new ApiError(401, 'UNAUTHORIZED', 'Autenticación requerida');
    if (response.status !== 200) throw new ApiError(503, 'SALES_UNAVAILABLE', 'Pedido no disponible temporalmente');
    let order: { pedidoId?: unknown; canal?: unknown; contacto?: { clienteId?: unknown }; estado?: unknown };
    try { order = await response.json(); } catch { throw new ApiError(503, 'SALES_UNAVAILABLE', 'Respuesta no disponible'); }
    if (!order || order.pedidoId !== orderId || order.canal !== 'MARKETPLACE'
      || typeof order.contacto?.clienteId !== 'string') throw new ApiError(503, 'SALES_UNAVAILABLE', 'Respuesta no disponible');
    if (order.contacto.clienteId !== customerId) throw new ApiError(403, 'ORDER_FORBIDDEN', 'Pedido no disponible');
    if (order.estado !== 'ENTREGADO') throw new ApiError(422, 'ORDER_NOT_DELIVERED', 'El pedido aún no fue entregado');
  }

  async submit(payload: SalesCsatRequest, token: string): Promise<void> {
    const response = await this.request('CSAT_POSTVENTA_BASE_URL', '/api/v2/csat', token, payload);
    if (response.status === 201) return; // Published G5 response has no body.
    if (response.status === 401) throw new ApiError(401, 'UNAUTHORIZED', 'Autenticación requerida');
    if (response.status === 403) throw new ApiError(403, 'ORDER_FORBIDDEN', 'Pedido no disponible');
    // A generic conflict/validation response must never mark the prompt submitted.
    let code: unknown;
    try {
      const error = await response.json();
      code = error?.code ?? error?.error?.code;
    } catch { /* An unrecognized provider error remains unavailable. */ }
    if (response.status === 409 && code === 'CSAT_ALREADY_SUBMITTED') {
      throw new ApiError(409, 'CSAT_ALREADY_SUBMITTED', 'La evaluación ya fue registrada');
    }
    if (response.status === 422 && code === 'ORDER_NOT_DELIVERED') {
      throw new ApiError(422, 'ORDER_NOT_DELIVERED', 'El pedido aún no fue entregado');
    }
    throw new ApiError(503, 'SALES_UNAVAILABLE', 'Resultado de evaluación no confirmado');
  }
}
