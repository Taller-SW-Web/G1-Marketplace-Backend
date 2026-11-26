import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { ProviderError } from './provider-error';

export type G5OrderState = 'CREADO' | 'PAGADO' | 'EN_PREPARACION' | 'DESPACHADO' | 'ENTREGADO' | 'ANULADO';

export interface G5CreateOrderRequest {
  canal: 'MARKETPLACE';
  contacto: {
    clienteId: string;
    nombreCompleto: string;
    tipoDocumento: 'DNI' | 'RUC' | 'CE' | 'PASAPORTE';
    numeroDocumento: string;
    telefono?: string;
    email?: string;
  };
  items: Array<{
    productoId: string;
    sku: string;
    cantidad: number;
    precioUnitario: number;
    descripcion?: string;
  }>;
  cupon?: { codigo: string; descuento: number; aplicado?: boolean };
  envio: {
    modalidad: string;
    costo: number;
    destinatario: string;
    departamento: string;
    provincia: string;
    distrito: string;
    direccion: string;
    referencia?: string;
  };
  pago: {
    metodoPago: string;
    moneda: 'PEN' | 'USD';
    subtotal: number;
    descuentoCupon?: number;
    costoEnvio?: number;
    total: number;
  };
}

export interface G5SalesOrder {
  pedidoId: string;
  estado: G5OrderState;
  total: { amount: number; currency: string };
  createdAt: string;
}

const ORDER_STATES = new Set<G5OrderState>([
  'CREADO', 'PAGADO', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO', 'ANULADO',
]);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Injectable()
export class G5SalesProvider {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async createOrder(input: G5CreateOrderRequest, idempotencyKey: string): Promise<G5SalesOrder> {
    if (!UUID_V4.test(idempotencyKey)) throw new ProviderError(400, 'IDEMPOTENCY_KEY_INVALID');
    if (!isCreateOrderRequest(input)) throw new ProviderError(400, 'SALES_REQUEST_INVALID');
    const response = await this.request('post', '/api/v1/pedidos', input, { 'Idempotency-Key': idempotencyKey });
    return mapCreateOrder(response);
  }

  async getOrder(orderId: string): Promise<G5SalesOrder> {
    if (!orderId.trim() || orderId.length > 100) throw new ProviderError(400, 'ORDER_ID_INVALID');
    const response = await this.request('get', `/api/v1/pedidos/${encodeURIComponent(orderId)}`);
    return mapOrderDetail(response);
  }

  /** M1 1.10.0 has no read-by-idempotency-key operation; never invent that route. */
  getOrderByIdempotencyKey(_idempotencyKey: string): never {
    throw new ProviderError(501, 'SALES_IDEMPOTENCY_LOOKUP_UNSUPPORTED');
  }

  private async request(
    method: 'get' | 'post',
    path: string,
    body?: G5CreateOrderRequest,
    extraHeaders: Record<string, string> = {},
  ): Promise<unknown> {
    const baseUrl = this.config.get<string>('VENTAS_BASE_URL');
    const token = this.config.get<string>('VENTAS_SERVICE_TOKEN');
    const timeoutMs = this.config.get<number>('HTTP_TIMEOUT_MS', 5000);
    const approved = this.config.get<string>('G5_SALES_INTEGRATION_APPROVED') === 'true';
    const mocks = this.config.get<boolean>('USE_MOCKS', false);
    const production = this.config.get<string>('NODE_ENV') === 'production';
    let base: URL;
    try {
      base = new URL(baseUrl ?? '');
    } catch {
      throw new ProviderError(503, 'SALES_INTEGRATION_DISABLED');
    }
    const localHttp = !production && base.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if (!approved || mocks || !token || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000 ||
        (base.protocol !== 'https:' && !localHttp) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
      throw new ProviderError(503, 'SALES_INTEGRATION_DISABLED');
    }

    const url = new URL(path, base);
    try {
      const response = method === 'get'
        ? await firstValueFrom(this.http.get<unknown>(url.href, {
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...extraHeaders },
            timeout: timeoutMs, maxRedirects: 0, proxy: false,
          }))
        : await firstValueFrom(this.http.post<unknown>(url.href, body, {
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extraHeaders },
            timeout: timeoutMs, maxRedirects: 0, proxy: false,
          }));
      if (method === 'get' && response.status !== 200) {
        throw new ProviderError(503, 'SALES_RESPONSE_INVALID');
      }
      if (method === 'post' && ![200, 201].includes(response.status)) {
        throw new ProviderError(503, 'SALES_RESPONSE_INVALID');
      }
      return response.data;
    } catch (error: unknown) {
      if (error instanceof ProviderError) throw error;
      const axiosError = error as AxiosError<unknown>;
      const status = axiosError.response?.status;
      const providerCode = readProviderCode(axiosError.response?.data);
      if (status === 404 && method === 'get') throw new ProviderError(404, 'SALES_ORDER_NOT_FOUND');
      if (status === 409 && providerCode === 'IDEMPOTENCY_KEY_REUSED') {
        throw new ProviderError(409, 'IDEMPOTENCY_KEY_REUSED');
      }
      if (status === 400 && providerCode && /^[A-Z0-9_]{1,64}$/u.test(providerCode)) {
        throw new ProviderError(400, providerCode);
      }
      const timedOut = axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT';
      throw new ProviderError(timedOut ? 504 : 503, timedOut ? 'SALES_TIMEOUT' : 'SALES_UNAVAILABLE');
    }
  }
}

