import { ConfigService } from '@nestjs/config';
import { SalesCsatGateway } from './csat.gateway';

function makeConfig(overrides: Record<string, string | number | undefined> = {}) {
  const values: Record<string, string | number | undefined> = {
    CSAT_SALES_BASE_URL: 'https://sales.example.test',
    CSAT_POSTVENTA_BASE_URL: 'https://postventa.example.test',
    HTTP_TIMEOUT_MS: 3000,
    NODE_ENV: 'production',
    ...overrides,
  };
  return {
    get: <T = unknown>(key: string, fallback?: T) => (key in values ? (values[key] as T) : fallback),
  } as unknown as ConfigService;
}

describe('SalesCsatGateway (F-040)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('rejects insecure or malformed gateway configuration with 503 SALES_UNAVAILABLE', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    for (const bad of [
      { CSAT_SALES_BASE_URL: '' },
      { CSAT_SALES_BASE_URL: 'http://sales.example.test' },
      { CSAT_SALES_BASE_URL: 'https://sales.example.test/prefix' },
      { HTTP_TIMEOUT_MS: 50 },
    ]) {
      const gateway = new SalesCsatGateway(makeConfig(bad));
      await expect(gateway.assertDelivered('PED-2026-00001', 'cust-1', 'tok'))
        .rejects.toMatchObject({ status: 503, response: { code: 'SALES_UNAVAILABLE' } });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows loopback HTTP outside production and handles assertDelivered outcomes', async () => {
    const gateway = new SalesCsatGateway(makeConfig({
      CSAT_SALES_BASE_URL: 'http://127.0.0.1:4010',
      NODE_ENV: 'test',
    }));

    global.fetch = jest.fn(async () => new Response(JSON.stringify({
      pedidoId: 'PED-2026-00001',
      canal: 'MARKETPLACE',
      contacto: { clienteId: 'cust-1' },
      estado: 'ENTREGADO',
    }), { status: 200 })) as unknown as typeof fetch;
    await expect(gateway.assertDelivered('PED-2026-00001', 'cust-1', 'tok')).resolves.toBeUndefined();

    const statusCases: Array<[number, number, string]> = [
      [401, 401, 'UNAUTHORIZED'],
      [403, 403, 'ORDER_FORBIDDEN'],
      [404, 404, 'ORDER_NOT_AVAILABLE'],
      [502, 503, 'SALES_UNAVAILABLE'],
    ];
    for (const [remoteStatus, expectedStatus, code] of statusCases) {
      global.fetch = jest.fn(async () => new Response(null, { status: remoteStatus })) as unknown as typeof fetch;
      await expect(gateway.assertDelivered('PED-2026-00001', 'cust-1', 'tok'))
        .rejects.toMatchObject({ status: expectedStatus, response: { code } });
    }

    global.fetch = jest.fn(async () => new Response('not-json', { status: 200 })) as unknown as typeof fetch;
    await expect(gateway.assertDelivered('PED-2026-00001', 'cust-1', 'tok'))
      .rejects.toMatchObject({ status: 503, response: { code: 'SALES_UNAVAILABLE' } });

    global.fetch = jest.fn(async () => new Response(JSON.stringify({
      pedidoId: 'PED-2026-00001',
      canal: 'MARKETPLACE',
      contacto: { clienteId: 'other-cust' },
      estado: 'ENTREGADO',
    }), { status: 200 })) as unknown as typeof fetch;
    await expect(gateway.assertDelivered('PED-2026-00001', 'cust-1', 'tok'))
      .rejects.toMatchObject({ status: 403, response: { code: 'ORDER_FORBIDDEN' } });

    global.fetch = jest.fn(async () => new Response(JSON.stringify({
      pedidoId: 'PED-2026-00001',
      canal: 'MARKETPLACE',
      contacto: { clienteId: 'cust-1' },
      estado: 'EN_CAMINO',
    }), { status: 200 })) as unknown as typeof fetch;
    await expect(gateway.assertDelivered('PED-2026-00001', 'cust-1', 'tok'))
      .rejects.toMatchObject({ status: 422, response: { code: 'ORDER_NOT_DELIVERED' } });
  });

  it('handles submit 201 and error mappings cleanly', async () => {
    const gateway = new SalesCsatGateway(makeConfig());
    const payload = { pedidoId: 'PED-2026-00001', clienteId: 'cust-1', canal: 'MARKETPLACE' as const, puntuacion: 5, comentario: '' };

    global.fetch = jest.fn(async () => new Response(null, { status: 201 })) as unknown as typeof fetch;
    await expect(gateway.submit(payload, 'tok')).resolves.toBeUndefined();

    global.fetch = jest.fn(async () => new Response(null, { status: 401 })) as unknown as typeof fetch;
    await expect(gateway.submit(payload, 'tok')).rejects.toMatchObject({ status: 401, response: { code: 'UNAUTHORIZED' } });

    global.fetch = jest.fn(async () => new Response(null, { status: 403 })) as unknown as typeof fetch;
    await expect(gateway.submit(payload, 'tok')).rejects.toMatchObject({ status: 403, response: { code: 'ORDER_FORBIDDEN' } });

    global.fetch = jest.fn(async () => new Response(JSON.stringify({ codigo: 'CSAT_ALREADY_SUBMITTED' }), { status: 409 })) as unknown as typeof fetch;
    await expect(gateway.submit(payload, 'tok')).rejects.toMatchObject({ status: 409, response: { code: 'CSAT_ALREADY_SUBMITTED' } });

    global.fetch = jest.fn(async () => new Response(JSON.stringify({ codigo: 'ORDER_NOT_DELIVERED' }), { status: 422 })) as unknown as typeof fetch;
    await expect(gateway.submit(payload, 'tok')).rejects.toMatchObject({ status: 422, response: { code: 'ORDER_NOT_DELIVERED' } });

    global.fetch = jest.fn(async () => new Response('oops', { status: 409 })) as unknown as typeof fetch;
    await expect(gateway.submit(payload, 'tok')).rejects.toMatchObject({ status: 503, response: { code: 'SALES_UNAVAILABLE' } });
  });
});
