import { BffCatalogException } from './bff-catalog.exception';
import { CatalogError } from './errors';
import { createG6Client } from './g6-client';
import { isProductVariantsResponse, type ProductVariantsResponseDTO } from './product-variants.dto';
import { VARIANT_ERROR_CODES as codes } from './product-variants.errors';
import type { CatalogEnvironment, CatalogFetch } from './types';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const invalid = () => new BffCatalogException(502, codes.CATALOG_INVALID_RESPONSE, 'Respuesta de variantes fuera de contrato');
const missing = () => new BffCatalogException(404, codes.PRODUCT_NOT_AVAILABLE, 'Producto no disponible');

/** Reuse the commercial detail projection; never derive Color/Talla from SKU or IDs. */
export function projectProductVariants(payload: unknown, slug: string, mediaHosts: Set<string>): ProductVariantsResponseDTO {
  if (!record(payload) || !text(payload.product_id) || payload.slug !== slug ||
      typeof payload.tiene_variantes !== 'boolean' || !Array.isArray(payload.variants)) throw invalid();
  if (payload.status !== undefined && payload.status !== 'ACTIVO') {
    if (['BORRADOR', 'INACTIVO'].includes(String(payload.status))) throw missing();
    throw invalid();
  }
  if (!payload.tiene_variantes) {
    if (payload.variants.length !== 0) throw invalid();
    return { data: { productId: payload.product_id, hasVariants: false, attributes: [], variants: [] } };
  }
  const groups = new Map<string, { id: string; label: string; values: Map<string, { id: string; label: string }> }>();
  const variants = payload.variants.flatMap(raw => {
    if (!record(raw)) throw invalid();
    // Commercial DTO omits state; the public commercial route owns eligibility.
    // An explicit inactive/draft state is never exposed if supplied by the provider.
    const state = raw.status ?? raw.estado;
    if (state !== undefined && !['ACTIVE', 'ACTIVA'].includes(String(state))) {
      if (['DRAFT', 'BORRADOR', 'INACTIVE', 'INACTIVA'].includes(String(state))) return [];
      throw invalid();
    }
    if (!text(raw.variant_id) || !text(raw.sku) || !Array.isArray(raw.identifying_attributes) ||
        raw.identifying_attributes.length === 0 || (raw.images !== undefined && !Array.isArray(raw.images))) throw invalid();
    const attributes: Record<string, string> = Object.create(null);
    for (const attribute of raw.identifying_attributes) {
      if (!record(attribute) || !text(attribute.caracteristica_id) || !text(attribute.nombre) ||
          !text(attribute.valor_id) || Object.hasOwn(attributes, attribute.caracteristica_id)) throw invalid();
      const value = attribute.valor;
      let label: string;
      if (record(value) && text(value.nombre) && value.valor_id === attribute.valor_id) label = value.nombre;
      else if (text(value) || typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean') label = String(value);
      else throw invalid();
      let group = groups.get(attribute.caracteristica_id);
      if (!group) {
        group = { id: attribute.caracteristica_id, label: attribute.nombre, values: new Map() };
        groups.set(group.id, group);
      }
      if (group.label !== attribute.nombre ||
          group.values.has(attribute.valor_id) && group.values.get(attribute.valor_id)!.label !== label) throw invalid();
      group.values.set(attribute.valor_id, { id: attribute.valor_id, label });
      attributes[group.id] = attribute.valor_id;
    }
    const images = (raw.images ?? []) as unknown[];
    for (const image of images) {
      if (!text(image)) throw invalid();
      let url: URL;
      try { url = new URL(image); } catch { throw invalid(); }
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || !mediaHosts.has(url.hostname)) throw invalid();
    }
    return [{ variantId: raw.variant_id, sku: raw.sku, status: 'ACTIVE' as const, attributes,
      image: images.length ? { url: String(images[0]), alt: text(payload.name) ? payload.name : raw.sku } : null }];
  });
  if (!variants.length) throw missing();
  const response = { data: { productId: payload.product_id, hasVariants: true,
    attributes: [...groups.values()].map(group => ({ id: group.id, label: group.label, values: [...group.values.values()] })), variants } };
  if (!isProductVariantsResponse(response)) throw invalid();
  return response;
}

export async function realProductVariants(slug: string, env: CatalogEnvironment = process.env,
  fetchImpl: CatalogFetch = fetch, requestId?: string,
  createClient: () => ReturnType<typeof createG6Client> = () => createG6Client(env, fetchImpl),
): Promise<ProductVariantsResponseDTO> {
  try {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120)
      throw new BffCatalogException(400, codes.INVALID_PRODUCT_SLUG, 'Slug inválido');
    if (env.CATALOG_SOURCE !== 'real' || env.BFF_MODE !== 'real')
      throw new BffCatalogException(503, codes.CATALOG_UNAVAILABLE, 'Integración no configurada');
    const client = createClient();
    const payload = await client.get(`/api/v1/productos/por-slug/${encodeURIComponent(slug)}?canal=MARKETPLACE`,
      requestId, { allowProductNotFound: true });
    if (payload === null) throw missing();
    return projectProductVariants(payload, slug, client.mediaHosts);
  } catch (error) {
    if (error instanceof BffCatalogException) throw error;
    if (error instanceof CatalogError && error.code === 'CATALOG_TIMEOUT')
      throw new BffCatalogException(504, codes.CATALOG_TIMEOUT, 'Timeout de variantes');
    if (error instanceof CatalogError && error.diagnostic === 'PROVIDER_INVALID_JSON') throw invalid();
    throw new BffCatalogException(503, codes.CATALOG_UNAVAILABLE, 'No pudimos consultar las variantes');
  }
}
