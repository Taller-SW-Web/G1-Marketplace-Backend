// Test entrypoint only. Never imported by the application bootstrap.
import 'reflect-metadata';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IdentityPort } from '../src/identity/identity.guard';
import { ApiError } from '../src/http/api-error';
import { WishlistCatalog, SandboxWishlistCatalog } from '../src/catalog/wishlist-catalog';
import { ProductEligibilityPort, SandboxProductEligibility } from '../src/catalog/product-eligibility';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/http/configure-app';
import { validateTestDatabase } from './test-database';
import { SANDBOX_CUSTOMERS } from '../src/identity/sandbox-token';

async function main() {
  if (process.env.NODE_ENV !== 'test' || process.env.H4_CONNECTED_TEST !== 'true'
    || process.env.DATABASE_URL !== validateTestDatabase({ TEST_DATABASE_URL: process.env.TEST_DATABASE_URL })
    || !process.env.H4_CONTROL_SECRET || !process.env.H4_READY_FILE) throw new Error('Use the connected test runner');
  const submissions: unknown[] = [];
  let prisma: PrismaService;
  const fixture = createServer(async (req, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/__test/state') {
        if (req.headers.authorization !== `Bearer ${process.env.H4_CONTROL_SECRET}`) { res.writeHead(403).end(); return; }
        res.end(JSON.stringify({ submissions, prompts: await prisma.postDeliveryPrompt.findMany(),
          favorites: await prisma.wishlistItem.findMany(), carts: await prisma.cart.findMany({ include: { items: true } }) })); return;
      }
      if (!['Bearer connected-A', 'Bearer connected-B'].includes(req.headers.authorization ?? '')) { res.writeHead(401).end(); return; }
      if (req.method === 'GET' && req.url?.startsWith('/api/v1/pedidos/')) {
        const pedidoId = req.url.split('/').pop()!;
        res.end(JSON.stringify({ pedidoId, canal: 'MARKETPLACE',
          contacto: { clienteId: pedidoId.endsWith('00005') ? SANDBOX_CUSTOMERS.B : SANDBOX_CUSTOMERS.A },
          estado: pedidoId.endsWith('00004') ? 'PREPARANDO' : 'ENTREGADO' })); return;
      }
      if (req.method === 'POST' && req.url === '/api/v2/csat') {
        let text = ''; for await (const chunk of req) text += chunk;
        const body = JSON.parse(text); submissions.push(body);
        if (body.pedidoId.endsWith('00003')) { res.writeHead(503).end('{}'); return; }
        if (body.pedidoId.endsWith('00002')) { res.writeHead(409).end(JSON.stringify({ code: 'CSAT_ALREADY_SUBMITTED' })); return; }
        res.writeHead(201).end(); return;
      }
      res.writeHead(404).end('{}');
    } catch { res.writeHead(500).end('{}'); }
  });
  await new Promise<void>(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const address = fixture.address() as { port: number };
  const fixtureUrl = `http://127.0.0.1:${address.port}`;
  Object.assign(process.env, { CSAT_SALES_BASE_URL: fixtureUrl, CSAT_POSTVENTA_BASE_URL: fixtureUrl });
  const { AppModule } = await import('../src/app.module');
  const sandbox = new ConfigService({ NODE_ENV: 'test', H3_SANDBOX_ENABLED: true });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(IdentityPort).useValue({ authenticate: async (token: string) => {
      if (!['connected-A', 'connected-B'].includes(token)) throw new ApiError(401, 'UNAUTHORIZED', 'Test identity required');
      return { customerId: token === 'connected-A' ? SANDBOX_CUSTOMERS.A : SANDBOX_CUSTOMERS.B };
    } })
    .overrideProvider(WishlistCatalog).useValue(new SandboxWishlistCatalog(sandbox))
    .overrideProvider(ProductEligibilityPort).useValue(new SandboxProductEligibility(sandbox)).compile();
  const app = module.createNestApplication(); configureApp(app);
  prisma = app.get(PrismaService); await prisma.$connect();
  // These rows are fixtures in a database created and owned by the runner.
  for (let i = 1; i <= 5; i++) await prisma.postDeliveryPrompt.create({ data: {
    customerId: SANDBOX_CUSTOMERS.A, externalOrderId: `PED-2026-${String(i).padStart(5, '0')}`,
    deliveryConfirmedAt: new Date('2026-01-01'), eligibleAt: new Date('2026-01-01'),
    shownAt: new Date('2026-01-02'), state: 'SHOWN',
  } });
  await app.listen(0, '127.0.0.1');
  writeFileSync(process.env.H4_READY_FILE!, JSON.stringify({ backendUrl: await app.getUrl(), fixtureUrl }));
  const stop = async () => { fixture.close(); await app.close(); process.exit(0); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
main().catch(error => { console.error(error); process.exit(1); });
