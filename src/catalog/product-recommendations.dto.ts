/**
 * DTOs y guardia del contrato BFF F-015 — Productos relacionados.
 *
 * El BFF entrega como máximo 8 tarjetas completas, activas y deduplicadas.
 * Los candidatos que no se pueden enriquecer se omiten; un fallo técnico se
 * degrada a arreglo vacío para no bloquear la ficha.
 *
 * ⚠️ MOCK — H3/H4: datos desde fixtures hasta cerrar I-01.
 *
 * @see SPECS/contrato-api/F-015-productos-relacionados.md
 */

export type RecommendationType = 'CROSS_SELL' | 'UPSELL';

export interface RecommendationPriceDTO {
  amount: number;
  currency: string;
}

export interface RecommendationImageDTO {
  url: string;
  alt: string;
}

export interface RecommendationCardDTO {
  productId: string;
  slug: string;
  name: string;
  image: RecommendationImageDTO;
  type: RecommendationType;
  price: RecommendationPriceDTO | null;
  presentationOrder: number;
}

export interface RecommendationsResponseDTO {
  data: RecommendationCardDTO[];
  meta: { sourceProductId: string };
}

export const MAX_RECOMMENDATIONS = 8;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const HTTPS_URL = /^https:\/\/\S+$/u;
const ISO_4217 = /^[A-Z]{3}$/u;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isPositiveAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isRecommendationType = (value: unknown): value is RecommendationType =>
  value === 'CROSS_SELL' || value === 'UPSELL';

/**
 * Tarjeta comercial completa: slug canónico, nombre, imagen HTTPS y precio
 * opcional (nunca cero por ausencia). Los campos de stock no se aceptan.
 */
export function isRecommendationCard(
  value: unknown,
): value is RecommendationCardDTO {
  if (!value || typeof value !== 'object') return false;
  const card = value as RecommendationCardDTO;
  if (!isNonEmptyString(card.productId)) return false;
  if (
    !isNonEmptyString(card.slug) ||
    !SLUG_PATTERN.test(card.slug) ||
    card.slug.length > 120
  ) {
    return false;
  }
  if (!isNonEmptyString(card.name)) return false;
  if (
    !card.image ||
    !isNonEmptyString(card.image.url) ||
    !HTTPS_URL.test(card.image.url) ||
    !isNonEmptyString(card.image.alt)
  ) {
    return false;
  }
  if (!isRecommendationType(card.type)) return false;
  if (!Number.isInteger(card.presentationOrder) || card.presentationOrder < 0) {
    return false;
  }
  if (card.price !== null) {
    if (!card.price || typeof card.price !== 'object') return false;
    if (!isPositiveAmount(card.price.amount)) return false;
    if (
      typeof card.price.currency !== 'string' ||
      !ISO_4217.test(card.price.currency)
    ) {
      return false;
    }
  }
  if ('stock' in card || 'availability' in card) return false;
  return true;
}

/**
 * Guardia del arreglo público: máximo 8, sin duplicados de `productId` ni
 * `slug` y sin el producto de origen (API-CA-F015-01).
 */
export function isRecommendationsResponse(
  value: unknown,
): value is RecommendationsResponseDTO {
  if (!value || typeof value !== 'object') return false;
  const { data, meta } = value as RecommendationsResponseDTO;
  if (!Array.isArray(data) || data.length > MAX_RECOMMENDATIONS) return false;
  if (!meta || !isNonEmptyString(meta.sourceProductId)) return false;

  const productIds = new Set<string>();
  const slugs = new Set<string>();
  for (const card of data) {
    if (!isRecommendationCard(card)) return false;
    if (card.productId === meta.sourceProductId) return false;
    if (productIds.has(card.productId) || slugs.has(card.slug)) return false;
    productIds.add(card.productId);
    slugs.add(card.slug);
  }
  return true;
}
