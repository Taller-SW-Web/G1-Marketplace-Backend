import { QuotesService } from './quotes.service';

describe('QuotesService', () => {
  let quotes: QuotesService;

  const makeQuote = (quoteId: string) => ({
    quoteId,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    subtotal: { amount: 100, currency: 'PEN' },
    discount: { amount: 0, currency: 'PEN' },
    shipping: { amount: 15, currency: 'PEN', estimatedDays: 2 },
    total: { amount: 115, currency: 'PEN' },
    lines: [{ sku: 'SKU-1', quantity: 1 }],
    addressId: 'ADR-1',
    cartVersion: 1,
  });

  beforeEach(() => {
    quotes = new QuotesService();
  });

  it('isolates quotes by owner and replacing a quote invalidates the previous version', () => {
    const owner = 'customer-a';
    quotes.replace(owner, makeQuote('Q-1'));
    expect(quotes.get(owner, 'Q-1')).toBeDefined();
    expect(quotes.get('customer-b', 'Q-1')).toBeUndefined();

    quotes.replace(owner, makeQuote('Q-2'));
    expect(quotes.get(owner, 'Q-1')).toBeUndefined();
    expect(quotes.get(owner, 'Q-2')).toBeDefined();
  });

  it('expires quotes and supports explicit invalidation', () => {
    const expired = { ...makeQuote('Q-old'), expiresAt: new Date(Date.now() - 1000).toISOString() };
    quotes.replace('customer-a', expired);
    expect(quotes.get('customer-a', 'Q-old')).toBeUndefined();

    quotes.replace('customer-a', makeQuote('Q-3'));
    quotes.invalidate('customer-a');
    expect(quotes.get('customer-a', 'Q-3')).toBeUndefined();
  });
});
