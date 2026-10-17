import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthGuard } from '../src/security/auth.guard';
import { OptionalAuthGuard } from '../src/security/optional-auth.guard';

describe('Integración Carrito ↔ Checkout (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const mockCustomer = '11111111-1111-4111-8111-111111111111';
  const mockToken =
    'eyJhbGciOiJub25lIn0.' +
    Buffer.from(JSON.stringify({ sub: mockCustomer })).toString('base64url') +
    '.sig';
  const mockAddressId = 'ADR-MOCK-0001';

  beforeAll(async () => {
    process.env.USE_MOCKS = 'true';

    const authMock = {
      canActivate: (context: {
        switchToHttp: () => { getRequest: () => { user?: { sub: string } } };
      }) => {
        context.switchToHttp().getRequest().user = { sub: mockCustomer };
        return true;
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(AuthGuard)
      .useValue(authMock)
      .overrideGuard(OptionalAuthGuard)
      .useValue(authMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.checkoutOperation.deleteMany({
        where: { customerId: mockCustomer },
      });
      await prisma.cartItem.deleteMany({
        where: { cart: { customerId: mockCustomer } },
      });
      await prisma.cart.deleteMany({
        where: { customerId: mockCustomer },
      });
    }
    if (app) await app.close();
  });

  beforeEach(async () => {
    // Limpiar carritos previos del usuario mock para aislamiento de pruebas
    await prisma.checkoutOperation.deleteMany({
      where: { customerId: mockCustomer },
    });
    await prisma.cartItem.deleteMany({
      where: { cart: { customerId: mockCustomer } },
    });
    await prisma.cart.deleteMany({
      where: { customerId: mockCustomer },
    });
  });

  it('1. Checkout rechaza cotizar si el usuario aún no tiene carrito activo (409 CART_NOT_FOUND)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/checkout/quotes')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ addressId: mockAddressId, cartVersion: 1 })
      .expect(409);

    expect(res.body.error?.code).toBe('CART_NOT_FOUND');
  });

  it('2. El usuario agrega un ítem en Carrito y Checkout cotiza exitosamente el snapshot con cartVersion', async () => {
    // Paso A: Carrito crea la línea e incrementa versión
    const addRes = await request(app.getHttpServer())
      .post('/api/v1/carts/current/items')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ sku: 'INKA-RUNNER-42', quantity: 1 })
      .expect(201);

    expect(addRes.body.status).toBe('ITEM_CREATED');
    const currentVersion = addRes.body.data.version;
    expect(currentVersion).toBeGreaterThanOrEqual(1);

    // Paso B: Carrito confirma snapshot activo
    const cartRes = await request(app.getHttpServer())
      .get('/api/v1/carts/current')
      .set('Authorization', `Bearer ${mockToken}`)
      .expect(200);

    expect(cartRes.body.data.version).toBe(currentVersion);
    expect(cartRes.body.data.items).toHaveLength(1);

    // Paso C: Checkout lee ese mismo carrito en PostgreSQL y cotiza
    const quoteRes = await request(app.getHttpServer())
      .post('/api/v1/checkout/quotes')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ addressId: mockAddressId, cartVersion: currentVersion })
      .expect(200);

    expect(quoteRes.body.data).toBeDefined();
    expect(quoteRes.body.data.cartVersion).toBe(currentVersion);
    expect(quoteRes.body.data.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sku: 'INKA-RUNNER-42', quantity: 1 }),
      ]),
    );
  });

  it('3. Checkout detecta modificaciones concurrentes en el Carrito y previene cotizaciones obsoletas (409 CART_CHANGED)', async () => {
    // Paso A: Crear carrito inicial con primer ítem
    const firstAddRes = await request(app.getHttpServer())
      .post('/api/v1/carts/current/items')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ sku: 'INKA-RUNNER-42', quantity: 1 })
      .expect(201);

    const initialVersion = firstAddRes.body.data.version;

    // Paso B: El usuario modifica el carrito en otra pestaña/acción (versión se incrementa)
    const updateRes = await request(app.getHttpServer())
      .post('/api/v1/carts/current/items')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ sku: 'INKA-SHIRT-L', quantity: 1 })
      .expect(201);

    const updatedVersion = updateRes.body.data.version;
    expect(updatedVersion).toBeGreaterThan(initialVersion);

    // Paso C: Checkout intenta cotizar con la versión antigua -> 409 CART_CHANGED
    const conflictRes = await request(app.getHttpServer())
      .post('/api/v1/checkout/quotes')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ addressId: mockAddressId, cartVersion: initialVersion })
      .expect(409);

    expect(conflictRes.body.error?.code).toBe('CART_CHANGED');

    // Paso D: Checkout reintenta con la versión actualizada y procede con éxito
    const successRes = await request(app.getHttpServer())
      .post('/api/v1/checkout/quotes')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ addressId: mockAddressId, cartVersion: updatedVersion })
      .expect(200);

    expect(successRes.body.data.cartVersion).toBe(updatedVersion);
    expect(successRes.body.data.lines).toHaveLength(2);
  });

  it('4. Flujo de punta a punta: Carrito -> Cotización -> Preparación de Checkout -> Creación de Orden confirmada', async () => {
    // 1. Agregar producto al carrito
    const addRes = await request(app.getHttpServer())
      .post('/api/v1/carts/current/items')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ sku: 'INKA-RUNNER-42', quantity: 2 })
      .expect(201);

    const cartVersion = addRes.body.data.version;

    // 2. Cotizar snapshot de Checkout
    const quoteRes = await request(app.getHttpServer())
      .post('/api/v1/checkout/quotes')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ addressId: mockAddressId, cartVersion })
      .expect(200);

    const quoteId = quoteRes.body.data.quoteId;
    expect(quoteId).toBeDefined();

    // 3. Preparar operación de checkout
    const prepRes = await request(app.getHttpServer())
      .post('/api/v1/checkout/preparations')
      .set('Authorization', `Bearer ${mockToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        quoteId,
        cartVersion,
        simulationConfirmed: true,
      })
      .expect(201);

    const operationId = prepRes.body.data.checkoutOperationId;
    expect(operationId).toBeDefined();

    // 4. Confirmar y crear orden
    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/checkout/orders')
      .set('Authorization', `Bearer ${mockToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        checkoutOperationId: operationId,
        contact: {
          fullName: 'Leonidas Garcia',
          documentType: 'DNI',
          documentNumber: '12345678',
          phone: '999999999',
          email: 'leonidas@example.com',
        },
      });

    expect([200, 202]).toContain(orderRes.status);
    expect(orderRes.body.data.orderId).toBeDefined();
    expect(orderRes.body.data.checkoutOperationId).toBe(operationId);

    // 5. Consultar operación resuelta con Mock Outcome
    const opRes = await request(app.getHttpServer())
      .get(`/api/v1/checkout/operations/${operationId}`)
      .set('Authorization', `Bearer ${mockToken}`)
      .expect(200);

    const finalOrderId = opRes.body.data.order?.orderId ?? opRes.body.data.orderId;
    const finalOrderState = opRes.body.data.order?.state ?? opRes.body.data.orderState;
    expect(finalOrderId).toBeDefined();
    expect(['PAGADO', 'CREADO']).toContain(finalOrderState);
  });
});
