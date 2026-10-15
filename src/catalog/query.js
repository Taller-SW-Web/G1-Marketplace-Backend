const { CatalogError } = require("./errors");
const allowedKeys = new Set(["q", "page", "pageSize", "categoryIds", "sort"]);

function integer(value, fallback, min, max) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) throw new CatalogError("INVALID_PAGE", 400);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new CatalogError("INVALID_PAGE", 400);
  return parsed;
}

function parseQuery(params) {
  for (const key of params.keys()) {
    if (!allowedKeys.has(key) || params.getAll(key).length !== 1)
      throw new CatalogError("INVALID_PARAMETERS", 400);
  }
  const q = (params.get("q") || "").trim().replace(/\s+/gu, " ");
  if (q && (Array.from(q).length < 2 || Array.from(q).length > 120))
    throw new CatalogError("INVALID_SEARCH_QUERY", 400);
  const categoryId = params.get("categoryIds") || undefined;
  // G6 currently publishes a single categoriaId; never filter an incomplete page locally.
  if (categoryId && !/^[\p{L}\p{N}_-]{1,120}$/u.test(categoryId))
    throw new CatalogError("INVALID_FILTER", 400);
  const sort = params.get("sort") || undefined;
  if (sort && !["NAME_ASC", "NAME_DESC"].includes(sort))
    throw new CatalogError("INVALID_SORT", 400);
  return {
    q,
    page: integer(params.get("page"), 0, 0, 1000000),
    pageSize: integer(params.get("pageSize"), 24, 1, 48),
    categoryId,
    sort,
  };
}

module.exports = { parseQuery };
