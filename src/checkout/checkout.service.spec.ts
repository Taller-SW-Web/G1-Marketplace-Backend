import { NotFoundException } from '@nestjs/common';
import { CheckoutOperationState } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutService } from './checkout.service';
import { CheckoutContactDto } from './dto/contact.dto';
import { MarketplaceGateway } from './external/marketplace.gateway';
import { QuotesService } from './quotes.service';

describe('CheckoutService', () => {
  const customerId = '11111111-1111-4111-8111-111111111111';
  const operationId = '44444444-4444-4444-8444-444444444444';
  const quote = {
    quoteId: 'Q-1',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    subtotal: { amount: 340, currency: 'PEN' },
    discount: { amount: 0, currency: 'PEN' },
    shipping: { amount: 15, currency: 'PEN', estimatedDays: 2 },
    total: { amount: 355, currency: 'PEN' },
    lines: [{ sku: 'AERO-42-BLK', quantity: 2 }],
    addressId: 'ADR-1',
    cartVersion: 8,
  };
  const cart = {
    id: '55555555-5555-4555-8555-555555555555',
    version: 8,
    state: 'ACTIVE',
    items: [{ sku: 'AERO-42-BLK', quantity: 2 }],
  };

  let prisma: {
    cart: { findFirst: jest.Mock };
    checkoutOperation: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let gateway: jest.Mocked<Pick<
    MarketplaceGateway,
    | 'listAddresses'
    | 'createAddress'
    | 'createQuote'
    | 'applyBenefit'
    | 'revalidate'
    | 'createOrder'
    | 'getOrder'
  >>;
  let service: CheckoutService;
  let quotes: QuotesService;

  const baseOperation = () => ({
    id: operationId,
    customerId,
    cartId: cart.id,
    idempotencyKey: 'prep-key',
    requestFingerprint: 'fingerprint',
    state: CheckoutOperationState.PREPARED,
    externalOrderId: null as string | null,
    failureCode: null as string | null,
    createdAt: new Date(),
    completedAt: null as Date | null,
  });

  beforeEach(() => {
    prisma = {
      cart: { findFirst: jest.fn().mockResolvedValue(cart) },
      checkoutOperation: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    gateway = {
      listAddresses: jest.fn().mockResolvedValue([
        {
          addressId: 'ADR-1',
          street: 'Av. Lima 123',
          district: 'Miraflores',
          province: 'Lima',
          department: 'Lima',
          phone: '999999999',
        },
      ]),
      createAddress: jest.fn(),
      createQuote: jest.fn().mockResolvedValue(quote),
      applyBenefit: jest.fn(),
      revalidate: jest.fn().mockResolvedValue({ available: true, revalidatedAt: new Date().toISOString() }),
      createOrder: jest.fn(),
      getOrder: jest.fn(),
    };
    quotes = new QuotesService();
    service = new CheckoutService(
      prisma as unknown as PrismaService,
      gateway as unknown as MarketplaceGateway,
      quotes,
    );
  });

  it('creates a quote only for an address returned to the owner and their current cart version', async () => {
    const created = await service.createQuote(
      customerId,
      'valid-test-token',
      { addressId: 'ADR-1', cartVersion: 8 },
    );
    expect(created).toEqual(quote);
    expect(gateway.listAddresses).toHaveBeenCalledWith('valid-test-token');
    expect(quotes.get(customerId, 'Q-1')).toEqual(quote);

    await expect(
      service.createQuote(customerId, 'valid-test-token', { addressId: 'ADR-OTHER', cartVersion: 8 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records a PREPARED operation only after quantity revalidation', async () => {
    quotes.replace(customerId, quote);
    const prepared = baseOperation();
    prisma.checkoutOperation.findUnique.mockResolvedValue(null);
    prisma.checkoutOperation.create.mockResolvedValue(prepared);
    prisma.checkoutOperation.update.mockImplementation(async ({ data }) => {
      Object.assign(prepared, data);
      return prepared;
    });

    const result = await service.prepare(
      customerId,
      { quoteId: 'Q-1', cartVersion: 8, simulationConfirmed: true },
      '33333333-3333-4333-8333-333333333333',
    );

    expect(gateway.revalidate).toHaveBeenCalledWith(quote.lines);
    expect(result).toMatchObject({
      checkoutOperationId: operationId,
      state: 'PREPARED',
      simulationConsent: 'RECORDED',
    });
    expect(prisma.checkoutOperation.create.mock.calls[0][0].data).not.toHaveProperty(
      'preparedTotalAmount',
    );
  });

  it('keeps an order SUBMITTED while Sales reports CREADO and stores no contact data', async () => {
    const operation = baseOperation();
    (service as unknown as { preparedContexts: Map<string, unknown> }).preparedContexts.set(
      operationId,
      {
        cartVersion: 8,
        addressId: 'ADR-1',
        expiresAt: Date.now() + 60_000,
        total: quote.total,
      },
    );
    prisma.checkoutOperation.findFirst.mockImplementation(async ({ where }) =>
      where.id ? operation : null,
    );
    prisma.checkoutOperation.updateMany.mockImplementation(async ({ where, data }) => {
      if (!where.id) return { count: 0 };
      Object.assign(operation, data);
      return { count: 1 };
    });
    prisma.checkoutOperation.update.mockImplementation(async ({ data }) => {
      Object.assign(operation, data);
      return operation;
    });
    gateway.createOrder.mockResolvedValue({
      pedidoId: 'PED-MOCK-00001',
      estado: 'CREADO',
      total: { amount: 355, currency: 'PEN' },
      createdAt: new Date().toISOString(),
    });
    gateway.getOrder.mockResolvedValue({
      pedidoId: 'PED-MOCK-00001',
      estado: 'CREADO',
      total: { amount: 355, currency: 'PEN' },
      createdAt: new Date().toISOString(),
    });
    const contact: CheckoutContactDto = {
      fullName: 'Ana Perez',
      documentType: 'DNI',
      documentNumber: '12345678',
      phone: '999999999',
      email: 'ana@example.test',
    };

    const result = await service.createOrder(
      customerId,
      { checkoutOperationId: operationId, contact },
      '66666666-6666-4666-8666-666666666666',
    );

    expect(result.status).toBe(202);
    expect(result.data).toMatchObject({
      state: 'SUBMITTED',
      orderState: 'CREADO',
      orderId: 'PED-MOCK-00001',
    });
    const persistedOrderRequest = prisma.checkoutOperation.updateMany.mock.calls.find(
      ([call]) => call.data.requestFingerprint !== 'fingerprint',
    )?.[0].data;
    expect(persistedOrderRequest).not.toHaveProperty('contact');
    expect(JSON.stringify(persistedOrderRequest)).not.toContain('ana@example.test');
  });

  it('rejects a competing order idempotency key after another request claims the operation', async () => {
    const operation = { ...baseOperation(), state: CheckoutOperationState.SUBMITTED };
    operation.requestFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          checkoutOperationId: operation.id,
          idempotencyKey: '77777777-7777-4777-8777-777777777777',
          contact: {
            fullName: 'Ana Perez',
            documentType: 'DNI',
            documentNumber: '12345678',
            phone: '999999999',
            email: 'ana@example.test',
          },
        }),
      )
      .digest('hex');
    prisma.checkoutOperation.findFirst.mockImplementation(async ({ where }) =>
      where.id ? operation : null,
    );
    prisma.checkoutOperation.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.createOrder(
        customerId,
        {
          checkoutOperationId: operationId,
          contact: {
            fullName: 'Ana Perez',
            documentType: 'DNI',
            documentNumber: '12345678',
            phone: '999999999',
            email: 'ana@example.test',
          },
        },
        '66666666-6666-4666-8666-666666666666',
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(gateway.createOrder).not.toHaveBeenCalled();
  });

  it('closes an operation only when the provider query returns PAGADO', async () => {
    const operation = { ...baseOperation(), state: CheckoutOperationState.SUBMITTED };
    operation.externalOrderId = 'PED-MOCK-00002';
    prisma.checkoutOperation.findFirst.mockResolvedValue(operation);
    prisma.checkoutOperation.update.mockImplementation(async ({ data }) => {
      Object.assign(operation, data);
      return operation;
    });
    gateway.getOrder.mockResolvedValue({
      pedidoId: 'PED-MOCK-00002',
      estado: 'PAGADO',
      total: { amount: 355, currency: 'PEN' },
      createdAt: new Date().toISOString(),
    });

    const result = await service.getOperation(customerId, operationId);

    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({ state: 'SUCCEEDED', orderState: 'PAGADO' });
  });

  it('does not reveal an operation to a different customer', async () => {
    prisma.checkoutOperation.findFirst.mockResolvedValue(null);
    await expect(service.getOperation('99999999-9999-4999-8999-999999999999', operationId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.checkoutOperation.findFirst).toHaveBeenCalledWith({
      where: { id: operationId, customerId: '99999999-9999-4999-8999-999999999999' },
    });
  });
});
