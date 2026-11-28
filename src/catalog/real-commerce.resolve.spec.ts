/**
 * Tests unitarios — resolución del SKU de un producto REAL (`resolveRealSku`).
 *
 * Doble local de `realProductVariants`: no se llama a G6 ni a G7.
 */

import { BffCatalogException } from './bff-catalog.exception';
import { realProductVariants } from './product-variants.real';
import { RealCommerceError, resolveRealSku } from './real-commerce';

jest.mock('./product-variants.real', () => ({ realProductVariants: jest.fn() }));

const variantsMock = realProductVariants as jest.Mock;
const PRODUCT_ID = '32a4172c-81b2-b643-1d0f-ae66f627f2ef';

const withVariants = (...skus: string[]) => ({
  data: {
    productId: PRODUCT_ID,
    hasVariants: true,
    attributes: [],
    variants: skus.map((sku) => ({ variantId: `v-${sku}`, sku, status: 'ACTIVE', attributes: {}, image: null })),
  },
});

const kindOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return error instanceof RealCommerceError ? error.kind : `otro:${String(error)}`;
  }
  return 'sin-error';
};

describe('resolveRealSku', () => {
  beforeEach(() => variantsMock.mockReset());

  it('valida el SKU pedido contra las variantes del producto', async () => {
    variantsMock.mockResolvedValue(withVariants('ADI-ENT22-AZU-M', 'ADI-ENT22-AZU-L'));
    await expect(resolveRealSku('ent22-inka-athletics', 'ADI-ENT22-AZU-L'))
      .resolves.toEqual({ productId: PRODUCT_ID, sku: 'ADI-ENT22-AZU-L' });
  });

  it('un SKU ajeno al producto es SKU_MISMATCH', async () => {
    variantsMock.mockResolvedValue(withVariants('ADI-ENT22-AZU-M'));
    expect(await kindOf(resolveRealSku('ent22-inka-athletics', 'OTRO-SKU'))).toBe('SKU_MISMATCH');
  });

  it('sin SKU: con una sola variante se resuelve; con varias hay que elegir', async () => {
    variantsMock.mockResolvedValue(withVariants('ADI-ENT22-AZU-M'));
    await expect(resolveRealSku('ent22-inka-athletics')).resolves.toEqual({ productId: PRODUCT_ID, sku: 'ADI-ENT22-AZU-M' });
    variantsMock.mockResolvedValue(withVariants('A', 'B'));
    expect(await kindOf(resolveRealSku('ent22-inka-athletics'))).toBe('SELECTION_REQUIRED');
  });

  it('producto SIN variantes: el BFF no expone su SKU base, no se inventa (UNAVAILABLE)', async () => {
    variantsMock.mockResolvedValue({ data: { productId: PRODUCT_ID, hasVariants: false, attributes: [], variants: [] } });
    expect(await kindOf(resolveRealSku('producto-simple'))).toBe('UNAVAILABLE');
    expect(await kindOf(resolveRealSku('producto-simple', 'X'))).toBe('UNAVAILABLE');
  });

  it.each([
    [400, 'INVALID_SLUG'],
    [404, 'NOT_AVAILABLE'],
    [504, 'TIMEOUT'],
    [502, 'INVALID'],
    [503, 'UNAVAILABLE'],
  ] as const)('traduce el %i de las variantes a %s', async (status, kind) => {
    variantsMock.mockRejectedValue(new BffCatalogException(status, 'CODE', 'msg'));
    expect(await kindOf(resolveRealSku('ent22-inka-athletics', 'X'))).toBe(kind);
  });

  it('un error inesperado nunca inventa un SKU: UNAVAILABLE', async () => {
    variantsMock.mockRejectedValue(new Error('boom'));
    expect(await kindOf(resolveRealSku('ent22-inka-athletics', 'X'))).toBe('UNAVAILABLE');
  });
});
