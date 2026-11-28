import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { G6CheckoutProvider } from './g6-checkout.provider';
import { MarketplaceGateway } from './marketplace.gateway';

describe('MarketplaceGateway checkout with G6 commerce (synthetic provider)', () => {
  const customerId = '11111111-1111-4111-8111-111111111111';
  const fixture = {
    customerId,
    sku: 'ADI-ENT22-AZU-M',
    productId: 'PROD-ADI-ENT22',
    unitPriceCents: 7990,
    shippingCents: 1250,
    paymentMethod: 'SIMULATED',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const values: Record<string, unknown> = {};
  let price: jest.Mock;
  let verifyQuantities: jest.Mock;
  let gateway: MarketplaceGateway;

  beforeEach(() => {
    Object.assign(values, {
      CHECKOUT_SALES_SOURCE: 'g5',
      CHECKOUT_G5_TEST_FIXTURE: JSON.stringify(fixture),
      CHECKOUT_G6_SOURCE: 'real',
    });
    price = jest.fn().mockResolvedValue({ amount: 79.9, currency: 'PEN', version: 9 });
    verifyQuantities = jest.fn().mockResolvedValue({ available: true, revalidatedAt: new Date().toISOString() });
    const g6 = { getPrice: price, verifyQuantities } as unknown as G6CheckoutProvider;
    const config = { get: (key: string, fallback?: unknown) => values[key] ?? fallback } as unknown as ConfigService;
    gateway = new MarketplaceGateway({} as HttpService, config, undefined, g6);
  });

  afterEach(() => {
    for (const key of Object.keys(values)) delete values[key];
  });

  const input = {
    address: {
      addressId: 'g7-address-1', street: 'Synthetic street', district: 'Miraflores',
      province: 'Lima', department: 'Lima',
    },
    addressId: 'g7-address-1',
    cartVersion: 4,
    lines: [{ sku: fixture.sku, quantity: 1 }],
  };

  it('uses G6 price as authoritative and labels fixture shipping separately', async () => {
    const quote = await gateway.createQuote(input, customerId);
    expect(price).toHaveBeenCalledWith(fixture.sku);
    expect(quote).toMatchObject({
      subtotal: { amount: 79.9, currency: 'PEN' },
      discount: { amount: 0, currency: 'PEN' },
      shipping: { amount: 12.5, currency: 'PEN' },
      total: { amount: 92.4, currency: 'PEN' },
      lines: [{ sku: fixture.sku, quantity: 1, productId: fixture.productId,
        unitPrice: { amount: 79.9, currency: 'PEN' } }],
      sources: {
        pricing: 'G6_REAL', shipping: 'G5_FIXTURE', benefits: 'G5_FIXTURE', inventoryRevalidation: 'G6_REAL',
      },
    });
  });

  it('refuses to issue a fixture quote when its expected price differs from G6', async () => {
    price.mockResolvedValue({ amount: 89.9, currency: 'PEN', version: 10 });
    await expect(gateway.createQuote(input, customerId)).rejects.toMatchObject({
      status: 409, code: 'G6_PRICE_FIXTURE_MISMATCH',
    });
  });

  it('uses G6 quantity verification at preparation and preserves fail-closed availability', async () => {
    const quote = await gateway.createQuote(input, customerId);
    const result = await gateway.revalidate(input.lines, customerId, quote.quoteId);
    expect(verifyQuantities).toHaveBeenCalledWith(input.lines);
    expect(result.available).toBe(true);
    verifyQuantities.mockResolvedValue({ available: false, revalidatedAt: new Date().toISOString() });
    await expect(gateway.revalidate(input.lines, customerId, quote.quoteId)).resolves.toMatchObject({ available: false, source: 'G6_REAL' });
  });

  it('does not call G6 to revalidate a prepared quote after its fixture is removed', async () => {
    const quote = await gateway.createQuote(input, customerId);
    delete values.CHECKOUT_G5_TEST_FIXTURE;

    await expect(gateway.revalidate(input.lines, customerId, quote.quoteId)).rejects.toMatchObject({
      status: 503, code: 'G6_CHECKOUT_FIXTURE_REQUIRED',
    });
    expect(verifyQuantities).not.toHaveBeenCalled();
  });
});
