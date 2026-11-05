/**
 * DTOs y guardia del contrato BFF F-013 — Atributos y variantes.
 *
 * El BFF sólo expone variantes comercialmente activas: nunca stock ni precio.
 * Una respuesta con SKU ausente, combinación duplicada o atributo incompleto
 * se rechaza completa (`502 CATALOG_INVALID_RESPONSE`); no se ofrece una
 * selección parcialmente válida.
 *
 * ⚠️ MOCK — H3/H4: datos desde fixtures hasta cerrar I-01.
 *
 * @see SPECS/contrato-api/F-013-seleccion-atributos-variante.md
 */

export interface VariantAttributeValueDTO {
  id: string;
  label: string;
}

export interface VariantAttributeDTO {
  id: string;
  label: string;
  values: VariantAttributeValueDTO[];
}

export interface VariantImageDTO {
  url: string;
  alt: string;
}

export interface ProductVariantDTO {
  variantId: string;
  sku: string;
  status: 'ACTIVE';
  attributes: Record<string, string>;
  image: VariantImageDTO | null;
}

export interface ProductVariantsDTO {
  productId: string;
  hasVariants: boolean;
  attributes: VariantAttributeDTO[];
  variants: ProductVariantDTO[];
}

export interface ProductVariantsResponseDTO {
  data: ProductVariantsDTO;
}

const HTTPS_URL = /^https:\/\/\S+$/u;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isHttpsUrl = (value: unknown): value is string =>
  typeof value === 'string' && HTTPS_URL.test(value);

const isVariantImage = (value: unknown): boolean => {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const image = value as VariantImageDTO;
  return isHttpsUrl(image.url) && isNonEmptyString(image.alt);
};

const combinationKey = (
  attributeIds: readonly string[],
  attributes: Record<string, string>,
): string => attributeIds.map((id) => attributes[id]).join('\u0000');

/**
 * Guardia estructural + semántica del contrato F-013 v1.
 *
 * Reglas verificadas:
 *   - `sku` y `variantId` obligatorios y únicos;
 *   - atributos identificadores completos y valores declarados;
 *   - una sola variante por combinación;
 *   - sólo `status: ACTIVE` (el filtrado previo ocurre en el servicio);
 *   - imagen opcional, HTTPS cuando existe;
 *   - sin campos de stock ni precio.
 */
export function isProductVariantsResponse(
  value: unknown,
): value is ProductVariantsResponseDTO {
  if (!value || typeof value !== 'object') return false;
  const { data } = value as ProductVariantsResponseDTO;
  if (!data || typeof data !== 'object') return false;
  if (!isNonEmptyString(data.productId)) return false;
  if (typeof data.hasVariants !== 'boolean') return false;
  if (!Array.isArray(data.attributes) || !Array.isArray(data.variants)) {
    return false;
  }

  if (!data.hasVariants) {
    return data.attributes.length === 0 && data.variants.length === 0;
  }
  if (data.attributes.length === 0 || data.variants.length === 0) return false;

  const attributeValues = new Map<string, Set<string>>();
  for (const attribute of data.attributes) {
    if (!attribute || typeof attribute !== 'object') return false;
    if (!isNonEmptyString(attribute.id) || !isNonEmptyString(attribute.label)) {
      return false;
    }
    if (attributeValues.has(attribute.id)) return false;
    if (!Array.isArray(attribute.values) || attribute.values.length === 0) {
      return false;
    }
    const values = new Set<string>();
    for (const item of attribute.values) {
      if (!item || typeof item !== 'object') return false;
      if (!isNonEmptyString(item.id) || !isNonEmptyString(item.label)) {
        return false;
      }
      if (values.has(item.id)) return false;
      values.add(item.id);
    }
    attributeValues.set(attribute.id, values);
  }

  const attributeIds = [...attributeValues.keys()];
  const variantIds = new Set<string>();
  const skus = new Set<string>();
  const combinations = new Set<string>();

  for (const variant of data.variants) {
    if (!variant || typeof variant !== 'object') return false;
    if (!isNonEmptyString(variant.variantId) || variantIds.has(variant.variantId)) {
      return false;
    }
    if (!isNonEmptyString(variant.sku) || skus.has(variant.sku)) return false;
    if (variant.status !== 'ACTIVE') return false;
    if (!isVariantImage(variant.image)) return false;
    if (
      'stock' in variant ||
      'price' in variant ||
      'availability' in variant
    ) {
      return false;
    }
    if (!variant.attributes || typeof variant.attributes !== 'object') {
      return false;
    }

    const keys = Object.keys(variant.attributes);
    if (keys.length !== attributeIds.length) return false;
    for (const attributeId of attributeIds) {
      const value = variant.attributes[attributeId];
      if (!isNonEmptyString(value)) return false;
      if (!attributeValues.get(attributeId)?.has(value)) return false;
    }

    const combination = combinationKey(attributeIds, variant.attributes);
    if (combinations.has(combination)) return false;

    variantIds.add(variant.variantId);
    skus.add(variant.sku);
    combinations.add(combination);
  }

  return true;
}
