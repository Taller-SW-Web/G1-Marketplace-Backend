import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CheckoutController } from '../src/checkout/checkout.controller';
import { CheckoutService } from '../src/checkout/checkout.service';
import { NotFoundFilter } from '../src/http/not-found.filter';
import { AuthGuard } from '../src/security/auth.guard';
import { validationExceptionFactory } from '../src/http/validation-exception.factory';

describe('CheckoutController (e2e)', () => {
  let app: INestApplication;
  const checkout = {
    listAddresses: jest.fn(),
    createAddress: jest.fn(),
    createQuote: jest.fn(),
    applyBenefit: jest.fn(),
    getOperation: jest.fn(),
    createOrder: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CheckoutController],
      providers: [{ provide: CheckoutService, useValue: checkout }],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: { switchToHttp: () => { getRequest: () => { user?: unknown } } }) => {
          context.switchToHttp().getRequest().user = {
            sub: '11111111-1111-4111-8111-111111111111',
          };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      exceptionFactory: validationExceptionFactory,
    }));
    app.useGlobalFilters(new NotFoundFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });
  beforeEach(() => jest.clearAllMocks());

  it('lists the authenticated owner addresses using the incoming Bearer token', async () => {
    checkout.listAddresses.mockResolvedValue([{ addressId: 'ADR-1', street: 'Av. Lima 123' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/checkout/delivery-addresses')
      .set('Authorization', 'Bearer e2e-token')
      .expect(200);

    expect(response.body).toEqual({ data: [{ addressId: 'ADR-1', street: 'Av. Lima 123' }] });
    expect(checkout.listAddresses).toHaveBeenCalledWith('e2e-token');
  });

  it('creates an address for the principal and rejects client-supplied ownership fields', async () => {
    const addressInput = {
      street: 'Av. Lima 123',
      district: 'Miraflores',
      province: 'Lima',
      department: 'Lima',
      phone: '999999999',
    };
    checkout.createAddress.mockResolvedValue({ addressId: 'ADR-NEW', ...addressInput });

    const response = await request(app.getHttpServer())
      .post('/api/v1/checkout/delivery-addresses')
      .set('Authorization', 'Bearer e2e-token')
      .send(addressInput)
      .expect(201);

    expect(response.body.data.addressId).toBe('ADR-NEW');
    expect(checkout.createAddress).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'e2e-token',
      addressInput,
    );

    await request(app.getHttpServer())
      .post('/api/v1/checkout/delivery-addresses')
      .set('Authorization', 'Bearer e2e-token')
      .send({ ...addressInput, userId: 'attacker-controlled-user' })
      .expect(400);
    expect(checkout.createAddress).toHaveBeenCalledTimes(1);
  });

  it('quotes only using the authenticated subject, address/cart version and cart session', async () => {
    const quoteInput = { addressId: 'ADR-1', cartVersion: 7 };
    checkout.createQuote.mockResolvedValue({ quoteId: 'Q-1', addressId: 'ADR-1', cartVersion: 7 });

    const response = await request(app.getHttpServer())
      .post('/api/v1/checkout/quotes')
      .set('Authorization', 'Bearer e2e-token')
      .set('Cookie', 'cart_session=checkout-session-hash-123456')
      .send(quoteInput)
      .expect(200);

    expect(response.body.data).toEqual({ quoteId: 'Q-1', addressId: 'ADR-1', cartVersion: 7 });
    expect(checkout.createQuote).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'e2e-token',
      quoteInput,
      'checkout-session-hash-123456',
    );
  });

  it('applies a benefit to the authenticated quote without accepting client totals', async () => {
    const benefitInput = { quoteId: 'Q-1', couponCode: 'SAVE20' };
    checkout.applyBenefit.mockResolvedValue({ quoteId: 'Q-2', total: { amount: 335, currency: 'PEN' } });

    const response = await request(app.getHttpServer())
      .post('/api/v1/checkout/benefits')
      .set('Authorization', 'Bearer e2e-token')
      .send(benefitInput)
      .expect(200);

    expect(response.body.data.quoteId).toBe('Q-2');
    expect(checkout.applyBenefit).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      benefitInput,
    );

    await request(app.getHttpServer())
      .post('/api/v1/checkout/benefits')
      .set('Authorization', 'Bearer e2e-token')
      .send({ ...benefitInput, total: 1 })
      .expect(400);
    expect(checkout.applyBenefit).toHaveBeenCalledTimes(1);
  });

  it('keeps the F-026 POST response flat and forwards its idempotency key', async () => {
    checkout.createOrder.mockResolvedValue({
      status: 202,
      data: {
        checkoutOperationId: '44444444-4444-4444-8444-444444444444',
        state: 'SUBMITTED',
        orderId: 'PED-2026-00002',
        orderState: 'CREADO',
        total: { amount: 355, currency: 'PEN' },
      },
    });
    const input = {
      checkoutOperationId: '44444444-4444-4444-8444-444444444444',
      contact: {
        fullName: 'Ana Perez',
        documentType: 'DNI',
        documentNumber: '12345678',
        phone: '999999999',
        email: 'ana@example.test',
      },
    };
    const orderKey = '66666666-6666-4666-8666-666666666666';

    const response = await request(app.getHttpServer())
      .post('/api/v1/checkout/orders')
      .set('Authorization', 'Bearer e2e-token')
      .set('Cookie', 'cart_session=checkout-session-hash-123456')
      .set('Idempotency-Key', orderKey)
      .send(input)
      .expect(202);

    expect(response.body.data).toMatchObject({
      state: 'SUBMITTED',
      orderId: 'PED-2026-00002',
      orderState: 'CREADO',
      total: { amount: 355, currency: 'PEN' },
    });
    expect(response.body.data).not.toHaveProperty('order');
    expect(checkout.createOrder).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      input,
      orderKey,
      'checkout-session-hash-123456',
    );
  });

  it('publishes the nested F-027 order and preserves the service HTTP status', async () => {
    checkout.getOperation.mockResolvedValue({
      status: 202,
      data: {
        state: 'SUBMITTED',
        order: {
          orderId: 'PED-2026-00001',
          state: 'CREADO',
          total: { amount: 355, currency: 'PEN' },
          createdAt: '2026-10-16T10:00:00.000Z',
        },
      },
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/checkout/operations/44444444-4444-4444-8444-444444444444')
      .set('Authorization', 'Bearer e2e-token')
      .expect(202);

    expect(response.body).toEqual({
      data: {
        state: 'SUBMITTED',
        order: {
          orderId: 'PED-2026-00001',
          state: 'CREADO',
          total: { amount: 355, currency: 'PEN' },
          createdAt: '2026-10-16T10:00:00.000Z',
        },
      },
    });
  });

  it('uses the documented error envelope for a malformed operation UUID', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/checkout/operations/not-a-uuid')
      .set('Authorization', 'Bearer e2e-token')
      .expect(400);

    expect(response.body).toEqual({ error: { code: 'INVALID_OPERATION_ID' } });
    expect(checkout.getOperation).not.toHaveBeenCalled();
  });
});
