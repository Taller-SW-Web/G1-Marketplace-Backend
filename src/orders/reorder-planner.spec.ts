import { planReorder } from './reorder-planner';

describe('planReorder', () => {
  it('aggregates repeated historical SKUs and preserves partial eligible quantities', () => {
    const result = planReorder(
      [
        { sku: 'AERO-42', quantity: 2 },
        { sku: 'AERO-42', quantity: 1 },
        { sku: 'OLD-1', quantity: 1 },
      ],
      [{ sku: 'AERO-42', quantity: 2 }],
      new Map([
        ['AERO-42', { status: 'AVAILABLE', maxAdditionalQuantity: 2 }],
        ['OLD-1', { status: 'NOT_AVAILABLE' }],
      ]),
    );

    expect(result).toEqual({
      toAdd: [{ sku: 'AERO-42', quantity: 2 }],
      adjustments: [
        { sku: 'AERO-42', reason: 'STOCK_LIMIT' },
        { sku: 'OLD-1', reason: 'NOT_AVAILABLE' },
      ],
    });
  });

  it('does not report success when no line is eligible and commerce data is missing', () => {
    const result = planReorder(
      [{ sku: 'EMPTY', quantity: 1 }, { sku: 'UNKNOWN', quantity: 1 }],
      [],
      new Map([['EMPTY', { status: 'OUT_OF_STOCK' }]]),
    );
    expect(result.toAdd).toEqual([]);
    expect(result.adjustments).toEqual([
      { sku: 'EMPTY', reason: 'OUT_OF_STOCK' },
      { sku: 'UNKNOWN', reason: 'COMMERCE_DATA_UNAVAILABLE' },
    ]);
  });

  it('respects the cart line quantity limit before preparing another addition', () => {
    const result = planReorder(
      [{ sku: 'FULL', quantity: 2 }],
      [{ sku: 'FULL', quantity: 99 }],
      new Map([['FULL', { status: 'AVAILABLE', maxAdditionalQuantity: 10 }]]),
    );
    expect(result).toEqual({
      toAdd: [],
      adjustments: [{ sku: 'FULL', reason: 'STOCK_LIMIT' }],
    });
  });

  it('rejects invalid historical quantities instead of copying them into the cart', () => {
    expect(() => planReorder([{ sku: 'AERO-42', quantity: 0 }], [], new Map())).toThrow(TypeError);
  });
});
