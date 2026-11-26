import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ProviderError } from './provider-error';
import { MockHttpAdapter } from './mock-http.adapter';
import { MarketplaceGateway } from './marketplace.gateway';

describe('MarketplaceGateway with axios-mock-adapter fixtures', () => {
  const values: Record<string, unknown> = { USE_MOCKS: true, NODE_ENV: 'test' };
  let adapter: MockHttpAdapter;
  let http: HttpService;
  let gateway: MarketplaceGateway;

  beforeEach(() => {
    for (const key of Object.keys(values)) delete values[key];
    Object.assign(values, { USE_MOCKS: true, NODE_ENV: 'test' });
    const config = {
      get: (key: string, fallback?: unknown) => values[key] ?? fallback,
    } as unknown as ConfigService;
    http = new HttpService(axios.create({ timeout: 1000 }));
    adapter = new MockHttpAdapter(http, config);
    adapter.onModuleInit();
    gateway = new MarketplaceGateway(http, config);
  });

  afterEach(() => adapter.onModuleDestroy());

  const tokenFor = (sub: string) => {
    const payload = Buffer.from(JSON.stringify({ sub })).toString('base64url');
    return `test.${payload}.signature`;
  };

  it('returns only the current mock owner’s addresses and keeps new addresses in memory', async () => {
    const owner = '11111111-1111-4111-8111-111111111111';
    const token = tokenFor(owner);
    const initial = await gateway.listAddresses(owner, token);
    expect(initial).toHaveLength(2);

    const created = await gateway.createAddress(owner, token, {
      street: 'Av. Ficticia 10',
      district: 'Miraflores',
      province: 'Lima',
      department: 'Lima',
      phone: '900000000',
    });
    expect(created).toEqual({ addressId: expect.any(String), street: 'Av. Ficticia 10',
      district: 'Miraflores', province: 'Lima', department: 'Lima' });
    expect(await gateway.listAddresses(owner, token)).toContainEqual(created);
    await expect(gateway.listAddresses('22222222-2222-4222-8222-222222222222', token))
      .rejects.toMatchObject({ status: 403 });
    expect(await gateway.listAddresses('33333333-3333-4333-8333-333333333333', tokenFor('33333333-3333-4333-8333-333333333333'))).toEqual(
      [],
    );
  });

  it('creates a deterministic quote fixture and propagates no-coverage errors', async () => {
    const quote = await gateway.createQuote({
      address: {
        addressId: 'ADR-MOCK-0001',
        street: 'Av. Lima 123',
        district: 'Miraflores',
        province: 'Lima',
        department: 'Lima',
        phone: '999999999',
      },
      addressId: 'ADR-MOCK-0001',
      cartVersion: 8,
      lines: [{ sku: 'AERO-42-BLK', quantity: 2 }],
    });
    expect(quote).toMatchObject({
      subtotal: { amount: 340, currency: 'PEN' },
      shipping: { amount: 15, estimatedDays: 2 },
      total: { amount: 355, currency: 'PEN' },
    });

    values.MOCK_QUOTE_SCENARIO = 'NO_COVERAGE';
    await expect(
      gateway.createQuote({
        address: {
          addressId: 'ADR-X',
          street: 'Calle sin cobertura',
          district: 'Lima',
          province: 'Lima',
          department: 'Lima',
          phone: '900000000',
        },
        addressId: 'ADR-X',
        cartVersion: 8,
        lines: [{ sku: 'AERO-42-BLK', quantity: 1 }],
      }),
    ).rejects.toMatchObject({ status: 409, code: 'NO_SHIPPING_COVERAGE' });
  });

  it('returns a fresh coupon quote and does not duplicate an order after an uncertain timeout', async () => {
    const quote = {
      quoteId: 'Q-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      subtotal: { amount: 340, currency: 'PEN' },
      discount: { amount: 0, currency: 'PEN' },
      shipping: { amount: 15, currency: 'PEN', estimatedDays: 2 },
      total: { amount: 355, currency: 'PEN' },
      lines: [{ sku: 'AERO-42-BLK', quantity: 2 }],
      addressId: 'ADR-MOCK-0001',
      cartVersion: 8,
    };
    const discounted = await gateway.applyBenefit(quote, 'SAVE20');
    expect(discounted).toMatchObject({
      discount: { amount: 20 },
      total: { amount: 335 },
    });

    values.MOCK_SALES_SCENARIO = 'POST_TIMEOUT';
    const input = {
      customerId: '11111111-1111-4111-8111-111111111111',
      checkoutOperationId: '11111111-1111-4111-8111-111111111111',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      contact: {
        fullName: 'Test Customer',
        documentType: 'DNI' as const,
        documentNumber: '12345678',
        phone: '900000000',
        email: 'customer@example.test',
      },
      total: { amount: 335, currency: 'PEN' },
    };
    await expect(gateway.createOrder(input)).rejects.toBeInstanceOf(ProviderError);
    const retried = await gateway.createOrder(input);
    expect(retried.pedidoId).toMatch(/^PED-\d{4}-\d{5}$/);
    expect(await gateway.getOrder(retried.pedidoId)).toMatchObject({ estado: 'CREADO' });
    expect(await gateway.getOrderByIdempotencyKey(input.idempotencyKey, input.customerId)).toMatchObject({
      pedidoId: retried.pedidoId,
      estado: 'CREADO',
    });
  });

  it('isolates identical idempotency keys by customer and rejects a changed payload within a scope', async () => {
    const idempotencyKey = '33333333-3333-4333-8333-333333333333';
    const first = {
      customerId: '11111111-1111-4111-8111-111111111111',
      checkoutOperationId: '44444444-4444-4444-8444-444444444444',
      idempotencyKey,
      contact: {
        fullName: 'First Customer',
        documentType: 'DNI' as const,
        documentNumber: '12345678',
        phone: '900000000',
        email: 'first@example.test',
      },
      total: { amount: 355, currency: 'PEN' as const },
    };
    const second = {
      ...first,
      customerId: '22222222-2222-4222-8222-222222222222',
      checkoutOperationId: '55555555-5555-4555-8555-555555555555',
      contact: { ...first.contact, fullName: 'Second Customer', email: 'second@example.test' },
      total: { amount: 999, currency: 'PEN' as const },
    };

    const firstOrder = await gateway.createOrder(first);
    const replayedFirstOrder = await gateway.createOrder(first);
    const secondOrder = await gateway.createOrder(second);

    expect(replayedFirstOrder).toEqual(firstOrder);
    expect(secondOrder.pedidoId).not.toBe(firstOrder.pedidoId);
    expect(firstOrder.total.amount).toBe(355);
    expect(secondOrder.total.amount).toBe(999);
    expect(await gateway.getOrderByIdempotencyKey(idempotencyKey, first.customerId)).toMatchObject({
      pedidoId: firstOrder.pedidoId,
      total: { amount: 355 },
    });
    expect(await gateway.getOrderByIdempotencyKey(idempotencyKey, second.customerId)).toMatchObject({
      pedidoId: secondOrder.pedidoId,
      total: { amount: 999 },
    });
    await expect(gateway.createOrder({ ...first, total: { amount: 500, currency: 'PEN' } })).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  });

  it('returns an empty-address fixture and maps mocked timeouts to provider errors', async () => {
    values.MOCK_ADDRESS_SCENARIO = 'EMPTY';
    expect(
      await gateway.listAddresses('11111111-1111-4111-8111-111111111111', tokenFor('11111111-1111-4111-8111-111111111111')),
    ).toEqual([]);
    values.MOCK_ADDRESS_SCENARIO = 'TIMEOUT';
    await expect(
      gateway.listAddresses('11111111-1111-4111-8111-111111111111', tokenFor('11111111-1111-4111-8111-111111111111')),
    ).rejects.toMatchObject({ status: 504, code: 'ADDRESS_SERVICE_UNAVAILABLE' });
  });

  it('fails closed before HTTP when MOCK providers are disabled; this is not a REAL G5 integration', async () => {
    const get = jest.spyOn(http, 'get');
    const post = jest.spyOn(http, 'post');
    values.USE_MOCKS = false;

    await expect(gateway.getOrder('PED-2026-00001')).rejects.toMatchObject({
      status: 503,
      response: { error: { code: 'EXTERNAL_INTEGRATION_DISABLED' } },
    });
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('maps only trusted checkout quote and address data to the G5 M1 request', async () => {
    Object.assign(values, {
      USE_MOCKS: false,
      CHECKOUT_SALES_SOURCE: 'g5',
      G5_SALES_INTEGRATION_APPROVED: 'true',
      AUTH_ENABLED: 'true',
      G5_CONTRACT_PRODUCT_FALLBACK_ENABLED: 'false',
    });
    const g5Sales = {
      createOrder: jest.fn().mockResolvedValue({
        pedidoId: 'PED-2026-00001', estado: 'CREADO', total: { amount: 139.9, currency: 'PEN' },
        createdAt: '2026-11-24T10:15:00.000Z',
      }),
      getOrder: jest.fn(),
    };
    const realGateway = new MarketplaceGateway(http, {
      get: (key: string, fallback?: unknown) => values[key] ?? fallback,
    } as unknown as ConfigService, g5Sales as never);
    jest.spyOn(realGateway, 'listAddresses').mockResolvedValue([{
      addressId: 'ADR-1', street: 'Av. Test 12', district: 'Miraflores', province: 'Lima', department: 'Lima',
      reference: 'Puerta azul',
    }]);

    await realGateway.createOrder({
      customerId: '11111111-1111-4111-8111-111111111111',
      checkoutOperationId: '22222222-2222-4222-8222-222222222222',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      contact: {
        fullName: 'Synthetic Buyer', documentType: 'DNI', documentNumber: '12345678',
        phone: '900000000', email: 'buyer@example.invalid',
      },
      total: { amount: 139.9, currency: 'PEN' },
      quote: {
        addressId: 'ADR-1',
        lines: [{ sku: 'SKU-AUR-01', quantity: 1, productId: 'PROD-101', description: 'Audífonos',
          unitPrice: { amount: 129.9, currency: 'PEN' } }],
        quoteSnapshot: {
          subtotal: { amount: 129.9, currency: 'PEN' }, discount: { amount: 0, currency: 'PEN' },
          shipping: { amount: 10, currency: 'PEN', estimatedDays: 2 },
        },
      },
      paymentMethod: 'SIMULADO', customerAccessToken: 'synthetic-customer-token',
    });

    expect(g5Sales.createOrder).toHaveBeenCalledWith({
      canal: 'MARKETPLACE',
      contacto: {
        clienteId: '11111111-1111-4111-8111-111111111111', nombreCompleto: 'Synthetic Buyer',
        tipoDocumento: 'DNI', numeroDocumento: '12345678', telefono: '900000000', email: 'buyer@example.invalid',
      },
      items: [{ productoId: 'PROD-101', sku: 'SKU-AUR-01', cantidad: 1, precioUnitario: 129.9, descripcion: 'Audífonos' }],
      envio: {
        modalidad: 'DOMICILIO', costo: 10, destinatario: 'Synthetic Buyer', departamento: 'Lima', provincia: 'Lima',
        distrito: 'Miraflores', direccion: 'Av. Test 12', referencia: 'Puerta azul',
      },
      pago: { metodoPago: 'SIMULADO', moneda: 'PEN', subtotal: 129.9, descuentoCupon: 0, costoEnvio: 10, total: 139.9 },
    }, '33333333-3333-4333-8333-333333333333');
    expect(JSON.stringify(g5Sales.createOrder.mock.calls[0])).not.toContain('synthetic-customer-token');
  });

  it('uses the documented G5 sample product only behind the explicit fallback flag and matching quote', async () => {
    Object.assign(values, {
      USE_MOCKS: false,
      CHECKOUT_SALES_SOURCE: 'g5',
      G5_SALES_INTEGRATION_APPROVED: 'true',
      AUTH_ENABLED: 'true',
      G5_CONTRACT_PRODUCT_FALLBACK_ENABLED: 'true',
    });
    const g5Sales = { createOrder: jest.fn().mockResolvedValue({}), getOrder: jest.fn() };
    const realGateway = new MarketplaceGateway(http, {
      get: (key: string, fallback?: unknown) => values[key] ?? fallback,
    } as unknown as ConfigService, g5Sales as never);
    jest.spyOn(realGateway, 'listAddresses').mockResolvedValue([{
      addressId: 'ADR-1', street: 'Av. Test 12', district: 'Miraflores', province: 'Lima', department: 'Lima',
    }]);
    await realGateway.createOrder({
      customerId: '11111111-1111-4111-8111-111111111111', checkoutOperationId: '22222222-2222-4222-8222-222222222222',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      contact: { fullName: 'Synthetic Buyer', documentType: 'DNI', documentNumber: '12345678', phone: '900000000', email: 'buyer@example.invalid' },
      total: { amount: 139.9, currency: 'PEN' }, customerAccessToken: 'synthetic-customer-token', paymentMethod: 'SIMULADO',
      quote: { addressId: 'ADR-1', lines: [{ sku: 'SKU-AUR-01', quantity: 1 }], quoteSnapshot: {
        subtotal: { amount: 129.9, currency: 'PEN' }, discount: { amount: 0, currency: 'PEN' },
        shipping: { amount: 10, currency: 'PEN', estimatedDays: 2 },
      } },
    });
    expect(g5Sales.createOrder.mock.calls[0][0].items).toEqual([{
      productoId: 'PROD-101', sku: 'SKU-AUR-01', cantidad: 1, precioUnitario: 129.9,
      descripcion: 'Audífonos Inalámbricos Bluetooth',
    }]);
  });
});
