import { CommerceQuote } from '../catalog/wishlist-catalog';

export type ReorderSkuCheck =
  | { status: 'AVAILABLE'; maxAdditionalQuantity: number; quote: CommerceQuote }
  | { status: 'NOT_AVAILABLE' | 'OUT_OF_STOCK' | 'COMMERCE_DATA_UNAVAILABLE' };

export interface ReorderCommerceProvider {
  checkSku(input: { sku: string; requestedQuantity: number; currentQuantity: number }): Promise<ReorderSkuCheck>;
}

export const REORDER_COMMERCE_PROVIDER = Symbol('REORDER_COMMERCE_PROVIDER');

export interface ReorderResult {
  cartId: string;
  version: number;
  added: Array<{ sku: string; quantity: number }>;
  adjustments: Array<{
    sku: string;
    reason: 'NOT_AVAILABLE' | 'OUT_OF_STOCK' | 'STOCK_LIMIT' | 'COMMERCE_DATA_UNAVAILABLE';
  }>;
}
