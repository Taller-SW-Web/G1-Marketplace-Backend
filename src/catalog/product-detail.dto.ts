/**
 * DTOs de respuesta para F-011 — Detalle de Producto (BFF)
 *
 * Contrato de respuesta del endpoint GET /api/v1/catalog/products/:slug.
 * Estas interfaces definen la estructura exacta de la respuesta JSON y la
 * validación estructural mínima antes de responder (contrato malformado → 502).
 *
 * ⚠️ MOCK — H3: datos provienen de fixtures hasta que I-01 se cierre.
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md
 */

export interface ProductBrandDTO {
  brandId: string;
  name: string;
}

export interface ProductMediaDTO {
  mediaId: string;
  type: 'IMAGE';
  url: string;
  /** BFF genera fallback si falta en origen. */
  alt: string;
  displayOrder: number;
}

export interface TechnicalSpecificationDTO {
  group?: string;
  name: string;
  value: string;
  unit?: string | null;
  displayOrder: number;
}

export interface ProductDetailDTO {
  productId: string;
  slug: string;
  name: string;
  brand: ProductBrandDTO;
  description?: string;
  technicalSpecifications: TechnicalSpecificationDTO[];
  /** Nunca vacío para producto activo. */
  media: ProductMediaDTO[];
}

export interface ProductDetailResponseDTO {
  data: ProductDetailDTO;
  meta: { source: string; retrievedAt: string };
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isHttpsUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^https:\/\/\S+$/u.test(value);

const isDisplayOrder = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0;

/**
 * Campos comerciales excluidos de `v1` (§5.1 Campos excluidos): precio,
 * stock, SKU, variante y cupón quedan fuera de este corte (F-012–F-015).
 */
const EXCLUDED_COMMERCIAL_FIELDS = [
  'price',
  'stock',
  'variants',
  'sku',
  'coupon',
  'discount',
] as const;

/**
 * Medio válido según API-CA-F011-04: sólo `IMAGE` con URL HTTPS,
 * `alt` no vacío y `displayOrder` entero no negativo.
 */
const isValidMedia = (media: unknown): media is ProductMediaDTO => {
  if (!media || typeof media !== 'object') return false;
  const candidate = media as ProductMediaDTO;
  return (
    candidate.type === 'IMAGE' &&
    isNonEmptyString(candidate.mediaId) &&
    isHttpsUrl(candidate.url) &&
    isNonEmptyString(candidate.alt) &&
    isDisplayOrder(candidate.displayOrder)
  );
};

const isValidSpecification = (spec: unknown): spec is TechnicalSpecificationDTO => {
  if (!spec || typeof spec !== 'object') return false;
  const candidate = spec as TechnicalSpecificationDTO;
  return (
    isNonEmptyString(candidate.name) &&
    isNonEmptyString(candidate.value) &&
    isDisplayOrder(candidate.displayOrder) &&
    (candidate.group === undefined || typeof candidate.group === 'string') &&
    (candidate.unit === undefined ||
      candidate.unit === null ||
      typeof candidate.unit === 'string')
  );
};

/**
 * Validación estructural de la respuesta completa del contrato F-011.
 * Si falla, el servicio responde 502 PRODUCT_CATALOG_INVALID_RESPONSE
 * en lugar de mostrar una ficha parcial engañosa.
 *
 * @param {unknown} value - Respuesta a validar
 * @returns {value is ProductDetailResponseDTO}
 */
export function isProductDetailResponse(
  value: unknown,
): value is ProductDetailResponseDTO {
  if (!value || typeof value !== 'object') return false;
  const { data, meta } = value as ProductDetailResponseDTO;
  if (!data || typeof data !== 'object') return false;
  if (!isNonEmptyString(data.productId) || !isNonEmptyString(data.name)) {
    return false;
  }
  if (!isNonEmptyString(data.slug)) return false;
  if (
    !data.brand ||
    !isNonEmptyString(data.brand.brandId) ||
    !isNonEmptyString(data.brand.name)
  ) {
    return false;
  }
  if (
    data.description !== undefined &&
    typeof data.description !== 'string'
  ) {
    return false;
  }
  if (!Array.isArray(data.technicalSpecifications)) return false;
  if (!data.technicalSpecifications.every(isValidSpecification)) return false;
  if (EXCLUDED_COMMERCIAL_FIELDS.some((field) => field in data)) return false;
  if (!Array.isArray(data.media) || data.media.length === 0) return false;
  if (!data.media.every(isValidMedia)) return false;
  if (!meta || !isNonEmptyString(meta.source) || !isNonEmptyString(meta.retrievedAt)) {
    return false;
  }
  return true;
}
