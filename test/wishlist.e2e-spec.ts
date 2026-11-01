import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { sign } from 'jsonwebtoken';
import { WishlistModule } from '../src/wishlist/wishlist.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { WishlistRepository } from '../src/wishlist/wishlist.repository';
import { ProductEligibilityPort } from '../src/catalog/product-eligibility';
import { configureApp } from '../src/http/configure-app';
import { issueSandboxToken, SANDBOX_CUSTOMERS, SANDBOX_ISSUER, SANDBOX_AUDIENCE } from '../src/identity/sandbox-token';

describe('Wishlist HTTP contract (MOCK persistence and providers)', () => {
  let app: INestApplication;
  const secret = 'test-secret-not-for-deployment-'.repeat(2);
  const rows = new Set<string>();
  let enabled = true;
  const repository = {
    save: jest.fn(async (customer: string, product: string) => {
      const key = `${customer}:${product}`;
      const created = !rows.has(key); rows.add(key); return { created };
    }),
    remove: jest.fn(async (customer: string, product: string) => { rows.delete(`${customer}:${product}`); }),
  };
  const token = (customer = SANDBOX_CUSTOMERS.A) => issueSandboxToken(customer, secret);
  const path = '/api/v1/wishlist/items';
  const config = { get: (key: string, fallback?: unknown) => ({
    H3_SANDBOX_ENABLED: enabled, H3_JWT_SECRET: secret, CORS_ORIGINS: ['http://localhost:3000'],
  } as Record<string, unknown>)[key] ?? fallback, getOrThrow: () => secret };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), WishlistModule],
    }).overrideProvider(ConfigService).useValue(config)
      .overrideProvider(PrismaService).useValue({})
      .overrideProvider(WishlistRepository).useValue(repository)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => { rows.clear(); enabled = true; jest.clearAllMocks(); });

  it('creates, returns existing and removes idempotently', async () => {
    const auth = `Bearer ${token()}`;
    await request(app.getHttpServer()).post(path).set('Authorization', auth).send({ productId: 'PRD-1' })
      .expect(201).expect({ productId: 'PRD-1' });
    await request(app.getHttpServer()).post(path).set('Authorization', auth).send({ productId: 'PRD-1' }).expect(200);
    expect(rows.size).toBe(1);
    for (let i = 0; i < 2; i++) {
      const response = await request(app.getHttpServer()).delete(`${path}/PRD-1`).set('Authorization', auth).expect(204);
      expect(response.text).toBe('');
    }
    expect(rows.size).toBe(0);
  });

  it('cannot delete another customer favorite', async () => {
    rows.add(`${SANDBOX_CUSTOMERS.A}:PRD-1`);
    await request(app.getHttpServer()).delete(`${path}/PRD-1`)
      .set('Authorization', `Bearer ${issueSandboxToken(SANDBOX_CUSTOMERS.B, secret)}`).expect(204);
    expect(rows.has(`${SANDBOX_CUSTOMERS.A}:PRD-1`)).toBe(true);
  });

  it.each([['PRD-INACTIVE', 404], ['PRD-MISSING', 404], ['PRD-UNAVAILABLE', 503]])(
    'rejects product %s without persisting', async (productId, status) => {
      const response = await request(app.getHttpServer()).post(path).auth(token(), { type: 'bearer' }).send({ productId }).expect(Number(status));
      expect(response.body.code).toBe(status === 503 ? 'CATALOG_UNAVAILABLE' : 'PRODUCT_NOT_AVAILABLE');
      expect(repository.save).not.toHaveBeenCalled();
    });

  it.each(['', ' ', ' PRD-1', 'PRD-1 ', 'x'.repeat(101), 'x\u0001', 123, null])('rejects invalid product %p', async (productId) => {
    await request(app.getHttpServer()).post(path).auth(token(), { type: 'bearer' }).send({ productId })
      .expect(400).expect(({ body }) => expect(body.code).toBe('INVALID_PRODUCT_ID'));
    expect(repository.save).not.toHaveBeenCalled();
  });

  it.each([{ productId: 'PRD-1', customerId: SANDBOX_CUSTOMERS.B }, { productId: 'PRD-1', extra: true }])(
    'rejects additional fields %p', async (body) => {
      await request(app.getHttpServer()).post(path).auth(token(), { type: 'bearer' }).send(body)
        .expect(400).expect(({ body }) => expect(body.code).toBe('INVALID_REQUEST'));
    });

  it('rejects malformed JSON without leaking parser input', async () => {
    await request(app.getHttpServer()).post(path).auth(token(), { type: 'bearer' })
      .set('Content-Type', 'application/json').send('{secret:')
      .expect(400).expect(({ body }) => {
        expect(body.code).toBe('INVALID_REQUEST'); expect(JSON.stringify(body)).not.toContain('secret');
      });
  });

  it('validates DELETE identifiers', async () => {
    await request(app.getHttpServer()).delete(`${path}/${'x'.repeat(101)}`).auth(token(), { type: 'bearer' })
      .expect(400).expect(({ body }) => expect(body.code).toBe('INVALID_PRODUCT_ID'));
  });

  it('DELETE does not consult eligibility', async () => {
    const eligibility = app.get(ProductEligibilityPort);
    const spy = jest.spyOn(eligibility, 'isActive');
    await request(app.getHttpServer()).delete(`${path}/PRD-UNAVAILABLE`).auth(token(), { type: 'bearer' }).expect(204);
    expect(spy).not.toHaveBeenCalled(); spy.mockRestore();
  });

  it.each(['missing', 'tampered', 'expired', 'issuer', 'audience', 'algorithm', 'subject', 'expiration', 'unsigned'])
    ('rejects %s token', async (kind) => {
      let badToken: string | undefined;
      const options = { subject: SANDBOX_CUSTOMERS.A, issuer: SANDBOX_ISSUER, audience: SANDBOX_AUDIENCE, expiresIn: 900 };
      if (kind === 'tampered') badToken = issueSandboxToken(SANDBOX_CUSTOMERS.A, `${secret}other`);
      if (kind === 'expired') badToken = sign({}, secret, { ...options, expiresIn: -1 });
      if (kind === 'issuer') badToken = sign({}, secret, { ...options, issuer: 'other' });
      if (kind === 'audience') badToken = sign({}, secret, { ...options, audience: 'other' });
      if (kind === 'algorithm') badToken = sign({}, secret, { ...options, algorithm: 'HS384' });
      if (kind === 'subject') badToken = sign({}, secret, { ...options, subject: 'invalid' });
      if (kind === 'expiration') badToken = sign({}, secret, { subject: options.subject, issuer: options.issuer, audience: options.audience });
      if (kind === 'unsigned') badToken = sign({}, '', { ...options, algorithm: 'none' });
      let operation = request(app.getHttpServer()).post(path);
      if (badToken) operation = operation.auth(badToken, { type: 'bearer' });
      await operation.send({ productId: 'PRD-1' }).expect(401);
      expect(repository.save).not.toHaveBeenCalled();
    });

  it('fails closed with sandbox disabled', async () => {
    enabled = false;
    await request(app.getHttpServer()).post(path).auth(token(), { type: 'bearer' }).send({ productId: 'PRD-1' }).expect(401);
  });

  it('does not turn a repository failure into success or leak secrets', async () => {
    repository.remove.mockRejectedValueOnce(new Error('postgresql://secret-host'));
    await request(app.getHttpServer()).delete(`${path}/PRD-1`).auth(token(), { type: 'bearer' })
      .expect(500).expect({ code: 'INTERNAL_ERROR', message: 'Error interno del servicio' });
  });

  it('permits the configured CORS preflight and no other origin', async () => {
    const allowed = await request(app.getHttpServer()).options(path).set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'Authorization,Content-Type').expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['access-control-allow-methods']).toContain('DELETE');
    expect(allowed.headers['access-control-allow-headers']).toContain('Authorization');
    const denied = await request(app.getHttpServer()).options(path).set('Origin', 'http://other.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
