/**
 * Validación compartida del slug de producto.
 *
 * Es el mismo patrón canónico de F-011 y del proxy del frontend:
 * minúsculas, dígitos y guiones simples, 1–120 caracteres.
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md
 * @see SPECS/contrato-api/F-012-precio-oferta-descuento.md
 * @see SPECS/contrato-api/F-013-seleccion-atributos-variante.md
 */

export const PRODUCT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
export const PRODUCT_SLUG_MAX_LENGTH = 120;

export interface ProductSlugValidation {
  valid: boolean;
  error?: string;
}

export function validateProductSlug(slug: string): ProductSlugValidation {
  if (!slug || typeof slug !== 'string') {
    return { valid: false, error: 'El slug es requerido' };
  }
  if (slug.length > PRODUCT_SLUG_MAX_LENGTH) {
    return {
      valid: false,
      error: `El slug excede la longitud máxima de ${PRODUCT_SLUG_MAX_LENGTH} caracteres`,
    };
  }
  if (!PRODUCT_SLUG_PATTERN.test(slug)) {
    return {
      valid: false,
      error:
        'El slug tiene formato inválido. Solo se permiten minúsculas, dígitos y guiones',
    };
  }
  return { valid: true };
}

/**
 * Normaliza el `sku` opcional de query:
 * - ausente o vacío/espacios → `undefined` (el servicio decide si es requerido);
 * - presente → valor sin espacios laterales.
 */
export function normalizeOptionalSku(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
