import { BadRequestException } from '@nestjs/common';

/** Server-owned mapping for the catalog's MOCK product fixtures. */
export function mockSkuForProductId(productId: string): string {
  if ((process.env.BFF_MODE ?? 'mock') !== 'mock') {
    throw new BadRequestException({
      error: { code: 'PRODUCT_ID_NOT_SUPPORTED' },
    });
  }

  if (productId === 'PRD-MOCK-001') return 'SKU-MOCK-001';

  const demoProduct = /^mock-product-(\d{1,2})$/.exec(productId);
  const number = demoProduct ? Number(demoProduct[1]) : 0;
  if (number >= 1 && number <= 32) {
    return `SKU-MOCK-${String(number).padStart(3, '0')}`;
  }

  throw new BadRequestException({
    error: { code: 'PRODUCT_NOT_PURCHASABLE' },
  });
}
