import { Injectable } from '@nestjs/common';
import { CheckoutQuote } from './checkout.types';

@Injectable()
export class QuotesService {
  private readonly quotes = new Map<string, Map<string, CheckoutQuote>>();
  private readonly activeQuoteByCustomer = new Map<string, string>();

  replace(customerId: string, quote: CheckoutQuote): CheckoutQuote {
    const previousId = this.activeQuoteByCustomer.get(customerId);
    const customerQuotes = this.quotes.get(customerId) ?? new Map<string, CheckoutQuote>();
    if (previousId) customerQuotes.delete(previousId);
    customerQuotes.set(quote.quoteId, quote);
    this.quotes.set(customerId, customerQuotes);
    this.activeQuoteByCustomer.set(customerId, quote.quoteId);
    return quote;
  }

  get(customerId: string, quoteId: string): CheckoutQuote | undefined {
    const customerQuotes = this.quotes.get(customerId);
    if (!customerQuotes) return undefined;
    const quote = customerQuotes.get(quoteId);
    if (!quote) return undefined;
    if (Date.parse(quote.expiresAt) <= Date.now()) {
      customerQuotes.delete(quoteId);
      if (this.activeQuoteByCustomer.get(customerId) === quoteId) {
        this.activeQuoteByCustomer.delete(customerId);
      }
      return undefined;
    }
    return quote;
  }

  invalidate(customerId: string): void {
    this.quotes.delete(customerId);
    this.activeQuoteByCustomer.delete(customerId);
  }
}
