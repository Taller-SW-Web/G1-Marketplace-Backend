import { Injectable } from '@nestjs/common';
import { CheckoutQuote } from './checkout.types';

interface StoredQuote {
  customerId: string;
  quote: CheckoutQuote;
}

@Injectable()
export class QuotesService {
  private readonly quotes = new Map<string, StoredQuote>();
  private readonly activeQuoteByCustomer = new Map<string, string>();

  replace(customerId: string, quote: CheckoutQuote): CheckoutQuote {
    const previousId = this.activeQuoteByCustomer.get(customerId);
    if (previousId) this.quotes.delete(previousId);
    this.quotes.set(quote.quoteId, { customerId, quote });
    this.activeQuoteByCustomer.set(customerId, quote.quoteId);
    return quote;
  }

  get(customerId: string, quoteId: string): CheckoutQuote | undefined {
    const stored = this.quotes.get(quoteId);
    if (!stored || stored.customerId !== customerId) return undefined;
    if (Date.parse(stored.quote.expiresAt) <= Date.now()) {
      this.quotes.delete(quoteId);
      if (this.activeQuoteByCustomer.get(customerId) === quoteId) {
        this.activeQuoteByCustomer.delete(customerId);
      }
      return undefined;
    }
    return stored.quote;
  }

  invalidate(customerId: string): void {
    const quoteId = this.activeQuoteByCustomer.get(customerId);
    if (quoteId) this.quotes.delete(quoteId);
    this.activeQuoteByCustomer.delete(customerId);
  }
}
