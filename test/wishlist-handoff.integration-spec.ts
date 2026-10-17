import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { validateTestDatabase } from '../scripts/test-database';
import { configureApp } from '../src/http/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { CartService } from '../src/cart/cart.service';
import { WishlistCatalog } from '../src/catalog/wishlist-catalog';
import { issueSandboxToken, SANDBOX_CUSTOMERS } from '../src/identity/sandbox-token';

const database = validateTestDatabase({ TEST_DATABASE_URL: process.env.TEST_DATABASE_URL });
if (process.env.NODE_ENV !== 'test' || process.env.DATABASE_URL !== database) throw new Error('Use isolated integration runner');
process.env.H3_SANDBOX_ENABLED = 'true';
process.env.H3_JWT_SECRET = 'handoff-integration-only-fixture-secret-not-for-deploy';

describe('Wishlist read and add-to-cart PostgreSQL integration (sandbox providers)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const A = SANDBOX_CUSTOMERS.A;
  const B = SANDBOX_CUSTOMERS.B;
  const token = (customer: string = A) => issueSandboxToken(customer, process.env.H3_JWT_SECRET!);
  const base = '/api/v1/wishlist';
  const add = (product = 'PRD-1', customer: string = A) => request(app.getHttpServer())
    .post(`${base}/items/${product}/add-to-cart`).auth(token(customer), { type: 'bearer' });
  const seed = (productId = 'PRD-1', customerId: string = A, createdAt = new Date()) =>
    prisma.wishlistItem.create({ data: { productId, customerId, createdAt } });
  async function start() {
    const { AppModule } = await import('../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); configureApp(app); await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
  }
  async function clean() {
    const owners = { in: [A, B] };
    await prisma.wishlistItem.deleteMany({ where: { customerId: owners } });
    await prisma.cartItem.deleteMany({ where: { cart: { customerId: owners } } });
    await prisma.cart.deleteMany({ where: { customerId: owners } });
  }
  beforeAll(start);
  beforeEach(clean);
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => { if (prisma) await clean(); await app?.close(); });

  it('lists only the owner in descending order, distinguishes retired and out of stock', async () => {
    await seed('PRD-RETIRED', A, new Date('2026-01-01'));
    await seed('PRD-OUT-OF-STOCK', A, new Date('2026-01-02'));
    await seed('PRD-1', B);
    const response = await request(app.getHttpServer()).get(base).auth(token(), { type: 'bearer' }).expect(200);
    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.body.map((item: { availability: string }) => item.availability)).toEqual(['OUT_OF_STOCK', 'UNAVAILABLE']);
    expect(response.body[1]).toMatchObject({ productId: 'PRD-RETIRED', name: null, slug: null, image: null, price: null });
    expect(JSON.stringify(response.body)).not.toContain('customerId');
  });

  it('returns confirmed empty without catalog access; fails closed on catalog outage or malformed projection', async () => {
    const catalog = app.get(WishlistCatalog);
    const spy = jest.spyOn(catalog, 'project');
    await request(app.getHttpServer()).get(base).auth(token(), { type: 'bearer' }).expect(200, []);
    expect(spy).not.toHaveBeenCalled();
    await seed('PRD-UNAVAILABLE');
    await request(app.getHttpServer()).get(base).auth(token(), { type: 'bearer' }).expect(503)
      .expect(({ body }) => expect(body.code).toBe('CATALOG_UNAVAILABLE'));
    spy.mockResolvedValue({ name: null, slug: null, brand: null, image: null, price: null, availability: 'AVAILABLE' });
    await request(app.getHttpServer()).get(base).auth(token(), { type: 'bearer' }).expect(503);
  });

  it('adds one unit, preserves the favorite and its date, and persists after restart', async () => {
    const favorite = await seed();
    const first = await add().expect(200);
    expect(first.body.cart.items[0]).toMatchObject({ sku: 'SKU-SIMPLE', quantity: 1 });
    expect((await prisma.wishlistItem.findUniqueOrThrow({ where: { id: favorite.id } })).createdAt).toEqual(favorite.createdAt);
    await app.close(); await start();
    expect((await prisma.cartItem.findFirstOrThrow({ where: { cart: { customerId: A } } })).quantity).toBe(1);
    expect(await prisma.wishlistItem.findUnique({ where: { id: favorite.id } })).not.toBeNull();
  });

  it('keeps carts and favorites isolated between owners', async () => {
    await seed(); await seed('PRD-1', B);
    await add().expect(200); await add('PRD-1', B).expect(200);
    expect(await prisma.cart.count({ where: { customerId: { in: [A, B] } } })).toBe(2);
    expect(await prisma.wishlistItem.count({ where: { customerId: { in: [A, B] } } })).toBe(2);
  });

  it('treats two explicit requests as two additions without losing increments', async () => {
    await seed();
    const results = await Promise.all([add(), add()]);
    expect(results.map((item) => item.status)).toEqual([200, 200]);
    expect((await prisma.cartItem.findFirstOrThrow({ where: { cart: { customerId: A } } })).quantity).toBe(2);
    expect(await prisma.wishlistItem.count({ where: { customerId: A } })).toBe(1);
  });

  it('shares the owner lock with ordinary cart additions', async () => {
    await seed();
    const results = await Promise.all([add(), request(app.getHttpServer()).post('/api/v1/carts/current/items')
      .auth(token(), { type: 'bearer' }).send({ sku: 'SKU-SIMPLE', quantity: 1 })]);
    expect(results.map((item) => item.status)).toEqual([200, expect.any(Number)]);
    expect([200, 201]).toContain(results[1].status);
    expect((await prisma.cartItem.findFirstOrThrow({ where: { cart: { customerId: A } } })).quantity).toBe(2);
  });

  it.each([['PRD-RETIRED', 404, 'PRODUCT_NOT_AVAILABLE'], ['PRD-VARIANT', 422, 'VARIANT_SELECTION_REQUIRED'],
    ['PRD-OUT-OF-STOCK', 409, 'STOCK_LIMIT_REACHED'], ['PRD-COMMERCE-UNAVAILABLE', 503, 'COMMERCE_DATA_UNAVAILABLE'],
    ['PRD-UNAVAILABLE', 503, 'CATALOG_UNAVAILABLE']])('rejects %s without partial writes', async (product, status, code) => {
    await seed(String(product));
    const response = await add(String(product)).expect(Number(status));
    expect(response.body.code).toBe(code);
    if (status === 422) expect(response.body.redirectUrl).toBe('/productos/producto-con-variantes');
    expect(await prisma.wishlistItem.count({ where: { customerId: A } })).toBe(1);
    expect(await prisma.cart.count({ where: { customerId: A } })).toBe(0);
  });

  it('rolls back a cart write when a later step fails', async () => {
    await seed(); const cart = app.get(CartService);
    const original = cart.addItemInTransaction.bind(cart);
    jest.spyOn(cart, 'addItemInTransaction').mockImplementationOnce(async (...args) => {
      await original(...args); throw new Error('injected-after-cart-write');
    });
    await add().expect(500).expect(({ body }) => expect(body.code).toBe('INTERNAL_ERROR'));
    expect(await prisma.wishlistItem.count({ where: { customerId: A } })).toBe(1);
    expect(await prisma.cart.count({ where: { customerId: A } })).toBe(0);
  });

  it('rejects absent or foreign favorites, bad credentials, keys and bodies without writes', async () => {
    await seed('PRD-1', B);
    await add().expect(409);
    await add().set('Idempotency-Key', 'unsupported').expect(400);
    await add().send({}).expect(400);
    await request(app.getHttpServer()).post(`${base}/items/PRD-1/add-to-cart`).expect(401);
    await request(app.getHttpServer()).get(base).auth(token(), { type: 'bearer' }).query({ customerId: B }).expect(400);
    expect(await prisma.cart.count({ where: { customerId: { in: [A, B] } } })).toBe(0);
  });

  it('does not expose the old movement route or a wishlist_moves table', async () => {
    await request(app.getHttpServer()).post(`${base}/items/PRD-1/move-to-cart`).auth(token(), { type: 'bearer' }).expect(404);
    const tables = await prisma.$queryRaw<Array<{ name: string | null }>>`SELECT to_regclass('public.wishlist_moves')::text AS name`;
    expect(tables[0].name).toBeNull();
  });

  it('validates commercial stock against the total quantity and preserves an existing cart on rejection', async () => {
    await seed();
    await app.get(CartService).addItemToCart({ customerId: A, sku: 'SKU-SIMPLE', quantity: 10 });
    const before = await app.get(CartService).getCurrentCart({ customerId: A });
    await add().expect(409).expect(({ body }) => expect(body.code).toBe('STOCK_LIMIT_REACHED'));
    expect(await app.get(CartService).getCurrentCart({ customerId: A })).toEqual(before);
    expect(await prisma.wishlistItem.count({ where: { customerId: A } })).toBe(1);
  });

  it('restores an active favorite through POST and rejects restoration of a retired product', async () => {
    await seed();
    await request(app.getHttpServer()).delete(`${base}/items/PRD-1`).auth(token(), { type: 'bearer' }).expect(204);
    await request(app.getHttpServer()).post(`${base}/items`).auth(token(), { type: 'bearer' }).send({ productId: 'PRD-1' }).expect(201);
    await request(app.getHttpServer()).post(`${base}/items`).auth(token(), { type: 'bearer' }).send({ productId: 'PRD-RETIRED' }).expect(404);
  });
});
