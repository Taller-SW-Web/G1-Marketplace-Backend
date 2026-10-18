import { BadRequestException } from '@nestjs/common';
import { mockSkuForProductId } from './mock-product-sku';

describe('mockSkuForProductId', () => {
  const previousMode = process.env.BFF_MODE;

  beforeEach(() => {
    process.env.BFF_MODE = 'mock';
  });

  afterAll(() => {
    if (previousMode === undefined) delete process.env.BFF_MODE;
    else process.env.BFF_MODE = previousMode;
  });

  it('maps the standard product fixture to its stable test SKU', () => {
    expect(mockSkuForProductId('PRD-MOCK-001')).toBe('SKU-MOCK-001');
  });

  it('maps each catalog demo fixture without exposing a SKU in the product contract', () => {
    expect(mockSkuForProductId('mock-product-7')).toBe('SKU-MOCK-007');
    expect(mockSkuForProductId('mock-product-32')).toBe('SKU-MOCK-032');
  });

  it('rejects unknown or out-of-range products instead of inventing a SKU', () => {
    expect(() => mockSkuForProductId('mock-product-33')).toThrow(BadRequestException);
    expect(() => mockSkuForProductId('unknown-product')).toThrow(BadRequestException);
  });

  it('does not use MOCK mappings when the BFF is in REAL mode', () => {
    process.env.BFF_MODE = 'real';
    expect(() => mockSkuForProductId('PRD-MOCK-001')).toThrow(BadRequestException);
  });
});
