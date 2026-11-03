import { Logger } from '@nestjs/common';
import { createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';

afterEach(() => jest.restoreAllMocks());
const env = { NODE_ENV: 'test', PRODUCTOS_AUTH_MODE: 'demo-no-auth', CATALOG_INTEGRATION_APPROVED: 'true',
  PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA, PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION };

test('maps an opaque G1 request ID to UUID for G6 and records both safe identifiers', async () => {
  const log = jest.spyOn(Logger, 'log').mockImplementation(() => {});
  let id = '';
  const provider = createRealProvider(env, async (_url, options) => {
    id = new Headers(options.headers).get('X-Correlation-Id')!;
    return Response.json({ categories: [] });
  });
  await provider.home('fe-correlacion-01');
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'catalog_provider_correlation', requestId: 'fe-correlacion-01', providerRequestId: id }), 'CatalogProvider');
});
test('keeps an existing UUID unchanged to preserve direct end-to-end correlation', async () => {
  const id = 'a891739e-640e-411f-a1c9-ef704593bbf2';
  const provider = createRealProvider(env, async (_url, options) => {
    expect(new Headers(options.headers).get('X-Correlation-Id')).toBe(id);
    return Response.json({ categories: [] });
  });
  await provider.home(id);
});
