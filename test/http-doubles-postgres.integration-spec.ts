import 'reflect-metadata';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateTestDatabase } from '../scripts/test-database';
import { CsatModule } from '../src/csat/csat.module';
import { CsatService } from '../src/csat/csat.service';
import { SANDBOX_CUSTOMERS } from '../src/identity/sandbox-token';
import { PrismaService } from '../src/prisma/prisma.service';

if (process.env.H3_ALLOW_TEST_DATABASE_WRITES !== 'true' || process.env.NODE_ENV !== 'test'
  || process.env.DATABASE_URL !== validateTestDatabase({ TEST_DATABASE_URL: process.env.TEST_DATABASE_URL })) {
  throw new Error('Use the isolated PostgreSQL runner');
}

type DoubleMode = 'ok' | 'timeout-submit' | '503-order' | '502-submit' | '409-duplicate';

describe('Deterministic HTTP doubles (timeout, 5xx, duplicate) against PostgreSQL 16', () => {
  let mode: DoubleMode = 'ok';
  let server: ReturnType<typeof createServer>;
  let baseUrl = '';
  let submitHits = 0;
  let prisma: PrismaService;
  let csat: CsatService;
  let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;

  const orderId = 'PED-2026-88881';
  const customerId = SANDBOX_CUSTOMERS.A;
  const where = { customerId_externalOrderId: { customerId, externalOrderId: orderId } };

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? '';
      if (req.method === 'GET' && url === `/api/v1/pedidos/${orderId}`) {
        if (mode === '503-order') {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 'TEMPORARY_DOWN' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          pedidoId: orderId,
          canal: 'MARKETPLACE',
          contacto: { clienteId: customerId },
          estado: 'ENTREGADO',
        }));
        return;
      }

      if (req.method === 'POST' && url === '/api/v2/csat') {
        submitHits += 1;
        if (mode === 'timeout-submit') {
          setTimeout(() => {
            if (!res.writableEnded) {
              res.writeHead(201);
              res.end();
            }
          }, 600);
          return;
        }
        if (mode === '502-submit') {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 'BAD_GATEWAY' }));
          return;
        }
        if (mode === '409-duplicate') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ codigo: 'CSAT_ALREADY_SUBMITTED' }));
          return;
        }
        res.writeHead(201);
        res.end();
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => ({
            NODE_ENV: 'test',
            HTTP_TIMEOUT_MS: 200,
            CSAT_ENABLED: 'true',
            CSAT_INTEGRATION_APPROVED: 'true',
            CSAT_PROMPT_APPROVED: 'true',
            CSAT_SALES_BASE_URL: baseUrl,
            CSAT_POSTVENTA_BASE_URL: baseUrl,
          })],
        }),
        CsatModule,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    csat = moduleRef.get(CsatService);
    await prisma.$connect();
  });

  beforeEach(async () => {
    mode = 'ok';
    submitHits = 0;
    await prisma.postDeliveryPrompt.deleteMany({ where: { customerId, externalOrderId: orderId } });
    await prisma.postDeliveryPrompt.create({
      data: {
        customerId,
        externalOrderId: orderId,
        deliveryConfirmedAt: new Date('2026-01-01T00:00:00Z'),
        eligibleAt: new Date('2026-01-01T00:00:00Z'),
        state: 'SHOWN',
        shownAt: new Date('2026-01-02T00:00:00Z'),
      },
    });
  });

  afterAll(async () => {
    await prisma?.postDeliveryPrompt.deleteMany({ where: { customerId, externalOrderId: orderId } });
    await prisma?.$disconnect();
    await moduleRef?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it('aborts on deterministic HTTP timeout and keeps PostgreSQL prompt SHOWN', async () => {
    mode = 'timeout-submit';
    await expect(csat.submit(customerId, orderId, 'synthetic-token', { sentiment: 'GOOD' }))
      .rejects.toMatchObject({ status: 503, response: { code: 'SALES_UNAVAILABLE' } });

    expect(submitHits).toBe(1);
    expect(await prisma.postDeliveryPrompt.findUnique({ where })).toMatchObject({
      state: 'SHOWN',
      submittedAt: null,
    });
  });

  it('maps deterministic 5xx responses from order check and submit without mutating PostgreSQL', async () => {
    mode = '503-order';
    await expect(csat.submit(customerId, orderId, 'synthetic-token', { sentiment: 'REGULAR' }))
      .rejects.toMatchObject({ status: 503, response: { code: 'SALES_UNAVAILABLE' } });
    expect(submitHits).toBe(0);

    mode = '502-submit';
    await expect(csat.submit(customerId, orderId, 'synthetic-token', { sentiment: 'BAD' }))
      .rejects.toMatchObject({ status: 503, response: { code: 'SALES_UNAVAILABLE' } });
    expect(submitHits).toBe(1);

    expect(await prisma.postDeliveryPrompt.findUnique({ where })).toMatchObject({
      state: 'SHOWN',
      submittedAt: null,
    });
  });

  it('reconciles deterministic 409 duplicate from HTTP double and blocks further retries', async () => {
    mode = '409-duplicate';
    await expect(csat.submit(customerId, orderId, 'synthetic-token', { sentiment: 'GOOD' }))
      .rejects.toMatchObject({ status: 409, response: { code: 'CSAT_ALREADY_SUBMITTED' } });
    expect(submitHits).toBe(1);

    expect(await prisma.postDeliveryPrompt.findUnique({ where })).toMatchObject({
      state: 'SUBMITTED',
      submittedAt: expect.any(Date),
    });

    await expect(csat.submit(customerId, orderId, 'synthetic-token', { sentiment: 'GOOD' }))
      .rejects.toMatchObject({ status: 409, response: { code: 'CSAT_ALREADY_SUBMITTED' } });
    expect(submitHits).toBe(1);
  });

  it('persists SUBMITTED in PostgreSQL on deterministic 200 + 201 HTTP double flow', async () => {
    mode = 'ok';
    await expect(csat.submit(customerId, orderId, 'synthetic-token', {
      sentiment: 'GOOD',
      reasons: ['ENTREGA_RAPIDA'],
      comment: 'Todo conforme',
    })).resolves.toBeUndefined();

    expect(submitHits).toBe(1);
    expect(await prisma.postDeliveryPrompt.findUnique({ where })).toMatchObject({
      state: 'SUBMITTED',
      submittedAt: expect.any(Date),
    });
  });
});
