import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CartController } from '../src/cart/cart.controller';
import { CartService } from '../src/cart/cart.service';

describe('CartController (e2e)', () => {
  let app: INestApplication;
  const mockCartService = {
    addItemToCart: jest.fn(),
    getCurrentCart: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CartController],
      providers: [{ provide: CartService, useValue: mockCartService }],
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
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('POST /api/v1/carts/current/items adds item and sets session cookie', async () => {
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

  it('POST /api/v1/carts/current/items increments existing item', async () => {
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

  it('GET /api/v1/carts/current returns current cart snapshot', async () => {
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

  it('POST /api/v1/carts/current/items with Bearer token associates cart to mock customerId', async () => {
    const mockPrincipal = '11111111-1111-4111-8111-111111111111';
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
      .set('Authorization', `Bearer ${mockPrincipal}`)
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

  it('GET /api/v1/carts/current with Bearer token queries cart for sub principal', async () => {
    const mockPrincipal = '11111111-1111-4111-8111-111111111111';
    mockCartService.getCurrentCart.mockResolvedValue({
      cartId: 'cart-mock-user',
      version: 1,
      items: [{ sku: 'INKA-RUNNER-42', quantity: 1 }],
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/carts/current')
      .set('Authorization', `Bearer ${mockPrincipal}`)
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
