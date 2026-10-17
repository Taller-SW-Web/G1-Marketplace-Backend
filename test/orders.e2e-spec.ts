import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { OrdersModule } from '../src/orders/orders.module';

async function createApp(env: Record<string, string>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        load: [() => env],
      }),
      OrdersModule,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  return app;
}

describe('F-028 GET /api/v1/orders/me (e2e, MOCK)', () => {
  describe('with ORDERS_SOURCE=mock', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp({
        NODE_ENV: 'development',
        ORDERS_SOURCE: 'mock',
        ORDERS_MOCK_CUSTOMER_ID: 'customer-demo-001',
      });
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns the customer orders newest first, marked as MOCK and not cacheable', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/orders/me')
        .expect(200);

      expect(response.headers['x-orders-source']).toBe('MOCK');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.data.map((o: { orderId: string }) => o.orderId)).toEqual([
        'PED-MOCK-001',
        'PED-MOCK-002',
      ]);
      expect(response.body.data[0]).toEqual({
        orderId: 'PED-MOCK-001',
        state: 'PAGADO',
        total: { amount: 355, currency: 'PEN' },
        createdAt: '2026-09-27T18:30:00.000Z',
      });
      expect(response.body.page).toEqual({
        number: 0,
        size: 10,
        totalElements: 2,
        totalPages: 1,
      });
    });

    it('does not leak ownership data nor orders of another customer', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/orders/me')
        .expect(200);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('ownerCustomerId');
      expect(serialized).not.toContain('customer-demo');
      expect(serialized).not.toContain('PED-MOCK-003');
    });

    it('paginates with page and pageSize', async () => {
      const first = await request(app.getHttpServer())
        .get('/api/v1/orders/me?page=0&pageSize=1')
        .expect(200);
      const second = await request(app.getHttpServer())
        .get('/api/v1/orders/me?page=1&pageSize=1')
        .expect(200);
      const beyond = await request(app.getHttpServer())
        .get('/api/v1/orders/me?page=2&pageSize=1')
        .expect(200);

      expect(first.body.data.map((o: { orderId: string }) => o.orderId)).toEqual(['PED-MOCK-001']);
      expect(first.body.page).toEqual({ number: 0, size: 1, totalElements: 2, totalPages: 2 });
      expect(second.body.data.map((o: { orderId: string }) => o.orderId)).toEqual(['PED-MOCK-002']);
      expect(beyond.body.data).toEqual([]);
      expect(beyond.body.page.totalPages).toBe(2);
    });

    it.each([
      ['negative page', 'page=-1'],
      ['non numeric page', 'page=abc'],
      ['decimal page', 'page=1.5'],
      ['zero pageSize', 'pageSize=0'],
      ['pageSize above the limit', 'pageSize=51'],
    ])('rejects invalid parameters: %s', async (_name, query) => {
      await request(app.getHttpServer()).get(`/api/v1/orders/me?${query}`).expect(400);
    });

    it.each(['clienteId=customer-demo-002', 'customerId=customer-demo-002'])(
      'rejects a client-supplied customer identity: %s',
      async (query) => {
        await request(app.getHttpServer()).get(`/api/v1/orders/me?${query}`).expect(400);
      },
    );

    it('does not take the customer from the x-customer-id header', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/orders/me')
        .set('x-customer-id', 'customer-demo-002')
        .expect(200);

      expect(response.body.data.map((o: { orderId: string }) => o.orderId)).toEqual([
        'PED-MOCK-001',
        'PED-MOCK-002',
      ]);
    });
  });

  describe('empty history', () => {
    it('returns an empty list for a customer without orders', async () => {
      const app = await createApp({
        NODE_ENV: 'development',
        ORDERS_SOURCE: 'mock',
        ORDERS_MOCK_CUSTOMER_ID: 'customer-demo-empty',
      });

      try {
        const response = await request(app.getHttpServer())
          .get('/api/v1/orders/me')
          .expect(200);
        expect(response.body).toEqual({
          data: [],
          page: { number: 0, size: 10, totalElements: 0, totalPages: 0 },
        });
        expect(response.headers['x-orders-source']).toBe('MOCK');
      } finally {
        await app.close();
      }
    });
  });

  describe('error and environment scope', () => {
    it('answers 503 when no source is configured', async () => {
      const app = await createApp({ NODE_ENV: 'development' });
      try {
        const response = await request(app.getHttpServer())
          .get('/api/v1/orders/me')
          .expect(503);
        expect(response.headers['x-orders-source']).toBe('UNCONFIGURED');
        expect(response.body).toEqual({ error: { code: 'ORDERS_INTEGRATION_UNAVAILABLE' } });
      } finally {
        await app.close();
      }
    });

    it('never serves the fixture in production even if ORDERS_SOURCE=mock', async () => {
      const app = await createApp({
        NODE_ENV: 'production',
        ORDERS_SOURCE: 'mock',
        ORDERS_MOCK_CUSTOMER_ID: 'customer-demo-001',
      });
      try {
        const response = await request(app.getHttpServer())
          .get('/api/v1/orders/me')
          .expect(503);
        expect(response.headers['x-orders-source']).toBe('UNCONFIGURED');
        expect(JSON.stringify(response.body)).not.toContain('PED-MOCK');
      } finally {
        await app.close();
      }
    });

    it('answers 503 when the mock customer is not a known synthetic principal', async () => {
      const app = await createApp({
        NODE_ENV: 'development',
        ORDERS_SOURCE: 'mock',
        ORDERS_MOCK_CUSTOMER_ID: 'real-customer-id',
      });
      try {
        const response = await request(app.getHttpServer())
          .get('/api/v1/orders/me')
          .expect(503);
        expect(response.body).toEqual({ error: { code: 'MOCK_CUSTOMER_NOT_CONFIGURED' } });
      } finally {
        await app.close();
      }
    });
  });
});
