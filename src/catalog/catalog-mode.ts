/**
 * Origen de datos del catálogo BFF.
 *
 * Existe un único predicado para decidir si la petición se sirve contra G6
 * (REAL) o contra fixtures (MOCK). Servicios, adaptadores y la cabecera
 * `X-Catalog-Source` deben usar esta misma función: si divergen, una
 * configuración mixta puede devolver fixtures etiquetados como REAL.
 *
 * La selección REAL siempre gana. Ante una configuración ambigua se falla
 * cerrado: los servicios sin adaptador homologado responden 503 en lugar de
 * publicar datos de demostración como si fueran del proveedor.
 */

export interface CatalogModeEnv {
  CATALOG_SOURCE?: string;
  BFF_MODE?: string;
  PRODUCTOS_AUTH_MODE?: string;
}

/**
 * `true` cuando la petición debe tratarse como REAL.
 *
 * - `CATALOG_SOURCE=real` es la selección explícita del catálogo.
 * - Los modos de autenticación `public-read-only` y `client-credentials`
 *   sólo operan contra G6.
 * - `BFF_MODE` distinto de `mock` es el interruptor histórico del corte H4.
 */
export function isRealCatalogSource(env: CatalogModeEnv = process.env): boolean {
  return (
    env.CATALOG_SOURCE === 'real' ||
    ['public-read-only', 'client-credentials'].includes(
      env.PRODUCTOS_AUTH_MODE ?? '',
    ) ||
    (env.BFF_MODE ?? 'mock') !== 'mock'
  );
}
