import { ConfigService } from '@nestjs/config';
import { G5OrdersProvider } from './g5-orders.provider';

describe('G5OrdersProvider (contract mock)', () => {
  const config = { get: (key: string, fallback?: unknown) => ({
    G5_API_URL: 'https://g5.example.test', NODE_ENV: 'test', HTTP_TIMEOUT_MS: 3000, G5_HTTP_TIMEOUT_MS: 150000,
  } as Record<string, unknown>)[key] ?? fallback } as unknown as ConfigService;
  const provider = new G5OrdersProvider(config);
  afterEach(() => jest.restoreAllMocks());

  it('maps zero-based G1 pages and date filters to the G5 one-based contract', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      items: [{ pedidoId: 'PED-2026-00981', estado: 'PAGADO', total: 129.9, moneda: 'PEN', fechaCreacion: '2026-10-10T12:00:00Z' }],
      total: 1, page: 1, pageSize: 10,
    }), { status: 200 }));
    const result = await provider.listForCustomer('', { page: 0, pageSize: 10, state: 'PAGADO', from: '2026-10-10', to: '2026-10-10' }, 'signed-user-token');
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://g5.example.test/api/v1/pedidos/me?page=1&pageSize=10&estado=PAGADO&desde=2026-10-10&hasta=2026-10-10');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer signed-user-token' });
    expect(timeoutSpy).toHaveBeenCalledWith(150000);
    expect(result).toMatchObject({ data: [{ orderId: 'PED-2026-00981', state: 'PAGADO' }], page: { number: 0, size: 10 } });
  });

  it('does not make a provider call without an end-user token', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(provider.listForCustomer('', { page: 0, pageSize: 10 })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('neutralizes G5 403 for an order detail as ORDER_NOT_AVAILABLE', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ codigo: 'ACCESO_DENEGADO', mensaje: 'private detail' }), { status: 403 }));
    await expect(provider.getForCustomer('', 'PED-2026-00981', 'signed-user-token')).resolves.toBeNull();
  });

  it('projects the historical detail and omits contact and full delivery address fields', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      pedidoId: 'PED-2026-00981', estado: 'PAGADO', fechaCreacion: '2026-10-10T12:00:00Z',
      contacto: { clienteId: 'private-id', email: 'juan.perez@example.test', telefono: '+51999888777', numeroDocumento: '12345678' },
      pago: { total: 129.9, moneda: 'PEN' },
      envio: { direccion: 'Av. La Marina 1234, Dpto 401', distrito: 'San Miguel', provincia: 'Lima', departamento: 'Lima', referencia: 'frente al centro comercial', fechaEstimadaEntrega: null },
      items: [{ sku: 'SKU-42', descripcion: 'Producto histórico', cantidad: 1, precioUnitario: 129.9 }],
      historialEstados: [{ estado: 'PAGADO', fecha: '2026-10-10T12:00:00Z', actor: 'SYSTEM', motivo: 'hidden' }],
    }), { status: 200 }));
    const result = await provider.getForCustomer('', 'PED-2026-00981', 'signed-user-token');
    expect(result).toMatchObject({ orderId: 'PED-2026-00981', total: { amount: 129.9, currency: 'PEN' }, lines: [{ unitPrice: { amount: 129.9 } }], milestones: [{ state: 'PAGADO' }] });
    expect(result?.shipping).toEqual({ locationSummary: 'San Miguel, Lima', emailMasked: 'j•••@•••', phoneMasked: '••••••777' });
    expect(result).not.toHaveProperty('contacto');
    expect(result).not.toHaveProperty('shipping.address');
    expect(JSON.stringify(result)).not.toMatch(/juan\.perez@example|999888777|12345678|La Marina|Dpto 401|centro comercial/);
  });
});
