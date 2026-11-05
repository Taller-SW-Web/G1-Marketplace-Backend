import { mapG6Availability } from './g6-availability.mapper';
import { ProductAvailabilityService } from './product-availability.service';

const context = { productId: 'PRD-1', sku: 'SKU-1', checkedAt: '2026-11-03T19:38:18Z' };

describe('M01: proyección comercial G6 → F-014', () => {
  it.each([
    ['DISPONIBLE', 'AVAILABLE'], ['STOCK_BAJO', 'STOCK_LOW'],
    ['AGOTADO', 'OUT_OF_STOCK'], ['INDETERMINADO', 'UNDETERMINED'],
  ])('%s conserva su significado como %s', (status, expected) => {
    expect(mapG6Availability({ items: [{ sku: 'SKU-1', status }] }, context)).toEqual({
      data: { ...context, availability: expected },
    });
  });

  it('sirve un fixture indeterminado sin activar REAL', async () => {
    const previous = process.env.BFF_MODE;
    try {
      process.env.BFF_MODE = 'mock';
      const result = await new ProductAvailabilityService().getAvailability('producto-demostracion-7');
      expect(result.data).toMatchObject({ sku: 'SKU-MOCK-008', availability: 'UNDETERMINED' });
      expect(Object.keys(result.data).sort()).toEqual(['availability', 'checkedAt', 'productId', 'sku']);
      process.env.BFF_MODE = 'real';
      await expect(new ProductAvailabilityService().getAvailability('producto-demostracion-7'))
        .rejects.toMatchObject({ status: 503 });
    } finally {
      if (previous === undefined) delete process.env.BFF_MODE;
      else process.env.BFF_MODE = previous;
    }
  });
});
