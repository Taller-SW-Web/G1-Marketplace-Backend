class CatalogError extends Error {
  constructor(code = "CATALOG_UNAVAILABLE", status = 503, diagnostic = code) {
    super(code);
    this.code = code;
    this.status = status;
    this.diagnostic = diagnostic;
  }
}

function problem(error, requestId) {
  const messages = {
    INVALID_SEARCH_QUERY: "Escribe entre 2 y 120 caracteres para buscar.",
    INVALID_PAGE: "Selecciona una página y un tamaño válidos.",
    INVALID_SORT: "Selecciona un orden permitido.",
    INVALID_FILTER: "Revisa la categoría seleccionada.",
    INVALID_PARAMETERS: "Revisa los criterios de búsqueda.",
    CATALOG_UNAVAILABLE: "No pudimos cargar el catálogo. Inténtalo nuevamente.",
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

module.exports = { CatalogError, problem };
