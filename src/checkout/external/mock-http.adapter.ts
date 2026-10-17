import { HttpService } from '@nestjs/axios';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import AxiosMockAdapter from 'axios-mock-adapter';
import { createHash, randomUUID } from 'node:crypto';
import { CheckoutQuote, DeliveryAddress, Money, SalesOrder } from '../checkout.types';

interface AddressInput {
  label?: string;
  street: string;
  district: string;
  province: string;
  department: string;
  reference?: string;
  phone: string;
}

interface QuoteInput {
  address: DeliveryAddress;
  addressId: string;
  cartVersion: number;
  lines: Array<{ sku: string; quantity: number }>;
}

const DEFAULT_OWNER = '11111111-1111-4111-8111-111111111111';
const EMPTY_OWNER = '22222222-2222-4222-8222-222222222222';

@Injectable()
export class MockHttpAdapter implements OnModuleInit, OnModuleDestroy {
  private adapter?: AxiosMockAdapter;
  private readonly addresses = new Map<string, DeliveryAddress[]>();
  private readonly orders = new Map<string, SalesOrder>();
  private readonly orderFingerprints = new Map<string, string>();
  private readonly orderKeysById = new Map<string, string>();
  private readonly firstTimeoutKeys = new Set<string>();
  private nextAddress = 3;
  private nextOrder = 1;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.addresses.set(DEFAULT_OWNER, [
      {
        addressId: 'ADR-MOCK-0001',
        label: 'Casa',
        street: 'Av. Lima 123',
        district: 'Miraflores',
        province: 'Lima',
        department: 'Lima',
        reference: 'Dpto. 402',
        phone: '999999999',
      },
      {
        addressId: 'ADR-MOCK-0002',
        label: 'Trabajo',
        street: 'Jr. Comercio 450',
        district: 'San Isidro',
        province: 'Lima',
        department: 'Lima',
        phone: '988888888',
      },
    ]);
    this.addresses.set(EMPTY_OWNER, []);
  }

  onModuleInit(): void {
    if (!this.config.get<boolean>('USE_MOCKS', false)) return;
    if (this.config.get<string>('NODE_ENV')?.toLowerCase() === 'production') {
      throw new Error('External HTTP mocks are forbidden in production');
    }

    this.adapter = new AxiosMockAdapter(this.http.axiosRef, {
      onNoMatch: 'throwException',
    });
    this.installSecurityFixtures();
    this.installQuoteFixtures();
    this.installBenefitFixtures();
    this.installInventoryFixtures();
    this.installSalesFixtures();
  }

  onModuleDestroy(): void {
    this.adapter?.restore();
  }

  private installSecurityFixtures(): void {
    const adapter = this.adapter!;
    adapter.onGet(/security\.mock\/delivery-addresses$/).reply((config) => {
      const scenario = this.config.get<string>('MOCK_ADDRESS_SCENARIO');
      if (scenario === 'TIMEOUT') {
        return [504, { error: { code: 'ADDRESS_TIMEOUT' } }];
      }
      if (scenario === 'UNAVAILABLE') {
        return [503, { error: { code: 'ADDRESS_SERVICE_UNAVAILABLE' } }];
      }
      if (scenario === 'EMPTY') return [200, { data: [] }];
      const owner = this.subjectFromAuthorization(config.headers?.Authorization);
      return [200, { data: this.addresses.get(owner) ?? [] }];
    });
    adapter.onPost(/security\.mock\/delivery-addresses$/).reply((config) => {
      const scenario = this.config.get<string>('MOCK_ADDRESS_SCENARIO');
      if (scenario === 'TIMEOUT') {
        return [504, { error: { code: 'ADDRESS_TIMEOUT' } }];
      }
      if (scenario === 'UNAVAILABLE') {
        return [503, { error: { code: 'ADDRESS_SERVICE_UNAVAILABLE' } }];
      }
      const owner = this.subjectFromAuthorization(config.headers?.Authorization);
      const body = JSON.parse(String(config.data ?? '{}')) as AddressInput;
      const address: DeliveryAddress = {
        ...body,
        addressId: `ADR-MOCK-${String(this.nextAddress++).padStart(4, '0')}`,
      };
      const ownerAddresses = this.addresses.get(owner) ?? [];
      ownerAddresses.push(address);
      this.addresses.set(owner, ownerAddresses);
      return [201, { data: address }];
    });
  }

  private installQuoteFixtures(): void {
    this.adapter!.onPost(/catalog\.mock\/checkout-quotes$/).reply((config) => {
      const scenario = this.config.get<string>('MOCK_QUOTE_SCENARIO');
      if (scenario === 'TIMEOUT') {
        return [504, { error: { code: 'QUOTE_TIMEOUT' } }];
      }
      if (scenario === 'UNAVAILABLE') {
        return [503, { error: { code: 'QUOTE_UNAVAILABLE' } }];
      }
      const input = JSON.parse(String(config.data ?? '{}')) as QuoteInput;
      if (
        scenario === 'NO_COVERAGE' ||
        input.address.district.toLowerCase().includes('sin cobertura')
      ) {
        return [409, { error: { code: 'NO_SHIPPING_COVERAGE' } }];
      }
      if (!input.lines.length || input.lines.some((line) => line.quantity < 1)) {
        return [409, { error: { code: 'LINE_NOT_AVAILABLE' } }];
      }

      // These are provider-side test prices, not Marketplace price calculations.
      const subtotalAmount = input.lines.reduce((sum, line) => sum + 170 * line.quantity, 0);
      const quote: CheckoutQuote = {
        quoteId: `Q-MOCK-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        subtotal: { amount: subtotalAmount, currency: 'PEN' },
        discount: { amount: 0, currency: 'PEN' },
        shipping: { amount: 15, currency: 'PEN', estimatedDays: 2 },
        total: { amount: subtotalAmount + 15, currency: 'PEN' },
        lines: input.lines,
        addressId: input.addressId,
        cartVersion: input.cartVersion,
      };
      return [200, { data: quote }];
    });
  }

  private installBenefitFixtures(): void {
    this.adapter!.onPost(/benefits\.mock\/apply$/).reply((config) => {
      if (this.config.get<string>('MOCK_BENEFIT_SCENARIO') === 'TIMEOUT') {
        return [504, { error: { code: 'BENEFITS_TIMEOUT' } }];
      }
      if (this.config.get<string>('MOCK_BENEFIT_SCENARIO') === 'UNAVAILABLE') {
        return [503, { error: { code: 'BENEFITS_UNAVAILABLE' } }];
      }
      const body = JSON.parse(String(config.data ?? '{}')) as {
        quote: CheckoutQuote;
        couponCode?: string | null;
      };
      const { quote, couponCode } = body;
      if (!couponCode) {
        const nextQuote: CheckoutQuote = {
          ...quote,
          quoteId: `Q-MOCK-${randomUUID()}`,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          discount: { amount: 0, currency: quote.total.currency },
          total: {
            amount: quote.subtotal.amount + quote.shipping.amount,
            currency: quote.total.currency,
          },
          selectedBenefit: undefined,
        };
        return [200, { data: nextQuote }];
      }
      if (couponCode === 'UNAVAILABLE') {
        return [503, { error: { code: 'BENEFITS_UNAVAILABLE' } }];
      }
      if (couponCode !== 'SAVE20' && couponCode !== 'DEPORTE20') {
        return [422, { error: { code: 'COUPON_NOT_APPLICABLE' } }];
      }

      const discountAmount = Math.min(20, quote.subtotal.amount);
      const discount: Money = { amount: discountAmount, currency: quote.total.currency };
      const nextQuote: CheckoutQuote = {
        ...quote,
        quoteId: `Q-MOCK-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        discount,
        total: {
          amount: quote.subtotal.amount - discountAmount + quote.shipping.amount,
          currency: quote.total.currency,
        },
        selectedBenefit: { type: 'COUPON', id: 'COUPON-MOCK-001', discount },
      };
      return [200, { data: nextQuote }];
    });
  }

  private installInventoryFixtures(): void {
    this.adapter!.onPost(/inventory\.mock\/revalidate$/).reply((config) => {
      if (this.config.get<string>('MOCK_INVENTORY_SCENARIO') === 'TIMEOUT') {
        return [504, { error: { code: 'REVALIDATION_TIMEOUT' } }];
      }
      if (this.config.get<string>('MOCK_INVENTORY_SCENARIO') === 'UNAVAILABLE') {
        return [503, { error: { code: 'REVALIDATION_UNAVAILABLE' } }];
      }
      const body = JSON.parse(String(config.data ?? '{}')) as {
        lines: Array<{ sku: string; quantity: number }>;
      };
      const available = body.lines.every((line) => line.sku !== 'OUT-OF-STOCK');
      return [200, { data: { available, revalidatedAt: new Date().toISOString() } }];
    });
  }

  private installSalesFixtures(): void {
    this.adapter!.onPost(/sales\.mock\/orders$/).reply((config) => {
      if (this.config.get<string>('MOCK_SALES_SCENARIO') === 'UNAVAILABLE') {
        return [503, { error: { code: 'SALES_UNAVAILABLE' } }];
      }
      const body = JSON.parse(String(config.data ?? '{}')) as {
        checkoutOperationId: string;
        contact: Record<string, unknown>;
        total: Money;
      };
      const idempotencyKey = String(config.headers?.['Idempotency-Key'] ?? '');
      const scope = this.idempotencyScope(config.headers?.['X-Mock-Idempotency-Scope']);
      if (!scope || !idempotencyKey) {
        return [400, { error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } }];
      }
      const scopedKey = this.scopedOrderKey(scope, idempotencyKey);
      const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
      let order = this.orders.get(scopedKey);
      const previousFingerprint = this.orderFingerprints.get(scopedKey);
      if (order && previousFingerprint !== fingerprint) {
        return [409, { error: { code: 'IDEMPOTENCY_KEY_REUSED' } }];
      }
      if (!order) {
        order = {
          pedidoId: `PED-${new Date().getFullYear()}-${String(this.nextOrder++).padStart(5, '0')}`,
          estado: 'CREADO',
          total: body.total,
          createdAt: new Date().toISOString(),
        };
        this.orders.set(scopedKey, order);
        this.orderFingerprints.set(scopedKey, fingerprint);
        this.orderKeysById.set(order.pedidoId, scopedKey);
      }
      if (
        this.config.get<string>('MOCK_SALES_SCENARIO') === 'POST_TIMEOUT' &&
        !this.firstTimeoutKeys.has(scopedKey)
      ) {
        this.firstTimeoutKeys.add(scopedKey);
        return [504, { error: { code: 'SALES_TIMEOUT' } }];
      }
      return [201, { data: order }];
    });

    this.adapter!.onGet(/sales\.mock\/orders\/by-idempotency-key\/([^/]+)$/).reply((config) => {
      const scenario = this.config.get<string>('MOCK_SALES_SCENARIO');
      if (scenario === 'STATUS_TIMEOUT' || scenario === 'UNAVAILABLE') {
        const timedOut = scenario === 'STATUS_TIMEOUT';
        return [
          timedOut ? 504 : 503,
          { error: { code: timedOut ? 'SALES_STATUS_TIMEOUT' : 'SALES_UNAVAILABLE' } },
        ];
      }

      const key = decodeURIComponent(config.url?.split('/').pop() ?? '');
      const scope = this.idempotencyScope(config.headers?.['X-Mock-Idempotency-Scope']);
      if (!scope) return [404, { error: { code: 'ORDER_NOT_FOUND' } }];
      const scopedKey = this.scopedOrderKey(scope, key);
      const order = this.orders.get(scopedKey);
      if (!order) return [404, { error: { code: 'ORDER_NOT_FOUND' } }];
      return [200, { data: this.resolveSalesOutcome(scopedKey, order) }];
    });

    this.adapter!.onGet(/sales\.mock\/orders\/([^/]+)$/).reply((config) => {
      if (
        this.config.get<string>('MOCK_SALES_SCENARIO') === 'STATUS_TIMEOUT' ||
        this.config.get<string>('MOCK_SALES_SCENARIO') === 'UNAVAILABLE'
      ) {
        const timedOut = this.config.get<string>('MOCK_SALES_SCENARIO') === 'STATUS_TIMEOUT';
        return [
          timedOut ? 504 : 503,
          { error: { code: timedOut ? 'SALES_STATUS_TIMEOUT' : 'SALES_UNAVAILABLE' } },
        ];
      }
      const orderId = decodeURIComponent(config.url?.split('/').pop() ?? '');
      const key = this.orderKeysById.get(orderId);
      const order = key ? this.orders.get(key) : undefined;
      if (!order) return [404, { error: { code: 'ORDER_NOT_FOUND' } }];
      return [200, { data: this.resolveSalesOutcome(key!, order) }];
    });
  }

  private resolveSalesOutcome(scopedKey: string, order: SalesOrder): SalesOrder {
    const outcome = this.config.get<string>('MOCK_SALES_OUTCOME', 'PENDING');
    const status: SalesOrder['estado'] =
      outcome === 'PAID' ? 'PAGADO' : outcome === 'REJECTED' ? 'ANULADO' : 'CREADO';
    const resolvedOrder: SalesOrder = {
      ...order,
      estado: status,
      ...(status === 'ANULADO' ? { failureCode: 'PAGO_NO_COMPLETADO' } : {}),
    };
    this.orders.set(scopedKey, resolvedOrder);
    return resolvedOrder;
  }

  private idempotencyScope(value: unknown): string | null {
    return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value : null;
  }

  private scopedOrderKey(scope: string, idempotencyKey: string): string {
    return `${scope}:${idempotencyKey}`;
  }

  private subjectFromAuthorization(value: unknown): string {
    if (typeof value !== 'string') return '';
    const token = /^Bearer\s+([^\s]+)$/i.exec(value)?.[1];
    const payload = token?.split('.')[1];
    if (!payload) return '';
    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        sub?: unknown;
      };
      return typeof decoded.sub === 'string' ? decoded.sub : '';
    } catch {
      return '';
    }
  }
}
