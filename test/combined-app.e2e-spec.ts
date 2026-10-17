import { ConflictException, INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { generateKeyPairSync, sign } from 'node:crypto';
import request from 'supertest';
import { CartService } from '../src/cart/cart.service';
import { CheckoutService } from '../src/checkout/checkout.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { WishlistRepository } from '../src/wishlist/wishlist.repository';
import { configureApp } from '../src/http/configure-app';
import { issueSandboxToken, SANDBOX_CUSTOMERS } from '../src/identity/sandbox-token';

describe('Combined application HTTP contracts', () => {
  let app: INestApplication;
  const secret = 'combined-app-test-only-secret-at-least-32-bytes';
  const issuer = 'http://127.0.0.1:4010';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'combined-app';
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig' };
  const cart = { getCurrentCart: jest.fn(), addItemToCart: jest.fn() };
  const wishlist = { save: jest.fn(), remove: jest.fn() };
  const checkout = { createAddress: jest.fn(), getOperation: jest.fn() };
  const environment = {
    DATABASE_URL: 'postgresql://localhost/combined_app_mock', NODE_ENV: 'test',
    H3_SANDBOX_ENABLED: 'true', H3_JWT_SECRET: secret,
    CORS_ORIGINS: 'http://localhost:3000', CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
    AUTH_ISSUER: issuer, AUTH_JWKS_URL: `${issuer}/jwks`,
    ORDERS_SOURCE: 'mock', ORDERS_MOCK_CUSTOMER_ID: 'customer-demo-001',
  };
  const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  const validCartToken = () => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ iss: issuer, sub: SANDBOX_CUSTOMERS.A,
      tipo: 'acceso', exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
    const input = `${header}.${claims}`;
    return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
  };

  beforeAll(async () => {
    Object.assign(process.env, environment);
    const { AppModule } = await import('../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue({})
      .overrideProvider(CartService).useValue(cart)
      .overrideProvider(CheckoutService).useValue(checkout)
      .overrideProvider(WishlistRepository).useValue(wishlist).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    cart.getCurrentCart.mockResolvedValue({ cartId: null, version: 0, items: [] });
    wishlist.save.mockResolvedValue({ created: true });
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ keys: [jwk] }) } as Response);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  it('serves anonymous carts and keeps the session cookie', async () => {
    const result = await request(app.getHttpServer()).get('/api/v1/carts/current').expect(200);
    expect(result.body.status).toBe('OK');
    expect(result.headers['set-cookie'][0]).toContain('cart_session=');
  });
  it('preserves the cart authentication error contract', async () => {
    await request(app.getHttpServer()).get('/api/v1/carts/current').auth('invalid', { type: 'bearer' })
      .expect(401).expect({ error: { code: 'UNAUTHENTICATED' } });
    expect(cart.getCurrentCart).not.toHaveBeenCalled();
  });
  it('preserves JWKS unavailability as 503', async () => {
    jest.mocked(global.fetch).mockRejectedValueOnce(new Error('offline'));
    await request(app.getHttpServer()).get('/api/v1/carts/current').auth(validCartToken(), { type: 'bearer' })
      .expect(503).expect({ error: { code: 'AUTH_KEYS_UNAVAILABLE' } });
  });
  it('authenticates the cart with RS256', async () => {
    await request(app.getHttpServer()).get('/api/v1/carts/current').auth(validCartToken(), { type: 'bearer' }).expect(200);
    expect(cart.getCurrentCart).toHaveBeenCalledWith(expect.objectContaining({ customerId: SANDBOX_CUSTOMERS.A }));
  });
  it('keeps standard cart DTO validation and domain errors', async () => {
    const invalid = await request(app.getHttpServer()).post('/api/v1/carts/current/items')
      .send({ sku: 'SKU-1', quantity: 0 }).expect(400);
    expect(invalid.body.message).toEqual(expect.any(Array));
    expect(cart.addItemToCart).not.toHaveBeenCalled();
    cart.addItemToCart.mockRejectedValueOnce(new ConflictException({ code: 'STOCK_LIMIT_REACHED' }));
    await request(app.getHttpServer()).post('/api/v1/carts/current/items')
      .send({ sku: 'SKU-1', quantity: 1 }).expect(409).expect({ code: 'STOCK_LIMIT_REACHED' });
  });
  it('keeps wishlist sandbox authentication and validation', async () => {
    const path = '/api/v1/wishlist/items';
    const token = issueSandboxToken(SANDBOX_CUSTOMERS.A, secret);
    await request(app.getHttpServer()).post(path).auth(token, { type: 'bearer' }).send({ productId: 'PRD-1' })
      .expect(201).expect({ productId: 'PRD-1' });
    await request(app.getHttpServer()).post(path).auth(token, { type: 'bearer' }).send({ productId: ' ' })
      .expect(400).expect(({ body }) => expect(body.code).toBe('INVALID_PRODUCT_ID'));
    await request(app.getHttpServer()).post(path).auth(token, { type: 'bearer' })
      .send({ productId: 'PRD-1', customerId: SANDBOX_CUSTOMERS.B })
      .expect(400).expect(({ body }) => expect(body.code).toBe('INVALID_REQUEST'));
    await request(app.getHttpServer()).post(path).send({ productId: 'PRD-1' })
      .expect(401).expect(({ body }) => expect(body.code).toBe('UNAUTHORIZED'));
  });
  it('allows explicit origins and credentials for cart and wishlist preflights', async () => {
    for (const path of ['/api/v1/carts/current/items', '/api/v1/wishlist/items']) {
      const result = await request(app.getHttpServer()).options(path).set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'Authorization,Content-Type').expect(204);
      expect(result.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(result.headers['access-control-allow-credentials']).toBe('true');
      expect(result.headers['access-control-allow-methods']).toContain('PATCH');
      expect(result.headers['access-control-allow-headers']).toContain('Authorization');
      const denied = await request(app.getHttpServer()).options(path).set('Origin', 'http://other.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    }
  });
  it('preserves liveness and missing-route responses', async () => {
    await request(app.getHttpServer()).get('/live').expect(200).expect(({ body }) => expect(body).toMatchObject({ status: 'UP' }));
    await request(app.getHttpServer()).get('/missing-route').expect(404).expect({ error: 'Ruta no encontrada' });
  });
  it('uses the same validated sandbox principal for cart and wishlist', async () => {
    const token = issueSandboxToken(SANDBOX_CUSTOMERS.A, secret);
    await request(app.getHttpServer()).get('/api/v1/carts/current').auth(token, { type: 'bearer' }).expect(200);
    expect(cart.getCurrentCart).toHaveBeenCalledWith(expect.objectContaining({ customerId: SANDBOX_CUSTOMERS.A }));
    await request(app.getHttpServer()).post('/api/v1/wishlist/items').auth(token, { type: 'bearer' })
      .send({ productId: 'PRD-1' }).expect(201);
    expect(wishlist.save).toHaveBeenCalledWith(SANDBOX_CUSTOMERS.A, 'PRD-1');
  });
  it('uses validated RS256 subjects in wishlist', async () => {
    await request(app.getHttpServer()).post('/api/v1/wishlist/items').auth(validCartToken(), { type: 'bearer' })
      .send({ productId: 'PRD-1' }).expect(201);
    expect(wishlist.save).toHaveBeenCalledWith(SANDBOX_CUSTOMERS.A, 'PRD-1');
  });
  it('permits configured add-to-cart preflight and rejects anonymous reads', async () => {
    const response = await request(app.getHttpServer()).options('/api/v1/wishlist/items/PRD-1/add-to-cart')
      .set('Origin', 'http://localhost:3000').set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Authorization').expect(204);
    expect(response.headers['access-control-allow-headers']).toContain('Authorization');
    await request(app.getHttpServer()).get('/api/v1/wishlist').expect(401)
      .expect(({ body }) => expect(body.code).toBe('UNAUTHORIZED'));
  });
  it('preserves checkout validation without changing standard cart validation', async () => {
    await request(app.getHttpServer()).post('/api/v1/checkout/delivery-addresses')
      .auth(validCartToken(), { type: 'bearer' }).send({})
      .expect(400).expect(({ body }) => expect(body.error.code).toBe('ADDRESS_VALIDATION_ERROR'));
    expect(checkout.createAddress).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post('/api/v1/carts/current/items').send({ sku: 'SKU-1', quantity: 0 })
      .expect(400).expect(({ body }) => expect(body.message).toEqual(expect.any(Array)));
  });
  it('preserves structured checkout 404 errors through the shared application filter', async () => {
    checkout.getOperation.mockRejectedValueOnce(new NotFoundException({ error: { code: 'CHECKOUT_OPERATION_NOT_FOUND' } }));
    await request(app.getHttpServer()).get('/api/v1/checkout/operations/44444444-4444-4444-8444-444444444444')
      .auth(validCartToken(), { type: 'bearer' }).expect(404).expect({ error: { code: 'CHECKOUT_OPERATION_NOT_FOUND' } });
  });
  it('allows checkout idempotency headers and wishlist DELETE in the same CORS configuration', async () => {
    const response = await request(app.getHttpServer()).options('/api/v1/checkout/preparations')
      .set('Origin', 'http://localhost:3000').set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Authorization,Idempotency-Key').expect(204);
    expect(response.headers['access-control-allow-headers']).toContain('Idempotency-Key');
    expect(response.headers['access-control-allow-methods']).toContain('DELETE');
  });
  it('registers the orders history module alongside checkout, cart and wishlist', async () => {
    await request(app.getHttpServer()).get('/api/v1/orders/me').expect(200)
      .expect(({ body, headers }) => {
        expect(headers['x-orders-source']).toBe('MOCK');
        expect(body.data).toEqual(expect.any(Array));
        expect(body.data.length).toBeGreaterThan(0);
      });
  });
});
