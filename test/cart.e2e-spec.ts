import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { CartController } from '../src/cart/cart.controller';
import { CartService } from '../src/cart/cart.service';
import { AuthGuard } from '../src/security/auth.guard';
import { OptionalAuthGuard } from '../src/security/optional-auth.guard';

describe('CartController (e2e)', () => {
  let app: INestApplication;
  const mockCartService = {
    addItemToCart: jest.fn(),
    getCurrentCart: jest.fn(),
  };

  const issuer = 'http://127.0.0.1:4010';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'test-key-cart';
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' };

  const makeValidToken = (sub: string, expSecondsFromNow = 300) => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString(
      'base64url',
    );
    const issuedAt = Math.floor(Date.now() / 1000);
    const claims = Buffer.from(
      JSON.stringify({
        iss: issuer,
        sub,
        tipo: 'acceso',
        iat: issuedAt,
        exp: issuedAt + expSecondsFromNow,
      }),
    ).toString('base64url');
    const signingInput = `${header}.${claims}`;
    const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
    return `${signingInput}.${signature}`;
  };

  beforeAll(async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/jwks')) {
        return {
          ok: true,
          json: async () => ({ keys: [jwk] }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    const mockConfigService = {
      get: (key: string, fallback?: unknown) => {
        const map: Record<string, unknown> = {
          AUTH_ISSUER: issuer,
          AUTH_JWKS_URL: 'http://127.0.0.1:4010/jwks',
          HTTP_TIMEOUT_MS: 3000,
        };
        return map[key] ?? fallback;
      },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [CartController],
      providers: [
        { provide: CartService, useValue: mockCartService },
        { provide: ConfigService, useValue: mockConfigService },
        AuthGuard,
        OptionalAuthGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/jwks')) {
        return {
          ok: true,
          json: async () => ({ keys: [jwk] }),
        } as Response;
      }
      return { ok: false } as Response;
    });
  });

  it('POST /api/v1/carts/current/items adds item and sets session cookie when unauthenticated', async () => {
    mockCartService.addItemToCart.mockResolvedValue({
      status: 201,
      code: 'ITEM_CREATED',
      data: {
        cartId: 'cart-123',
        version: 1,
        items: [{ sku: 'SKU-001', quantity: 1 }],
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/carts/current/items')
      .send({ sku: 'SKU-001', quantity: 1 })
      .expect(201);

    expect(res.body.status).toBe('ITEM_CREATED');
    expect(res.body.data.items[0].sku).toBe('SKU-001');
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toContain('cart_session=');
  });

  it('resolves a MOCK productId to its server-owned SKU before adding it', async () => {
    mockCartService.addItemToCart.mockResolvedValue({
      status: 201,
      code: 'ITEM_CREATED',
      data: { cartId: 'cart-123', version: 1, items: [{ sku: 'SKU-MOCK-001', quantity: 1 }] },
    });

    await request(app.getHttpServer())
      .post('/api/v1/carts/current/items')
      .send({ productId: 'PRD-MOCK-001', quantity: 1 })
      .expect(201);

    expect(mockCartService.addItemToCart).toHaveBeenCalledWith(expect.objectContaining({
      sku: 'SKU-MOCK-001',
      quantity: 1,
    }));
  });

  it('accepts the explicitly selected SKU for a variable catalog product', async () => {
    mockCartService.addItemToCart.mockResolvedValue({
      status: 201,
      code: 'ITEM_CREATED',
      data: { cartId: 'cart-123', version: 1, items: [{ sku: 'SKU-MOCK-VAR-1', quantity: 1 }] },
    });

    await request(app.getHttpServer())
      .post('/api/v1/carts/current/items')
      .send({ sku: 'SKU-MOCK-VAR-1', quantity: 1 })
      .expect(201);

    expect(mockCartService.addItemToCart).toHaveBeenCalledWith(expect.objectContaining({
      sku: 'SKU-MOCK-VAR-1',
      quantity: 1,
    }));
  });

  it('rejects a productId without a server-owned MOCK SKU mapping', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/carts/current/items')
      .send({ productId: 'unmapped-product', quantity: 1 })
      .expect(400);
  });

  it('POST /api/v1/carts/current/items increments existing item for anonymous session', async () => {
    mockCartService.addItemToCart.mockResolvedValue({
      status: 200,
      code: 'ITEM_INCREMENTED',
      data: {
        cartId: 'cart-123',
        version: 2,
        items: [{ sku: 'SKU-001', quantity: 2 }],
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/carts/current/items')
      .set('Cookie', ['cart_session=existing-session-uuid'])
      .send({ sku: 'SKU-001', quantity: 1 })
      .expect(200);

    expect(res.body.status).toBe('ITEM_INCREMENTED');
    expect(res.body.data.items[0].quantity).toBe(2);
  });

  it('GET /api/v1/carts/current returns current cart snapshot for anonymous session', async () => {
    mockCartService.getCurrentCart.mockResolvedValue({
      cartId: 'cart-123',
      version: 2,
      items: [{ sku: 'SKU-001', quantity: 2 }],
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/carts/current')
      .set('Cookie', ['cart_session=existing-session-uuid'])
      .expect(200);

    expect(res.body.status).toBe('OK');
    expect(res.body.data.cartId).toBe('cart-123');
    expect(res.body.data.items).toHaveLength(1);
  });

  it('Rejects request with missing SKU with 400 Bad Request', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/carts/current/items')
      .send({ quantity: 1 })
      .expect(400);
  });

  it('Rejects raw UUID without RS256 JWT signature with 401 UNAUTHENTICATED', async () => {
    const rawUuid = '11111111-1111-4111-8111-111111111111';
    const res = await request(app.getHttpServer())
      .get('/api/v1/carts/current')
      .set('Authorization', `Bearer ${rawUuid}`)
      .expect(401);

    expect(res.body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('Rejects forged/tampered JWT signature with 401 UNAUTHENTICATED', async () => {
    const validToken = makeValidToken('11111111-1111-4111-8111-111111111111');
    const tampered = validToken.slice(0, -6) + 'xxxxxx';

    const res = await request(app.getHttpServer())
      .get('/api/v1/carts/current')
      .set('Authorization', `Bearer ${tampered}`)
      .expect(401);

    expect(res.body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('Rejects expired token with 401 UNAUTHENTICATED', async () => {
    const expiredToken = makeValidToken('11111111-1111-4111-8111-111111111111', -10);

    const res = await request(app.getHttpServer())
      .get('/api/v1/carts/current')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

    expect(res.body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('POST /api/v1/carts/current/items with valid RS256 Bearer token associates cart to mock customerId from sub', async () => {
    const mockPrincipal = '11111111-1111-4111-8111-111111111111';
    const validToken = makeValidToken(mockPrincipal);

    mockCartService.addItemToCart.mockResolvedValue({
      status: 201,
      code: 'ITEM_CREATED',
      data: {
        cartId: 'cart-mock-user',
        version: 1,
        items: [{ sku: 'INKA-RUNNER-42', quantity: 1 }],
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/carts/current/items')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ sku: 'INKA-RUNNER-42', quantity: 1 })
      .expect(201);

    expect(mockCartService.addItemToCart).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: mockPrincipal,
        sku: 'INKA-RUNNER-42',
      }),
    );
    expect(res.body.status).toBe('ITEM_CREATED');
  });

  it('GET /api/v1/carts/current with valid RS256 Bearer token queries cart for sub principal and returns version', async () => {
    const mockPrincipal = '11111111-1111-4111-8111-111111111111';
    const validToken = makeValidToken(mockPrincipal);

    mockCartService.getCurrentCart.mockResolvedValue({
      cartId: 'cart-mock-user',
      version: 1,
      items: [{ sku: 'INKA-RUNNER-42', quantity: 1 }],
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/carts/current')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(mockCartService.getCurrentCart).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: mockPrincipal,
      }),
    );
    expect(res.body.data.cartId).toBe('cart-mock-user');
    expect(res.body.data.version).toBe(1);
  });
});
