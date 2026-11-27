const { createRequire } = require('node:module');
const { setTimeout: delay } = require('node:timers/promises');

function readLatency(name) {
  const value = Number(process.env[name] ?? 0);
  if (!Number.isInteger(value) || value < 0 || value > 200) {
    throw new Error(`${name} must be an integer from 0 to 200 ms.`);
  }
  return value;
}

const g6Latency = readLatency('PERF_G6_LATENCY_MS');
const g5Latency = readLatency('PERF_G5_LATENCY_MS');

if (g6Latency || g5Latency) {
  if (process.env.NODE_ENV !== 'development' || process.env.USE_MOCKS !== 'true' ||
      process.env.CATALOG_SOURCE !== 'mock' || process.env.CHECKOUT_SALES_SOURCE !== 'mock') {
    throw new Error('The performance preload requires the local Docker fixture configuration.');
  }

  const requireApp = createRequire('/app/package.json');
  requireApp('reflect-metadata');

  if (g6Latency) {
    const fixtures = requireApp('./dist/catalog/fixtures.js');
    const createMockProvider = fixtures.createMockProvider;
    fixtures.createMockProvider = (...args) => {
      const provider = createMockProvider(...args);
      const home = provider.home.bind(provider);
      // Delay the provider call, so a hit in CatalogService bypasses the stub.
      provider.home = async (...params) => {
        await delay(g6Latency);
        return home(...params);
      };
      return provider;
    };
  }

  if (g5Latency) {
    const { MockHttpAdapter } = requireApp('./dist/checkout/external/mock-http.adapter.js');
    const installSalesFixtures = MockHttpAdapter.prototype.installSalesFixtures;
    MockHttpAdapter.prototype.installSalesFixtures = function () {
      installSalesFixtures.call(this);
      this.http.axiosRef.interceptors.request.use(async (request) => {
        if (typeof request.url === 'string' && request.url.startsWith('http://sales.mock/')) {
          await delay(g5Latency);
        }
        return request;
      });
    };
  }
}