function readProviderCode(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const error = isRecord(value.error) ? value.error : value;
  return typeof error.codigo === 'string' ? error.codigo : undefined;
}

function mapCreateOrder(value: unknown): G5SalesOrder {
  if (!isRecord(value) || typeof value.pedidoId !== 'string' || !value.pedidoId.trim() ||
      !isOrderState(value.estado) || !isFiniteAmount(value.total) ||
      typeof value.moneda !== 'string' || !/^[A-Z]{3}$/u.test(value.moneda) ||
      !isIsoDateTime(value.fechaCreacion)) {
    throw new ProviderError(502, 'SALES_RESPONSE_INVALID');
  }
  return {
    pedidoId: value.pedidoId,
    estado: value.estado,
    total: { amount: value.total, currency: value.moneda },
    createdAt: value.fechaCreacion,
  };
}

function mapOrderDetail(value: unknown): G5SalesOrder {
  if (!isRecord(value) || typeof value.pedidoId !== 'string' || !value.pedidoId.trim() ||
      !isOrderState(value.estado) || !isRecord(value.pago) || !isFiniteAmount(value.pago.total) ||
      typeof value.pago.moneda !== 'string' || !/^[A-Z]{3}$/u.test(value.pago.moneda) ||
      !isIsoDateTime(value.fechaCreacion)) {
    throw new ProviderError(502, 'SALES_RESPONSE_INVALID');
  }
  return {
    pedidoId: value.pedidoId,
    estado: value.estado,
    total: { amount: value.pago.total, currency: value.pago.moneda },
    createdAt: value.fechaCreacion,
  };
}

function isCreateOrderRequest(value: G5CreateOrderRequest): boolean {
  if (value.canal !== 'MARKETPLACE' || !isRecord(value.contacto) ||
      typeof value.contacto.clienteId !== 'string' || !UUID_V4.test(value.contacto.clienteId) ||
      !isNonEmptyText(value.contacto.nombreCompleto) ||
      !['DNI', 'RUC', 'CE', 'PASAPORTE'].includes(value.contacto.tipoDocumento) ||
      !isNonEmptyText(value.contacto.numeroDocumento) ||
      (value.contacto.telefono !== undefined && !isNonEmptyText(value.contacto.telefono)) ||
      (value.contacto.email !== undefined && !isNonEmptyText(value.contacto.email)) ||
      !Array.isArray(value.items) || value.items.length === 0 ||
      !value.items.every((item) => isRecord(item) && isNonEmptyText(item.productoId) && isNonEmptyText(item.sku) &&
        Number.isSafeInteger(item.cantidad) && Number(item.cantidad) > 0 && isFiniteAmount(item.precioUnitario)) ||
      !isRecord(value.envio) || !isNonEmptyText(value.envio.modalidad) || !isFiniteAmount(value.envio.costo) ||
      !isNonEmptyText(value.envio.destinatario) || !isNonEmptyText(value.envio.departamento) ||
      !isNonEmptyText(value.envio.provincia) || !isNonEmptyText(value.envio.distrito) || !isNonEmptyText(value.envio.direccion) ||
      (value.envio.referencia !== undefined && !isNonEmptyText(value.envio.referencia)) ||
      !isRecord(value.pago) || !isNonEmptyText(value.pago.metodoPago) || !['PEN', 'USD'].includes(value.pago.moneda) ||
      !isFiniteAmount(value.pago.subtotal) || !isFiniteAmount(value.pago.total) ||
      (value.pago.descuentoCupon !== undefined && !isFiniteAmount(value.pago.descuentoCupon)) ||
      (value.pago.costoEnvio !== undefined && !isFiniteAmount(value.pago.costoEnvio))) return false;
  if (value.cupon !== undefined && (!isRecord(value.cupon) || !isNonEmptyText(value.cupon.codigo) ||
      !isFiniteAmount(value.cupon.descuento) || (value.cupon.aplicado !== undefined && typeof value.cupon.aplicado !== 'boolean'))) return false;
  const subtotalCents = value.items.reduce((sum, item) => sum + Math.round(item.precioUnitario * item.cantidad * 100), 0);
  const discountCents = Math.round((value.pago.descuentoCupon ?? 0) * 100);
  const shippingCents = Math.round((value.pago.costoEnvio ?? value.envio.costo) * 100);
  const totalCents = Math.round(value.pago.total * 100);
  return subtotalCents === Math.round(value.pago.subtotal * 100) &&
    totalCents === subtotalCents - discountCents + shippingCents;
}

function isFiniteAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOrderState(value: unknown): value is G5OrderState {
  return typeof value === 'string' && ORDER_STATES.has(value as G5OrderState);
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
    !Number.isNaN(Date.parse(value));
}
