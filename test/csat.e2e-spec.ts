import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { once } from 'node:events';
import { createServer, Server } from 'node:http';
import request from 'supertest';
import { CsatModule } from '../src/csat/csat.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/http/configure-app';
import { issueSandboxToken, SANDBOX_CUSTOMERS } from '../src/identity/sandbox-token';

describe('CSAT HTTP -> Sales adapter -> local provider (MOCK identity/persistence/provider)', () => {
  let app: INestApplication;
  let server: Server;
  let enabled = true;
  let promptState: string;
  let promptExists: boolean;
  let orderState: string;
  let owner: string;
  let providerStatus: number;
  let providerCode: string;
  let malformed: boolean;
  let timeout: boolean;
  let sent: Record<string, unknown>[];
  let tokenSeen: string | undefined;
  const orderId = 'PED-2026-00001';
  const secret = 'csat-synthetic-test-only-secret-'.repeat(2);
  const token = (id: string = SANDBOX_CUSTOMERS.A) => issueSandboxToken(id, secret);
  const endpoint = `/api/v1/orders/${orderId}/csat`;
  const update = jest.fn(async () => { promptState = 'SUBMITTED'; return { count: 1 }; });
  const lookup = jest.fn(async () => promptExists ? { state: promptState, deliveryConfirmedAt: new Date('2026-01-01'), shownAt: new Date('2026-01-02') } : null);
  beforeAll(async () => {
    server = createServer(async (req, res) => {
      tokenSeen = req.headers.authorization;
      if (timeout) return;
      if (req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(malformed ? {} : { pedidoId: orderId, canal: 'MARKETPLACE',
          estado: orderState, contacto: { clienteId: owner } }));
      }
      let body = ''; for await (const chunk of req) body += chunk;
      sent.push(JSON.parse(body));
      res.writeHead(providerStatus, { 'Content-Type': 'application/json' });
      res.end(providerStatus === 201 ? undefined : JSON.stringify({ code: providerCode, detail: 'private-provider-data' }));
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Port');
    const config = { NODE_ENV: 'test', H3_SANDBOX_ENABLED: true, H3_JWT_SECRET: secret,
      CSAT_INTEGRATION_APPROVED: 'true', CSAT_PROMPT_APPROVED: 'true', HTTP_TIMEOUT_MS: 100,
      CSAT_SALES_BASE_URL: `http://127.0.0.1:${address.port}`, CSAT_POSTVENTA_BASE_URL: `http://127.0.0.1:${address.port}`,
      get CSAT_ENABLED() { return enabled ? 'true' : 'false'; } };
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true,
      ignoreEnvFile: true, ignoreEnvVars: true }), CsatModule] })
      .overrideProvider(ConfigService).useValue({ get: (key: keyof typeof config, fallback?: unknown) => config[key] ?? fallback,
        getOrThrow: (key: keyof typeof config) => config[key] })
      .overrideProvider(PrismaService).useValue({ postDeliveryPrompt: { findUnique: lookup, updateMany: update } }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init();
  });
  afterAll(async () => { await app?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  beforeEach(() => { enabled = true; promptState = 'SHOWN'; promptExists = true; orderState = 'ENTREGADO';
    owner = SANDBOX_CUSTOMERS.A; providerStatus = 201; providerCode = ''; malformed = false; timeout = false;
    sent = []; tokenSeen = undefined; jest.clearAllMocks(); });
  const submit = (body: object = { sentiment: 'GOOD', reasons: ['ENTREGA_RAPIDA'], comment: 'Excelente' }, id?: string) =>
    request(app.getHttpServer()).post(endpoint).auth(token(id), { type: 'bearer' }).send(body);

  it.each([['GOOD', 5], ['REGULAR', 3], ['BAD', 1]])('maps %s to %s with verified owner and no second CSAT table', async (sentiment, score) => {
    const response = await submit({ sentiment, reasons: ['ENTREGA_RAPIDA'], comment: 'Excelente' }).expect(201);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(sent).toEqual([{ pedidoId: orderId, clienteId: SANDBOX_CUSTOMERS.A, canal: 'MARKETPLACE',
      puntuacion: score, comentario: 'Motivos: [ENTREGA_RAPIDA] - Excelente' }]);
    expect(tokenSeen).toBe(`Bearer ${token()}`);
    expect(promptState).toBe('SUBMITTED');
    await submit().expect(409); expect(sent).toHaveLength(1);
  });
  it('rejects anonymous, tampered identity, unknown fields and invalid input before provider calls', async () => {
    await request(app.getHttpServer()).post(endpoint).send({ sentiment: 'GOOD' }).expect(401);
    await request(app.getHttpServer()).post(endpoint).auth('invalid', { type: 'bearer' }).send({ sentiment: 'GOOD' }).expect(401);
    for (const body of [{ sentiment: 'OTHER' }, { sentiment: 'GOOD', clienteId: owner },
      { sentiment: 'GOOD', reasons: ['<script>'] }, { sentiment: 'GOOD', comment: 'x'.repeat(1001) }]) await submit(body).expect(400);
    await request(app.getHttpServer()).post(endpoint + '?customerId=other').auth(token(), { type: 'bearer' }).send({ sentiment: 'GOOD' }).expect(400);
    expect(lookup).not.toHaveBeenCalled(); expect(sent).toEqual([]);
  });
  it('rejects another owner, undelivered orders, missing/dismissed prompts and disabled gates', async () => {
    owner = SANDBOX_CUSTOMERS.B; await submit().expect(403);
    owner = SANDBOX_CUSTOMERS.A; orderState = 'CREADO'; await submit().expect(422);
    orderState = 'ENTREGADO'; promptExists = false; await submit().expect(409);
    promptExists = true; promptState = 'DISMISSED'; await submit().expect(409);
    promptState = 'ELIGIBLE'; await submit().expect(409);
    promptState = 'SHOWN'; enabled = false; await submit().expect(503);
    expect(update).not.toHaveBeenCalled(); expect(sent).toEqual([]);
  });
  it('reconciles a canonical provider duplicate, but never an arbitrary conflict', async () => {
    providerStatus = 409; providerCode = 'UNKNOWN_CONFLICT'; await submit().expect(503);
    expect(promptState).toBe('SHOWN'); expect(sent).toHaveLength(1);
    providerCode = 'CSAT_ALREADY_SUBMITTED'; await submit().expect(409);
    expect(promptState).toBe('SUBMITTED');
  });
  it('preserves prompt on uncertain results and does not retry or expose upstream details', async () => {
    providerStatus = 500; const response = await submit().expect(503);
    expect(JSON.stringify(response.body)).not.toContain('private-provider-data');
    expect(sent).toHaveLength(1); expect(update).not.toHaveBeenCalled();
    malformed = true; await submit().expect(503);
    malformed = false; timeout = true; await submit().expect(503);
    expect(promptState).toBe('SHOWN'); expect(sent).toHaveLength(1);
  });
});
