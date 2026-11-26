import { createG6Client } from './g6-client';
import { CatalogError } from './errors';
import { CatalogException, ERROR_CODES } from './product-detail.errors';
import { isProductDetailResponse, type ProductDetailResponseDTO, type TechnicalSpecificationDTO } from './product-detail.dto';
import type { CatalogEnvironment, CatalogFetch } from './types';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const invalid = () => new CatalogException(502, ERROR_CODES.PRODUCT_CATALOG_INVALID_RESPONSE, 'Respuesta del catálogo fuera de contrato');

/** Project only F-011 fields. Never invent values for unresolved characteristic IDs. */
export function projectProductDetail(payload: unknown, slug: string, mediaHosts: Set<string>): ProductDetailResponseDTO {
  if (!record(payload) || !text(payload.product_id) || payload.slug !== slug || !text(payload.name) ||
      !record(payload.marca) || !text(payload.marca.marca_id) || !text(payload.marca.name) ||
      payload.marca.marca_id !== payload.marca_id ||
      (payload.description !== undefined && payload.description !== null && typeof payload.description !== 'string') ||
      !Array.isArray(payload.images) || payload.images.length === 0 ||
      (payload.attributes !== undefined && !Array.isArray(payload.attributes))) throw invalid();
  if (payload.status !== undefined && payload.status !== 'ACTIVO') {
    if (payload.status === 'INACTIVO' || payload.status === 'BORRADOR')
      throw new CatalogException(404, ERROR_CODES.PRODUCT_NOT_AVAILABLE, 'Producto no disponible');
    throw invalid();
  }
  const urls = new Set<string>();
  const media = payload.images.map((value: unknown, index: number) => {
    if (!text(value)) throw invalid();
    let url: URL;
    try { url = new URL(value); } catch { throw invalid(); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || !mediaHosts.has(url.hostname) || urls.has(url.href)) throw invalid();
    urls.add(url.href);
    return { mediaId: `${payload.product_id}:image:${index}`, type: 'IMAGE' as const,
      url: url.href, alt: `${payload.name} — imagen ${index + 1}`, displayOrder: index };
  });
  const specifications: TechnicalSpecificationDTO[] = [];
  for (const attribute of (payload.attributes ?? []) as unknown[]) {
    if (!record(attribute) || !text(attribute.nombre) || !Object.prototype.hasOwnProperty.call(attribute, 'valor')) throw invalid();
    const value = attribute.valor;
    // G6 currently also returns {valor_id}. Those references have no display value.
    if (typeof value === 'string' && value.trim().length > 0 ||
        typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean') {
      specifications.push({ name: attribute.nombre, value: String(value), displayOrder: specifications.length });
    }
  }
  const response: ProductDetailResponseDTO = {
    data: { productId: payload.product_id, slug, name: payload.name,
      brand: { brandId: payload.marca.marca_id, name: payload.marca.name },
      ...(typeof payload.description === 'string' ? { description: payload.description } : {}),
      media, technicalSpecifications: specifications },
    meta: { source: 'REAL', retrievedAt: new Date().toISOString() },
  };
  if (!isProductDetailResponse(response)) throw invalid();
  return response;
}

export async function realProductDetail(slug: string, env: CatalogEnvironment = process.env,
  fetchImpl: CatalogFetch = fetch, requestId?: string,
  createClient: () => ReturnType<typeof createG6Client> = () => createG6Client(env, fetchImpl),
): Promise<ProductDetailResponseDTO> {
  try {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120)
      throw new CatalogException(400, ERROR_CODES.INVALID_PRODUCT_SLUG, 'Slug inválido');
    if (env.CATALOG_SOURCE !== 'real' || env.BFF_MODE !== 'real')
      throw new CatalogException(503, ERROR_CODES.PRODUCT_CATALOG_UNAVAILABLE, 'Integración no configurada');
    const client = createClient();
    const payload = await client.get(`/api/v1/productos/por-slug/${encodeURIComponent(slug)}?canal=MARKETPLACE`,
      requestId, { allowProductNotFound: true });
    if (payload === null) throw new CatalogException(404, ERROR_CODES.PRODUCT_NOT_AVAILABLE, 'Producto no disponible');
    return projectProductDetail(payload, slug, client.mediaHosts);
  } catch (error) {
    if (error instanceof CatalogException) throw error;
    if (error instanceof CatalogError && error.code === 'CATALOG_TIMEOUT')
      throw new CatalogException(504, ERROR_CODES.PRODUCT_CATALOG_TIMEOUT, 'Timeout del catálogo');
    if (error instanceof CatalogError && error.diagnostic === 'PROVIDER_INVALID_JSON') throw invalid();
    throw new CatalogException(503, ERROR_CODES.PRODUCT_CATALOG_UNAVAILABLE, 'Servicio de catálogo no disponible');
  }
}
