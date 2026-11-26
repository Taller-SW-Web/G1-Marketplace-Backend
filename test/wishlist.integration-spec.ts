import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { validateTestDatabase } from '../scripts/test-database';
import { configureApp } from '../src/http/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { issueSandboxToken, SANDBOX_CUSTOMERS } from '../src/identity/sandbox-token';

// This suite can also be called directly: validate its destination before any DB write.
if (process.env.H3_ALLOW_TEST_DATABASE_WRITES !== 'true') throw new Error('Database writes are disabled');
const databaseUrl = validateTestDatabase({ TEST_DATABASE_URL: process.env.TEST_DATABASE_URL });
if (process.env.NODE_ENV !== 'test' || process.env.DATABASE_URL !== databaseUrl) {
  throw new Error('Use npm run test:integration with an isolated database');
}
process.env.H3_SANDBOX_ENABLED = 'true';
process.env.H3_JWT_SECRET = 'integration-only-random-fixture-secret-not-for-deploy';
const path = '/api/v1/wishlist/items';

describe('Wishlist PostgreSQL 16 integration (MOCK identity/catalog)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const auth = (customer: string = SANDBOX_CUSTOMERS.A) =>
    `Bearer ${issueSandboxToken(customer, process.env.H3_JWT_SECRET!)}`;

  async function start(): Promise<void> {
    // Import only after the isolated test environment is configured.
    const { AppModule } = await import('../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); configureApp(app); await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
  }
  async function clean(): Promise<void> {
    await prisma.wishlistItem.deleteMany({ where: { customerId: { in: Object.values(SANDBOX_CUSTOMERS) } } });
  }
  beforeAll(start);
  beforeEach(clean);
  afterAll(async () => { if (prisma) await clean(); await app?.close(); });

  it('uses PostgreSQL 16 and reports real readiness', async () => {
    const version = await prisma.$queryRawUnsafe<Array<{ server_version: string }>>('SHOW server_version');
    expect(version[0].server_version).toMatch(/^16\./);
    for (const path of ['/', '/health', '/ready']) {
      await request(app.getHttpServer()).get(path).expect(200).expect(({ body }) => {
        expect(body).toEqual({ status: 'UP', service: 'g1-marketplace-backend',
          environment: 'test', database: { connected: true }, timestamp: expect.any(String) });
        expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
      });
    }
  });

  it('persists, preserves createdAt, survives app restart and deletes idempotently', async () => {
    await request(app.getHttpServer()).post(path).set('Authorization', auth()).send({ productId: 'PRD-1' }).expect(201);
    const first = await prisma.wishlistItem.findFirstOrThrow({ where: { customerId: SANDBOX_CUSTOMERS.A } });
    await request(app.getHttpServer()).post(path).set('Authorization', auth()).send({ productId: 'PRD-1' }).expect(200);
    const repeated = await prisma.wishlistItem.findUniqueOrThrow({ where: { id: first.id } });
    expect(repeated.createdAt).toEqual(first.createdAt);
    await app.close(); await start();
    expect(await prisma.wishlistItem.findUnique({ where: { id: first.id } })).not.toBeNull();
    for (let i = 0; i < 2; i++) {
      await request(app.getHttpServer()).delete(`${path}/PRD-1`).set('Authorization', auth()).expect(204);
    }
    expect(await prisma.wishlistItem.count()).toBe(0);
  });

  it('serializes ten concurrent creates through database uniqueness', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      request(app.getHttpServer()).post(path).set('Authorization', auth()).send({ productId: 'PRD-1' })));
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(results.filter((result) => result.status === 200)).toHaveLength(9);
    expect(await prisma.wishlistItem.count()).toBe(1);
  });

  it('isolates A and B and does not delete another customer data', async () => {
    await request(app.getHttpServer()).post(path).set('Authorization', auth()).send({ productId: 'PRD-1' }).expect(201);
    await request(app.getHttpServer()).delete(`${path}/PRD-1`).set('Authorization', auth(SANDBOX_CUSTOMERS.B)).expect(204);
    expect(await prisma.wishlistItem.count({ where: { customerId: SANDBOX_CUSTOMERS.A } })).toBe(1);
    await request(app.getHttpServer()).post(path).set('Authorization', auth(SANDBOX_CUSTOMERS.B)).send({ productId: 'PRD-1' }).expect(201);
    expect(await prisma.wishlistItem.count()).toBe(2);
    await request(app.getHttpServer()).delete(`${path}/PRD-1`).set('Authorization', auth(SANDBOX_CUSTOMERS.B)).expect(204);
    expect(await prisma.wishlistItem.count({ where: { customerId: SANDBOX_CUSTOMERS.A } })).toBe(1);
  });

  it('leaves no rows for rejected requests', async () => {
    await request(app.getHttpServer()).post(path).send({ productId: 'PRD-1' }).expect(401);
    for (const [productId, status] of [['PRD-INACTIVE', 404], ['PRD-MISSING', 404], ['PRD-UNAVAILABLE', 503]] as const) {
      await request(app.getHttpServer()).post(path).set('Authorization', auth()).send({ productId }).expect(status);
    }
    await request(app.getHttpServer()).post(path).set('Authorization', auth())
      .send({ productId: 'PRD-1', customerId: SANDBOX_CUSTOMERS.B }).expect(400);
    expect(await prisma.wishlistItem.count()).toBe(0);
  });
});
