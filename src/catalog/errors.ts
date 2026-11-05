export class CatalogError extends Error {
  constructor(public readonly code = "CATALOG_UNAVAILABLE", public readonly status = 503, public readonly diagnostic = code) {
    super(code);
  }
}

export function problem(error: CatalogError, requestId: string) {
  const messages: Record<string, string> = {
    INVALID_SEARCH_QUERY: "Escribe entre 2 y 120 caracteres para buscar.",
    INVALID_PAGE: "Selecciona una página y un tamaño válidos.",
    INVALID_SORT: "Selecciona un orden permitido.",
    INVALID_FILTER: "Revisa la categoría o marca seleccionada.",
    INVALID_PRICE_RANGE: "Revisa el rango de precios en soles.",
    INVALID_PARAMETERS: "Revisa los criterios de búsqueda.",
    CATALOG_UNAVAILABLE: "No pudimos cargar el catálogo. Inténtalo nuevamente.",
    CATALOG_TIMEOUT: "El catálogo tardó demasiado en responder. Inténtalo nuevamente.",
    METHOD_NOT_ALLOWED: "Esta operación no está disponible.",
    NOT_FOUND: "No encontramos este recurso.",
    ORIGIN_NOT_ALLOWED: "Este origen no está permitido.",
  };
  return {
    type: "about:blank",
    title: messages[error.code] || messages.CATALOG_UNAVAILABLE,
    status: error.status,
    code: error.code,
    requestId,
  };
}
