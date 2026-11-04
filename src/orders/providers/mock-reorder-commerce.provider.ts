import { Injectable } from '@nestjs/common';
import { ReorderCommerceProvider, ReorderSkuCheck } from '../reorder.types';

/** Synthetic catalog/stock/pricing only. It must never be selected in production. */
@Injectable()
export class MockReorderCommerceProvider implements ReorderCommerceProvider {
  private readonly products = new Map([
    ['MOCK-AERO-42', { stock: 5, amount: 249.9, version: 3 }],
    ['MOCK-CASE-01', { stock: 0, amount: 39.9, version: 2 }],
    ['MOCK-TEE-02', { stock: 2, amount: 59.9, version: 8 }],
  ]);

  async checkSku(input: { sku: string; requestedQuantity: number; currentQuantity: number }): Promise<ReorderSkuCheck> {
    const product = this.products.get(input.sku);
    if (!product) return { status: 'NOT_AVAILABLE' };
    const maxAdditionalQuantity = Math.max(0, Math.min(product.stock, 99 - input.currentQuantity));
    if (maxAdditionalQuantity === 0) return { status: 'OUT_OF_STOCK' };
    return {
      status: 'AVAILABLE',
      maxAdditionalQuantity,
      quote: { amount: product.amount, currency: 'PEN', version: product.version },
    };
  }
}
