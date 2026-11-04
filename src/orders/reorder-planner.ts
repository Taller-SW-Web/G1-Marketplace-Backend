export interface HistoricalOrderLine {
  sku: string;
  quantity: number;
}

export interface CurrentCartLine {
  sku: string;
  quantity: number;
}

export type ReorderEligibility =
  | { status: 'AVAILABLE'; maxAdditionalQuantity: number }
  | { status: 'NOT_AVAILABLE' | 'OUT_OF_STOCK' | 'COMMERCE_DATA_UNAVAILABLE' };

export interface ReorderPlan {
  toAdd: Array<{ sku: string; quantity: number }>;
  adjustments: Array<{ sku: string; reason: 'NOT_AVAILABLE' | 'OUT_OF_STOCK' | 'STOCK_LIMIT' | 'COMMERCE_DATA_UNAVAILABLE' }>;
}

/** Pure planning step. It never reads historical prices or mutates the cart. */
export function planReorder(
  historicalLines: HistoricalOrderLine[],
  currentCart: CurrentCartLine[],
  eligibility: ReadonlyMap<string, ReorderEligibility>,
): ReorderPlan {
  const requestedBySku = new Map<string, number>();
  for (const line of historicalLines) {
    if (!line.sku || !Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      throw new TypeError('Las líneas históricas deben tener SKU y cantidad positiva.');
    }
    const total = (requestedBySku.get(line.sku) ?? 0) + line.quantity;
    if (!Number.isSafeInteger(total)) throw new TypeError('La cantidad solicitada excede el límite permitido.');
    requestedBySku.set(line.sku, total);
  }

  const currentBySku = new Map<string, number>();
  for (const line of currentCart) {
    if (!line.sku || !Number.isSafeInteger(line.quantity) || line.quantity < 0) {
      throw new TypeError('Las líneas actuales del carrito no son válidas.');
    }
    const total = (currentBySku.get(line.sku) ?? 0) + line.quantity;
    if (!Number.isSafeInteger(total)) throw new TypeError('La cantidad actual del carrito no es válida.');
    currentBySku.set(line.sku, total);
  }

  const toAdd: ReorderPlan['toAdd'] = [];
  const adjustments: ReorderPlan['adjustments'] = [];
  for (const [sku, requested] of requestedBySku) {
    const check = eligibility.get(sku);
    if (!check) {
      adjustments.push({ sku, reason: 'COMMERCE_DATA_UNAVAILABLE' });
      continue;
    }
    if (check.status !== 'AVAILABLE') {
      adjustments.push({ sku, reason: check.status });
      continue;
    }
    if (!Number.isSafeInteger(check.maxAdditionalQuantity) || check.maxAdditionalQuantity < 0) {
      adjustments.push({ sku, reason: 'COMMERCE_DATA_UNAVAILABLE' });
      continue;
    }

    const cartRemaining = Math.max(0, 99 - (currentBySku.get(sku) ?? 0));
    const quantity = Math.min(requested, check.maxAdditionalQuantity, cartRemaining);
    if (quantity > 0) toAdd.push({ sku, quantity });
    if (quantity < requested) {
      adjustments.push({
        sku,
        reason: 'STOCK_LIMIT',
      });
    }
  }

  return { toAdd, adjustments };
}
