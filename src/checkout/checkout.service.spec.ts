import { NotFoundException } from '@nestjs/common';
import { CheckoutOperationState } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutService } from './checkout.service';
import { CheckoutContactDto } from './dto/contact.dto';
import { MarketplaceGateway } from './external/marketplace.gateway';
import { ProviderError } from './external/provider-error';
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
    | 'getOrderByIdempotencyKey'
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
    preparedQuoteId: quote.quoteId,
    preparedCartVersion: quote.cartVersion,
    preparedAddressId: quote.addressId,
    preparedExpiresAt: new Date(quote.expiresAt),
    preparedTotalAmount: quote.total.amount,
    preparedTotalCurrency: quote.total.currency,
    preparedLines: quote.lines,
    revalidatedAt: new Date(),
    orderIdempotencyKey: null as string | null,
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
      getOrderByIdempotencyKey: jest.fn().mockResolvedValue({
        pedidoId: 'PED-2026-00001',
        estado: 'CREADO',
        total: { amount: 355, currency: 'PEN' },
        createdAt: new Date().toISOString(),
      }),
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
    expect(prisma.cart.findFirst).toHaveBeenCalledWith({
      where: { customerId, state: 'ACTIVE' },
      include: { items: true },
      orderBy: { updatedAt: 'desc' },
    });
    expect(gateway.createQuote).toHaveBeenCalledWith({
      address: expect.objectContaining({ addressId: 'ADR-1' }),
      addressId: 'ADR-1',
      cartVersion: cart.version,
      lines: cart.items.map(({ sku, quantity }) => ({ sku, quantity })),
    });
    expect(gateway.listAddresses).toHaveBeenCalledWith('valid-test-token');
    expect(quotes.get(customerId, 'Q-1')).toEqual(quote);

    await expect(
      service.createQuote(customerId, 'valid-test-token', { addressId: 'ADR-OTHER', cartVersion: 8 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps a provider address 4xx response to ADDRESS_VALIDATION_ERROR', async () => {
    gateway.createAddress.mockRejectedValue(new ProviderError(400, 'ADDRESS_VALIDATION_ERROR'));

    await expect(service.createAddress(customerId, 'valid-test-token', {
      street: 'Av. Lima 123',
      district: 'Miraflores',
      province: 'Lima',
      department: 'Lima',
      phone: '999999999',
    })).rejects.toMatchObject({
      status: 400,
      response: { error: { code: 'ADDRESS_VALIDATION_ERROR' } },
    });
  });

  it('records a PREPARED operation only after quantity revalidation', async () => {
    quotes.replace(customerId, quote);
    const prepared = { ...baseOperation(), state: CheckoutOperationState.PREPARING };
    prisma.checkoutOperation.findUnique.mockImplementation(async ({ where }) =>
      where.id ? prepared : null,
    );
    prisma.checkoutOperation.create.mockResolvedValue(prepared);
    prisma.checkoutOperation.updateMany.mockImplementation(async ({ where, data }) => {
      if (where.id === operationId && prepared.state === CheckoutOperationState.PREPARING) {
        Object.assign(prepared, data);
        return { count: 1 };
      }
      return { count: 0 };
    });

    const result = await service.prepare(
      customerId,
      { quoteId: 'Q-1', cartVersion: 8, simulationConfirmed: true },
      '33333333-3333-7333-8333-333333333333',
    );

    expect(gateway.revalidate).toHaveBeenCalledWith(quote.lines);
    expect(result).toMatchObject({
      checkoutOperationId: operationId,
      state: 'PREPARED',
      simulationConsent: 'RECORDED',
    });
    expect(prisma.checkoutOperation.create.mock.calls[0][0].data).toHaveProperty(
      'preparedTotalAmount',
    );
  });

  it('claims the anonymous session cart for the authenticated MOCK checkout before quoting', async () => {
    const anonymousCart = {
      ...cart,
      id: '66666666-6666-4666-8666-666666666666',
      anonymousSessionHash: 'session-capability-123456',
    };
    prisma.cart.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(anonymousCart);

    const created = await service.createQuote(
      customerId,
      'valid-test-token',
      { addressId: 'ADR-1', cartVersion: 8 },
      'session-capability-123456',
    );

    expect(created).toEqual(quote);
    expect(prisma.cart.findFirst).toHaveBeenNthCalledWith(2, {
      where: { anonymousSessionHash: 'session-capability-123456', state: 'ACTIVE' },
      include: { items: true },
    });
    expect(prisma.cart.findFirst).toHaveBeenCalledTimes(2);
    expect(gateway.createQuote).toHaveBeenCalledWith(expect.objectContaining({
      lines: [{ sku: 'AERO-42-BLK', quantity: 2 }],
      cartVersion: 8,
    }));
  });

  it('does not finish preparation against a quote replaced during revalidation', async () => {
    quotes.replace(customerId, quote);
    const preparing = { ...baseOperation(), state: CheckoutOperationState.PREPARING };
    let releaseRevalidation!: (value: { available: boolean; revalidatedAt: string }) => void;
    let markRevalidationStarted!: () => void;
    const revalidationStarted = new Promise<void>((resolve) => { markRevalidationStarted = resolve; });
    const delayedRevalidation = new Promise<{ available: boolean; revalidatedAt: string }>((resolve) => {
      releaseRevalidation = resolve;
    });
    gateway.revalidate.mockImplementation(() => {
      markRevalidationStarted();
      return delayedRevalidation;
    });
    prisma.checkoutOperation.findUnique.mockImplementation(async ({ where }) =>
      where.id ? preparing : null,
    );
    prisma.checkoutOperation.create.mockResolvedValue(preparing);
    prisma.checkoutOperation.updateMany.mockImplementation(async ({ where, data }) => {
      if (where.state?.in?.includes(preparing.state) || where.state === preparing.state) {
        Object.assign(preparing, data);
        return { count: 1 };
      }
      return { count: 0 };
    });
    gateway.listAddresses.mockResolvedValue([
      { addressId: 'ADR-1', street: 'Av. Lima 123', district: 'Miraflores', province: 'Lima', department: 'Lima', phone: '999999999' },
      { addressId: 'ADR-2', street: 'Av. Lima 456', district: 'San Isidro', province: 'Lima', department: 'Lima', phone: '999999999' },
    ]);
    gateway.createQuote.mockResolvedValue({ ...quote, quoteId: 'Q-2', addressId: 'ADR-2' });

    const preparingRequest = service.prepare(
      customerId,
      { quoteId: 'Q-1', cartVersion: 8, simulationConfirmed: true },
      '33333333-3333-7333-8333-333333333333',
    );
    await revalidationStarted;

    await service.createQuote(customerId, 'valid-test-token', { addressId: 'ADR-2', cartVersion: 8 });
    releaseRevalidation({ available: true, revalidatedAt: new Date().toISOString() });

    await expect(preparingRequest).rejects.toMatchObject({
      status: 409,
      response: { error: { code: 'REVALIDATION_CHANGED' } },
    });
    expect(preparing.state).toBe(CheckoutOperationState.FAILED);
    expect(preparing.failureCode).toBe('CHECKOUT_CONTEXT_CHANGED');
    expect(gateway.revalidate).toHaveBeenCalledTimes(1);
  });

  it('does not replace a newer prepared quote with a delayed benefit result', async () => {
    quotes.replace(customerId, quote);
    const staleBenefitQuote = {
      ...quote,
      quoteId: 'Q-1-BENEFIT',
      discount: { amount: 20, currency: 'PEN' },
      total: { amount: 335, currency: 'PEN' },
      selectedBenefit: { type: 'COUPON' as const, id: 'SAVE20', discount: { amount: 20, currency: 'PEN' } },
    };
    let releaseBenefit!: (value: typeof staleBenefitQuote) => void;
    let markBenefitStarted!: () => void;
    const benefitStarted = new Promise<void>((resolve) => { markBenefitStarted = resolve; });
    const delayedBenefit = new Promise<typeof staleBenefitQuote>((resolve) => { releaseBenefit = resolve; });
    gateway.applyBenefit.mockImplementation(() => {
      markBenefitStarted();
      return delayedBenefit;
    });
    gateway.listAddresses.mockResolvedValue([
      { addressId: 'ADR-1', street: 'Av. Lima 123', district: 'Miraflores', province: 'Lima', department: 'Lima', phone: '999999999' },
      { addressId: 'ADR-2', street: 'Av. Lima 456', district: 'San Isidro', province: 'Lima', department: 'Lima', phone: '999999999' },
    ]);
    const currentQuote = { ...quote, quoteId: 'Q-2', addressId: 'ADR-2' };
    gateway.createQuote.mockResolvedValue(currentQuote);

    let preparedOperation: (Omit<ReturnType<typeof baseOperation>, 'state'> & { state: CheckoutOperationState }) | null = null;
    prisma.checkoutOperation.findUnique.mockImplementation(async ({ where }) =>
      where.id ? preparedOperation : null,
    );
    prisma.checkoutOperation.create.mockImplementation(async ({ data }) => {
      preparedOperation = { ...baseOperation(), ...data };
      return preparedOperation;
    });
    prisma.checkoutOperation.updateMany.mockImplementation(async ({ where, data }) => {
      if (where.state?.in) {
        if (preparedOperation && where.state.in.includes(preparedOperation.state)) {
          Object.assign(preparedOperation, data);
          return { count: 1 };
        }
        return { count: 0 };
      }
      if (where.state === CheckoutOperationState.PREPARING && preparedOperation?.state === CheckoutOperationState.PREPARING) {
        Object.assign(preparedOperation, data);
        return { count: 1 };
      }
      return { count: 0 };
    });

    const staleBenefitRequest = service.applyBenefit(customerId, { quoteId: 'Q-1', couponCode: 'SAVE20' });
    await benefitStarted;

    await service.createQuote(customerId, 'valid-test-token', { addressId: 'ADR-2', cartVersion: 8 });
    await service.prepare(
      customerId,
      { quoteId: 'Q-2', cartVersion: 8, simulationConfirmed: true },
      '33333333-3333-7333-8333-333333333333',
    );
    expect(preparedOperation).toMatchObject({
      state: CheckoutOperationState.PREPARED,
      preparedQuoteId: 'Q-2',
      preparedAddressId: 'ADR-2',
    });

    releaseBenefit(staleBenefitQuote);
    await expect(staleBenefitRequest).rejects.toMatchObject({
      status: 409,
      response: { error: { code: 'QUOTE_EXPIRED' } },
    });

    expect(quotes.get(customerId, 'Q-2')).toEqual(currentQuote);
    expect(quotes.get(customerId, 'Q-1-BENEFIT')).toBeUndefined();
    expect(preparedOperation).toMatchObject({
      state: CheckoutOperationState.PREPARED,
      preparedQuoteId: 'Q-2',
      preparedAddressId: 'ADR-2',
      failureCode: null,
    });
  });

  it('retries a persisted PREPARING operation with its original context after a transient revalidation error', async () => {
    const operation = {
      ...baseOperation(),
      state: CheckoutOperationState.PREPARING,
      requestFingerprint: createHash('sha256')
        .update(JSON.stringify({
          quoteId: quote.quoteId,
          cartId: cart.id,
          cartVersion: quote.cartVersion,
          addressId: quote.addressId,
          simulationConfirmed: true,
          requestedQuoteId: quote.quoteId,
          requestedCartVersion: quote.cartVersion,
        }))
        .digest('hex'),
    };
    prisma.checkoutOperation.findUnique.mockResolvedValue(operation);
    prisma.checkoutOperation.update.mockImplementation(async ({ data }) => {
      Object.assign(operation, data);
      return operation;
    });
    prisma.checkoutOperation.updateMany.mockImplementation(async ({ where, data }) => {
      if (where.state === CheckoutOperationState.PREPARING && operation.state === CheckoutOperationState.PREPARING) {
        Object.assign(operation, data);
        return { count: 1 };
      }
      return { count: 0 };
    });
    gateway.revalidate.mockRejectedValueOnce(new ProviderError(504, 'REVALIDATION_TIMEOUT'));

    const key = '33333333-3333-4333-8333-333333333333';
    const input = { quoteId: quote.quoteId, cartVersion: quote.cartVersion, simulationConfirmed: true };
    await expect(service.prepare(customerId, input, key)).rejects.toMatchObject({
      status: 503,
      response: { error: { code: 'REVALIDATION_UNAVAILABLE' } },
    });
    expect(operation.state).toBe(CheckoutOperationState.PREPARING);
    expect(prisma.checkoutOperation.update).not.toHaveBeenCalled();

    const retried = await service.prepare(customerId, input, key);
    expect(gateway.revalidate).toHaveBeenCalledTimes(2);
    expect(retried.state).toBe('PREPARED');
    expect(retried.revalidatedAt).toEqual(expect.any(String));
  });

  it('keeps an order SUBMITTED while Sales reports CREADO and stores no contact data', async () => {
    const operation = baseOperation();
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
      pedidoId: 'PED-2026-00001',
      estado: 'CREADO',
      total: { amount: 355, currency: 'PEN' },
      createdAt: new Date().toISOString(),
    });
    gateway.getOrder.mockResolvedValue({
      pedidoId: 'PED-2026-00001',
      estado: 'CREADO',
      total: { amount: 355, currency: 'PEN' },
      createdAt: new Date().toISOString(),
    });
    gateway.getOrderByIdempotencyKey.mockResolvedValue({
      pedidoId: 'PED-2026-00001',
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
      orderId: 'PED-2026-00001',
    });
    expect(operation.externalOrderId).toBeNull();
    expect(gateway.getOrderByIdempotencyKey).toHaveBeenCalledWith(
      '66666666-6666-4666-8666-666666666666',
      customerId,
    );
    expect(gateway.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: '66666666-6666-4666-8666-666666666666',
    }));
    const persistedOrderRequest = prisma.checkoutOperation.updateMany.mock.calls.find(
      ([call]) => call.data.requestFingerprint !== 'fingerprint',
    )?.[0].data;
    expect(persistedOrderRequest).not.toHaveProperty('contact');
    expect(persistedOrderRequest).toHaveProperty(
      'orderIdempotencyKey',
      '66666666-6666-4666-8666-666666666666',
    );
    expect(JSON.stringify(persistedOrderRequest)).not.toContain('ana@example.test');
  });

  it('returns a conflict when the mock Sales idempotency scope rejects a changed payload', async () => {
    const operation = baseOperation();
    prisma.checkoutOperation.findFirst.mockResolvedValue(operation);
    prisma.checkoutOperation.updateMany.mockImplementation(async ({ data }) => {
      Object.assign(operation, data);
      return { count: 1 };
    });
    gateway.createOrder.mockRejectedValue(new ProviderError(409, 'IDEMPOTENCY_KEY_REUSED'));

    await expect(service.createOrder(
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
    )).rejects.toMatchObject({
      status: 409,
      response: { error: { code: 'IDEMPOTENCY_KEY_REUSED' } },
    });
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

  it('returns 409 ORDER_CREATION_PENDING when the Sales create outcome is uncertain', async () => {
    const operation = baseOperation();
    prisma.checkoutOperation.findFirst.mockImplementation(async ({ where }) =>
      where.id ? operation : null,
    );
    prisma.checkoutOperation.updateMany.mockImplementation(async ({ data }) => {
      Object.assign(operation, data);
      return { count: 1 };
    });
    prisma.checkoutOperation.update.mockImplementation(async ({ data }) => {
      Object.assign(operation, data);
      return operation;
    });
    gateway.createOrder
      .mockRejectedValueOnce(new ProviderError(503, 'SALES_UNAVAILABLE'))
      .mockResolvedValueOnce({
        pedidoId: 'PED-2026-00005',
        estado: 'CREADO',
        total: { amount: 355, currency: 'PEN' },
        createdAt: new Date().toISOString(),
      });
    gateway.getOrder.mockResolvedValue({
      pedidoId: 'PED-2026-00005',
      estado: 'CREADO',
      total: { amount: 355, currency: 'PEN' },
      createdAt: new Date().toISOString(),
    });
    gateway.getOrderByIdempotencyKey.mockResolvedValue({
      pedidoId: 'PED-2026-00005',
      estado: 'CREADO',
      total: { amount: 355, currency: 'PEN' },
      createdAt: new Date().toISOString(),
    });
    const input = {
      checkoutOperationId: operationId,
      contact: {
        fullName: 'Ana Perez',
        documentType: 'DNI' as const,
        documentNumber: '12345678',
        phone: '999999999',
        email: 'ana@example.test',
      },
    };
    const orderKey = '66666666-6666-4666-8666-666666666666';
    await expect(service.createOrder(customerId, input, orderKey)).rejects.toMatchObject({
      status: 409,
      response: { error: { code: 'ORDER_CREATION_PENDING' } },
    });
    expect(operation.state).toBe(CheckoutOperationState.SUBMITTED);
    expect(operation.orderIdempotencyKey).toBe(orderKey);

    // A new service instance simulates a process restart; the database row is the source of recovery data.
    service = new CheckoutService(
      prisma as unknown as PrismaService,
      gateway as unknown as MarketplaceGateway,
      quotes,
    );
    const recovered = await service.createOrder(customerId, input, orderKey);
    expect(recovered.status).toBe(202);
    expect(gateway.createOrder).toHaveBeenNthCalledWith(1, expect.objectContaining({ idempotencyKey: orderKey }));
    expect(gateway.createOrder).toHaveBeenNthCalledWith(2, expect.objectContaining({ idempotencyKey: orderKey }));
  });

  it('rejects an order ID from Sales that violates the published PED format', async () => {
    const operation = baseOperation();
    prisma.checkoutOperation.findFirst.mockImplementation(async ({ where }) =>
      where.id ? operation : null,
    );
    prisma.checkoutOperation.updateMany.mockImplementation(async ({ data }) => {
      Object.assign(operation, data);
      return { count: 1 };
    });
    gateway.createOrder.mockResolvedValue({
      pedidoId: 'PED-MOCK-00001',
      estado: 'CREADO',
      total: { amount: 355, currency: 'PEN' },
      createdAt: new Date().toISOString(),
    });

    await expect(service.createOrder(
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
    )).rejects.toMatchObject({
      status: 503,
      response: { error: { code: 'SALES_UNAVAILABLE' } },
    });
    expect(operation.externalOrderId).toBeNull();
  });

  it('does not replay a failed order as an HTTP success', async () => {
    const operation = {
      ...baseOperation(),
      state: CheckoutOperationState.FAILED,
      failureCode: 'PAGO_NO_COMPLETADO',
    };
    prisma.checkoutOperation.findFirst.mockResolvedValue(operation);

    await expect(service.createOrder(
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
    )).rejects.toMatchObject({
      status: 409,
      response: { error: { code: 'PAGO_NO_COMPLETADO' } },
    });
  });

  it('rejects a different idempotency key when replaying a succeeded order', async () => {
    const originalKey = '77777777-7777-4777-8777-777777777777';
    const operation = {
      ...baseOperation(),
      state: CheckoutOperationState.SUCCEEDED,
      externalOrderId: 'PED-2026-00006',
      orderIdempotencyKey: originalKey,
      requestFingerprint: createHash('sha256')
        .update(JSON.stringify({
          checkoutOperationId: operationId,
          idempotencyKey: originalKey,
          contact: {
            fullName: 'Ana Perez',
            documentType: 'DNI',
            documentNumber: '12345678',
            phone: '999999999',
            email: 'ana@example.test',
          },
        }))
        .digest('hex'),
    };
    prisma.checkoutOperation.findFirst.mockResolvedValue(operation);

    await expect(service.createOrder(
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
      '88888888-8888-4888-8888-888888888888',
    )).rejects.toMatchObject({
      status: 409,
      response: { error: { code: 'IDEMPOTENCY_KEY_REUSED' } },
    });
    expect(gateway.getOrder).not.toHaveBeenCalled();
  });

  it('closes an operation only when the provider query returns PAGADO', async () => {
    const operation = { ...baseOperation(), state: CheckoutOperationState.SUBMITTED };
    operation.externalOrderId = 'PED-2026-00002';
    prisma.checkoutOperation.findFirst.mockResolvedValue(operation);
    prisma.checkoutOperation.update.mockImplementation(async ({ data }) => {
      Object.assign(operation, data);
      return operation;
    });
    gateway.getOrder.mockResolvedValue({
      pedidoId: 'PED-2026-00002',
      estado: 'PAGADO',
      total: { amount: 355, currency: 'PEN' },
      createdAt: new Date().toISOString(),
    });

    const result = await service.getOperation(customerId, operationId);

    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({
      state: 'SUCCEEDED',
      order: {
        orderId: 'PED-2026-00002',
        state: 'PAGADO',
        total: { amount: 355, currency: 'PEN' },
        createdAt: expect.any(String),
      },
    });
    expect(result.data).not.toHaveProperty('orderState');
  });

  it('returns the published nested order in a neutral 202 while Sales reports CREADO', async () => {
    const operation = { ...baseOperation(), state: CheckoutOperationState.SUBMITTED };
    operation.externalOrderId = 'PED-2026-00003';
    prisma.checkoutOperation.findFirst.mockResolvedValue(operation);
    gateway.getOrder.mockResolvedValue({
      pedidoId: 'PED-2026-00003',
      estado: 'CREADO',
      total: { amount: 355, currency: 'PEN' },
      createdAt: '2026-10-16T10:00:00.000Z',
    });

    const result = await service.getOperation(customerId, operationId);

    expect(result.status).toBe(202);
    expect(result.data).toMatchObject({
      state: 'SUBMITTED',
      order: {
        orderId: 'PED-2026-00003',
        state: 'CREADO',
        total: { amount: 355, currency: 'PEN' },
        createdAt: '2026-10-16T10:00:00.000Z',
      },
    });
    expect(result.data.state).not.toBe('SUCCEEDED');
  });

  it('recovers a pending order by the persisted idempotency key without storing its ID', async () => {
    const operation = {
      ...baseOperation(),
      state: CheckoutOperationState.SUBMITTED,
      orderIdempotencyKey: '66666666-6666-4666-8666-666666666666',
    };
    prisma.checkoutOperation.findFirst.mockResolvedValue(operation);
    gateway.getOrderByIdempotencyKey.mockResolvedValue({
      pedidoId: 'PED-2026-00007',
      estado: 'CREADO',
      total: { amount: 355, currency: 'PEN' },
      createdAt: '2026-10-16T10:00:00.000Z',
    });

    const result = await service.getOperation(customerId, operationId);

    expect(result.status).toBe(202);
    expect(result.data).toMatchObject({
      state: 'SUBMITTED',
      order: { orderId: 'PED-2026-00007', state: 'CREADO' },
    });
    expect(operation.externalOrderId).toBeNull();
    expect(prisma.checkoutOperation.update).not.toHaveBeenCalled();
    expect(gateway.getOrderByIdempotencyKey).toHaveBeenCalledWith(operation.orderIdempotencyKey, customerId);
  });

  it('persists the mock Sales order ID only when the operation becomes SUCCEEDED', async () => {
    const operation = {
      ...baseOperation(),
      state: CheckoutOperationState.SUBMITTED,
      orderIdempotencyKey: '66666666-6666-4666-8666-666666666666',
    };
    prisma.checkoutOperation.findFirst.mockResolvedValue(operation);
    prisma.checkoutOperation.update.mockImplementation(async ({ data }) => {
      Object.assign(operation, data);
      return operation;
    });
    gateway.getOrderByIdempotencyKey.mockResolvedValue({
      pedidoId: 'PED-2026-00008',
      estado: 'PAGADO',
      total: { amount: 355, currency: 'PEN' },
      createdAt: '2026-10-16T10:00:00.000Z',
    });

    const result = await service.getOperation(customerId, operationId);

    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({
      state: 'SUCCEEDED',
      order: { orderId: 'PED-2026-00008', state: 'PAGADO' },
    });
    expect(operation).toMatchObject({
      state: CheckoutOperationState.SUCCEEDED,
      externalOrderId: 'PED-2026-00008',
      completedAt: expect.any(Date),
    });
  });

  it('returns an ANULADO order nested as a terminal FAILED result', async () => {
    const operation = { ...baseOperation(), state: CheckoutOperationState.SUBMITTED };
    operation.externalOrderId = 'PED-2026-00004';
    prisma.checkoutOperation.findFirst.mockResolvedValue(operation);
    prisma.checkoutOperation.update.mockImplementation(async ({ data }) => {
      Object.assign(operation, data);
      return operation;
    });
    gateway.getOrder.mockResolvedValue({
      pedidoId: 'PED-2026-00004',
      estado: 'ANULADO',
      total: { amount: 355, currency: 'PEN' },
      createdAt: '2026-10-16T10:00:00.000Z',
      failureCode: 'PAGO_NO_COMPLETADO',
    });

    const result = await service.getOperation(customerId, operationId);

    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({
      state: 'FAILED',
      failureCode: 'PAGO_NO_COMPLETADO',
      order: {
        orderId: 'PED-2026-00004',
        state: 'ANULADO',
        total: { amount: 355, currency: 'PEN' },
        createdAt: '2026-10-16T10:00:00.000Z',
      },
    });
    expect(operation.externalOrderId).toBeNull();
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
