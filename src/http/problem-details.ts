/**
 * Sobre uniforme de error `application/problem+json` (RFC 9457) exigido por
 * el contrato API F-011 v1 §4:
 *
 *   { type, title, status, code, instance, requestId }
 *
 * `detail` es opcional (RFC 9457) y sólo se llena con mensajes propios de
 * Marketplace; nunca con mensajes del proveedor, trazas ni URLs internas.
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md
 */

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  instance: string;
  requestId: string;
}

/** Base de identificadores `type` (ejemplo canónico del contrato §4). */
const PROBLEM_TYPE_BASE = 'https://marketplace.example.com/problems';

/** Títulos visibles por código del contrato F-011. */
const TITLES: Record<string, string> = {
  INVALID_PRODUCT_SLUG: 'El slug no cumple el formato definido.',
  PRODUCT_NOT_AVAILABLE: 'Producto no disponible',
  PRODUCT_CATALOG_INVALID_RESPONSE: 'Respuesta inválida del catálogo.',
  PRODUCT_CATALOG_UNAVAILABLE: 'El catálogo no está disponible.',
  PRODUCT_CATALOG_TIMEOUT: 'El catálogo tardó demasiado en responder.',
};

const DEFAULT_TITLE = 'No pudimos procesar la solicitud.';

/** Identificador `type` del problema: base + código en kebab-case. */
export function problemType(code: string): string {
  const slug = code.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
  return `${PROBLEM_TYPE_BASE}/${slug || 'catalog-error'}`;
}

/** Título visible: mapeo por código del contrato con fallback genérico. */
export function problemTitle(code: string): string {
  return TITLES[code] ?? DEFAULT_TITLE;
}

/** Construye el sobre Problem Details completo. */
export function buildProblemDetails(input: {
  status: number;
  code: string;
  instance: string;
  requestId: string;
  detail?: string;
}): ProblemDetails {
  const problem: ProblemDetails = {
    type: problemType(input.code),
    title: problemTitle(input.code),
    status: input.status,
    code: input.code,
    instance: input.instance,
    requestId: input.requestId,
  };
  if (input.detail) problem.detail = input.detail;
  return problem;
}
