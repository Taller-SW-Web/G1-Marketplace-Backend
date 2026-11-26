import { projectProductVariants } from './product-variants.real';
import { BffCatalogException } from './bff-catalog.exception';
import { isProductVariantsResponse } from './product-variants.dto';

const hosts = new Set(['images.example']);
const attribute = (id: string, label: string, valueId: string, value: string) => ({
  caracteristica_id: id, nombre: label, valor_id: valueId, valor: { valor_id: valueId, nombre: value },
});
const product = () => ({ product_id: 'g6-product', slug: 'polo-real', name: 'Polo G6', tiene_variantes: true,
  variants: [
    { variant_id: 'var-blue', sku: 'SKU-BLUE-M', identifying_attributes: [attribute('color', 'Color', 'blue', 'Azul'), attribute('size', 'Talla', 'm', 'M')], images: ['https://images.example/blue.jpg'] },
    { variant_id: 'var-white', sku: 'SKU-WHITE-M', identifying_attributes: [attribute('color', 'Color', 'white', 'Blanco'), attribute('size', 'Talla', 'm', 'M')], images: [] },
  ],
});
function expectFailure(value: unknown, status: number, code: string) {
  try { projectProductVariants(value, 'polo-real', hosts); throw new Error('Expected rejection'); }
  catch (error) {
    expect(error).toBeInstanceOf(BffCatalogException);
    expect(error).toMatchObject({ status, response: { error: { code } } });
  }
}

describe('G6 commercial detail -> F013', () => {
  it('projects readable values and SKU combinations, excluding provider price/stock fields', () => {
    const source = product();
    Object.assign(source.variants[0], { price: 30, stock: 9, availability: 'AVAILABLE' });
    const response = projectProductVariants(source, 'polo-real', hosts);
    expect(isProductVariantsResponse(response)).toBe(true);
    expect(response.data.attributes).toEqual([
      { id: 'color', label: 'Color', values: [{ id: 'blue', label: 'Azul' }, { id: 'white', label: 'Blanco' }] },
      { id: 'size', label: 'Talla', values: [{ id: 'm', label: 'M' }] },
    ]);
    expect(response.data.variants[0]).toEqual({ variantId: 'var-blue', sku: 'SKU-BLUE-M', status: 'ACTIVE',
      attributes: { color: 'blue', size: 'm' }, image: { url: 'https://images.example/blue.jpg', alt: 'Polo G6' } });
    expect(response.data.variants[1].image).toBeNull();
    expect(JSON.stringify(response)).not.toMatch(/"(?:price|stock|availability)"/);
  });
  it('retains the existing no-variants contract for a simple product', () => {
    expect(projectProductVariants({ ...product(), tiene_variantes: false, sku_base: 'SIMPLE-SKU', variants: [] }, 'polo-real', hosts))
      .toEqual({ data: { productId: 'g6-product', hasVariants: false, attributes: [], variants: [] } });
  });
  it('filters an explicitly inactive variant before validating its fields', () => {
    const source: any = product(); source.variants.push({ status: 'INACTIVA' });
    expect(projectProductVariants(source, 'polo-real', hosts).data.variants).toHaveLength(2);
  });
  it('returns 404 when no commercial variants remain', () => {
    expectFailure({ ...product(), variants: [{ status: 'DRAFT' }] }, 404, 'PRODUCT_NOT_AVAILABLE');
  });
  it.each(['BORRADOR', 'INACTIVO'])('does not expose a %s parent', status => {
    expectFailure({ ...product(), status }, 404, 'PRODUCT_NOT_AVAILABLE');
  });
  it.each([
    ['wrong slug', (p: any) => { p.slug = 'another-product'; }],
    ['missing product ID', (p: any) => { delete p.product_id; }],
    ['non-boolean flag', (p: any) => { p.tiene_variantes = 'true'; }],
    ['simple with variant rows', (p: any) => { p.tiene_variantes = false; }],
    ['null label', (p: any) => { p.variants[0].identifying_attributes[0].valor = null; }],
    ['unresolved value ID', (p: any) => { p.variants[0].identifying_attributes[0].valor = { valor_id: 'blue' }; }],
    ['different nested value ID', (p: any) => { p.variants[0].identifying_attributes[0].valor.valor_id = 'foreign'; }],
    ['missing SKU', (p: any) => { delete p.variants[0].sku; }],
    ['duplicate SKU', (p: any) => { p.variants[1].sku = p.variants[0].sku; }],
    ['duplicate variant ID', (p: any) => { p.variants[1].variant_id = p.variants[0].variant_id; }],
    ['duplicate combination', (p: any) => { p.variants[1].identifying_attributes = structuredClone(p.variants[0].identifying_attributes); }],
    ['incomplete combination', (p: any) => { p.variants[1].identifying_attributes.pop(); }],
    ['repeated attribute', (p: any) => { p.variants[0].identifying_attributes.push(p.variants[0].identifying_attributes[0]); }],
    ['conflicting attribute label', (p: any) => { p.variants[1].identifying_attributes[0].nombre = 'Otro'; }],
    ['conflicting value label', (p: any) => { p.variants[1].identifying_attributes[1].valor.nombre = 'Otro'; }],
    ['unknown state', (p: any) => { p.variants[0].status = 'UNKNOWN'; }],
  ])('rejects %s without returning a partial selector', (_label, mutate) => {
    const source = product(); mutate(source); expectFailure(source, 502, 'CATALOG_INVALID_RESPONSE');
  });
  it.each(['http://images.example/a.jpg', 'https://other.example/a.jpg', 'https://user:secret@images.example/a.jpg', 'https://images.example/a.jpg#fragment'])
    ('rejects a non-approved image %s', url => {
      const source = product(); source.variants[0].images = [url]; expectFailure(source, 502, 'CATALOG_INVALID_RESPONSE');
    });
  it('keeps scalar values supplied authoritatively by G6', () => {
    const source: any = product(); source.variants[0].identifying_attributes[0].valor = 'Azul';
    expect(projectProductVariants(source, 'polo-real', hosts).data.attributes[0].values[0].label).toBe('Azul');
  });
});
