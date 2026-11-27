import { ValidationError } from 'class-validator';
import { isProductId, ProductIdPipe, wishlistValidationError } from './product-id';

describe('product-id validation helpers (F-036..F-039)', () => {
  it('validates productId strings and rejects whitespace, control chars, or oversized values', () => {
    expect(isProductId('PROD-001')).toBe(true);
    expect(isProductId('a'.repeat(100))).toBe(true);
    expect(isProductId('')).toBe(false);
    expect(isProductId(' PROD-001')).toBe(false);
    expect(isProductId('PROD-001 ')).toBe(false);
    expect(isProductId('PROD\n001')).toBe(false);
    expect(isProductId('a'.repeat(101))).toBe(false);
    expect(isProductId(123)).toBe(false);
  });

  it('ProductIdPipe returns valid id and throws 400 INVALID_PRODUCT_ID otherwise', () => {
    const pipe = new ProductIdPipe();
    expect(pipe.transform('SKU-123')).toBe('SKU-123');
    expect(() => pipe.transform('   ')).toThrow(
      expect.objectContaining({ status: 400, response: expect.objectContaining({ code: 'INVALID_PRODUCT_ID' }) }),
    );
  });

  it('maps single productId validation errors to INVALID_PRODUCT_ID and others to INVALID_REQUEST', () => {
    const productOnly = new ValidationError();
    productOnly.property = 'productId';
    productOnly.constraints = { isProductId: 'invalid' };
    expect(wishlistValidationError([productOnly])).toMatchObject({
      status: 400,
      response: { code: 'INVALID_PRODUCT_ID' },
    });

    const extraField = new ValidationError();
    extraField.property = 'productId';
    extraField.constraints = { whitelistValidation: 'forbid' };
    expect(wishlistValidationError([extraField])).toMatchObject({
      status: 400,
      response: { code: 'INVALID_REQUEST' },
    });
  });
});
