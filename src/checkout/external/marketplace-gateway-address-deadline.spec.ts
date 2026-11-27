import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import axios from 'axios';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { MarketplaceGateway } from './marketplace.gateway';

const addressBody = JSON.stringify({
  direcciones: [{ id: 'ADR-1', direccion: 'Av. Lima 123', distrito: 'Miraflores', provincia: 'Lima', departamento: 'Lima' }],
});

describe('MarketplaceGateway address lookup with a total deadline', () => {
  let server: Server;
  let apiUrl: string;
  let trickleMs = 0;
  let requests = 0;

  beforeAll(async () => {
    server = createServer((request, response) => {
      requests += 1;
      request.resume();
      response.writeHead(200, { 'content-type': 'application/json' });
      if (trickleMs <= 0) { response.end(addressBody); return; }
      // cuerpo en partes con pausas menores que el timeout de inactividad de Axios
      const parts = addressBody.match(/[\s\S]{1,20}/g) ?? [addressBody];
      let sent = 0;
      const timer = setInterval(() => {
        response.write(parts[sent]);
        sent += 1;
        if (sent === parts.length) { clearInterval(timer); response.end(); }
      }, trickleMs);
      response.on('close', () => clearInterval(timer));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });
  afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });
  beforeEach(() => { trickleMs = 0; requests = 0; });

  function gateway() {
    const values: Record<string, unknown> = {
      CHECKOUT_ADDRESS_SOURCE: 'g7', AUTH_ENABLED: 'true', USE_MOCKS: false, NODE_ENV: 'test', G7_API_URL: apiUrl, HTTP_TIMEOUT_MS: 3000,
    };
    const config = {
      get: (key: string, fallback?: unknown) => values[key] ?? fallback,
      getOrThrow: (key: string) => values[key],
    };
    return new MarketplaceGateway(new HttpService(axios.create({ timeout: 3000 })), config as unknown as ConfigService);
  }

  it('keeps the old behaviour without a deadline', async () => {
    await expect(gateway().listAddresses('owner-1', 'synthetic-customer-token')).resolves.toMatchObject([{ addressId: 'ADR-1' }]);
  });

  it('answers SALES_TIMEOUT at the absolute deadline even when the body trickles in short pauses', async () => {
    trickleMs = 60;
    const startedAt = Date.now();
    await expect(gateway().listAddresses('owner-1', 'synthetic-customer-token', Date.now() + 180))
      .rejects.toMatchObject({ status: 504, message: expect.stringContaining('SALES_TIMEOUT') });
    expect(Date.now() - startedAt).toBeLessThan(400);
  });

  it('does not call G7 when the budget is already spent', async () => {
    await expect(gateway().listAddresses('owner-1', 'synthetic-customer-token', Date.now() - 1))
      .rejects.toMatchObject({ status: 504 });
    expect(requests).toBe(0);
  });
});
