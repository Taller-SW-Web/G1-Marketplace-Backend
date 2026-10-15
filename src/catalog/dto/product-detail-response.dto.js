/**
 * DTOs de respuesta para F-011 — Detalle de Producto (BFF)
 *
 * Contrato de respuesta del endpoint GET /api/v1/catalog/products/:slug
 * Estos objetos definen la estructura exacta de la respuesta JSON.
 *
 * ⚠️ MOCK — H3: datos provienen de fixtures hasta que I-01 se cierre.
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md
 */

/**
 * Crea un objeto ProductBrandDTO validado.
 * @param {Object} params
 * @param {string} params.brandId
 * @param {string} params.name
 * @returns {{ brandId: string, name: string }}
 */
function createProductBrandDTO({ brandId, name }) {
  if (!brandId || typeof brandId !== 'string') {
    throw new Error('ProductBrandDTO: brandId es requerido y debe ser string');
  }
  if (!name || typeof name !== 'string') {
    throw new Error('ProductBrandDTO: name es requerido y debe ser string');
  }
  return { brandId, name };
}

/**
 * Crea un objeto ProductMediaDTO validado.
 * @param {Object} params
 * @param {string} params.mediaId
 * @param {'IMAGE'} params.type
 * @param {string} params.url
 * @param {string} params.alt - BFF genera fallback si falta en origen
 * @param {number} params.displayOrder
 * @returns {{ mediaId: string, type: 'IMAGE', url: string, alt: string, displayOrder: number }}
 */
function createProductMediaDTO({ mediaId, type, url, alt, displayOrder }) {
  if (!mediaId || typeof mediaId !== 'string') {
    throw new Error('ProductMediaDTO: mediaId es requerido');
  }
  if (type !== 'IMAGE') {
    throw new Error('ProductMediaDTO: type debe ser "IMAGE"');
  }
  if (!url || typeof url !== 'string') {
    throw new Error('ProductMediaDTO: url es requerido');
  }
  // BFF genera fallback de alt si falta en origen
  const resolvedAlt = alt || `Imagen del producto ${mediaId}`;
  if (typeof displayOrder !== 'number') {
    throw new Error('ProductMediaDTO: displayOrder es requerido y debe ser number');
  }
  return { mediaId, type, url, alt: resolvedAlt, displayOrder };
}

/**
 * Crea un objeto TechnicalSpecificationDTO validado.
 * @param {Object} params
 * @param {string} [params.group]
 * @param {string} params.name
 * @param {string} params.value
 * @param {string|null} [params.unit]
 * @param {number} params.displayOrder
 * @returns {{ group?: string, name: string, value: string, unit?: string|null, displayOrder: number }}
 */
function createTechnicalSpecificationDTO({ group, name, value, unit, displayOrder }) {
  if (!name || typeof name !== 'string') {
    throw new Error('TechnicalSpecificationDTO: name es requerido');
  }
  if (!value || typeof value !== 'string') {
    throw new Error('TechnicalSpecificationDTO: value es requerido');
  }
  if (typeof displayOrder !== 'number') {
    throw new Error('TechnicalSpecificationDTO: displayOrder es requerido y debe ser number');
  }
  const dto = { name, value, displayOrder };
  if (group) dto.group = group;
  if (unit !== undefined) dto.unit = unit;
  return dto;
}

/**
 * Crea un objeto ProductDetailDTO validado.
 * @param {Object} params
 * @param {string} params.productId
 * @param {string} params.slug
 * @param {string} params.name
 * @param {Object} params.brand
 * @param {string} [params.description]
 * @param {Array} params.technicalSpecifications
 * @param {Array} params.media - nunca vacío para producto activo
 * @returns {Object}
 */
function createProductDetailDTO({ productId, slug, name, brand, description, technicalSpecifications, media }) {
  if (!productId || typeof productId !== 'string') {
    throw new Error('ProductDetailDTO: productId es requerido');
  }
  if (!slug || typeof slug !== 'string') {
    throw new Error('ProductDetailDTO: slug es requerido');
  }
  if (!name || typeof name !== 'string') {
    throw new Error('ProductDetailDTO: name es requerido');
  }
  if (!brand) {
    throw new Error('ProductDetailDTO: brand es requerido');
  }
  if (!Array.isArray(media) || media.length === 0) {
    throw new Error('ProductDetailDTO: media no puede estar vacío para producto activo');
  }
  if (!Array.isArray(technicalSpecifications)) {
    throw new Error('ProductDetailDTO: technicalSpecifications debe ser un array');
  }

  const dto = {
    productId,
    slug,
    name,
    brand: createProductBrandDTO(brand),
    technicalSpecifications: technicalSpecifications.map(createTechnicalSpecificationDTO),
    media: media.map(createProductMediaDTO),
  };
  if (description) dto.description = description;
  return dto;
}

/**
 * Crea un objeto ProductDetailResponseDTO validado.
 * @param {Object} params
 * @param {Object} params.data
 * @param {{ source: string, retrievedAt: string }} params.meta
 * @returns {{ data: Object, meta: { source: string, retrievedAt: string } }}
 */
function createProductDetailResponseDTO({ data, meta }) {
  if (!data) {
    throw new Error('ProductDetailResponseDTO: data es requerido');
  }
  if (!meta || !meta.source || !meta.retrievedAt) {
    throw new Error('ProductDetailResponseDTO: meta con source y retrievedAt es requerido');
  }
  return {
    data: createProductDetailDTO(data),
    meta: { source: meta.source, retrievedAt: meta.retrievedAt },
  };
}

module.exports = {
  createProductBrandDTO,
  createProductMediaDTO,
  createTechnicalSpecificationDTO,
  createProductDetailDTO,
  createProductDetailResponseDTO,
};
