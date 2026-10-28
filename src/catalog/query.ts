import { CatalogError } from "./errors";
import type { CatalogQuery } from "./types";
const allowedKeys = new Set(["q", "page", "pageSize", "categoryIds", "brandIds", "minPrice", "maxPrice", "sort"]);

function identifier(value: string | null): string | undefined {
  if (value === null) return undefined;
  // Published G6 contract accepts one category and one brand, never CSV/local filtering.
  if (!/^[\p{L}\p{N}_-]{1,120}$/u.test(value)) throw new CatalogError("INVALID_FILTER", 400);
  return value;
}

function money(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(value)) throw new CatalogError("INVALID_PRICE_RANGE", 400);
  const amount = Number(value);
  if (!Number.isSafeInteger(Math.round(amount * 100))) throw new CatalogError("INVALID_PRICE_RANGE", 400);
  return amount;
}

function integer(value: string | null, fallback: number, min: number, max: number) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) throw new CatalogError("INVALID_PAGE", 400);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new CatalogError("INVALID_PAGE", 400);
  return parsed;
}

export function parseQuery(params: URLSearchParams): CatalogQuery {
  for (const key of params.keys()) {
    if (!allowedKeys.has(key) || params.getAll(key).length !== 1)
      throw new CatalogError("INVALID_PARAMETERS", 400);
  }
  const q = (params.get("q") || "").trim().replace(/\s+/gu, " ");
  if (q && (Array.from(q).length < 2 || Array.from(q).length > 120))
    throw new CatalogError("INVALID_SEARCH_QUERY", 400);
  const categoryId = identifier(params.get("categoryIds"));
  const brandId = identifier(params.get("brandIds"));
  const minPrice = money(params.get("minPrice"));
  const maxPrice = money(params.get("maxPrice"));
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice)
    throw new CatalogError("INVALID_PRICE_RANGE", 400);
  const sort = params.get("sort") || undefined;
  if (sort !== undefined && sort !== "NAME_ASC" && sort !== "NAME_DESC")
    throw new CatalogError("INVALID_SORT", 400);
  return {
    q,
    page: integer(params.get("page"), 0, 0, 1000000),
    pageSize: integer(params.get("pageSize"), 24, 1, 48),
    categoryId,
    brandId,
    minPrice,
    maxPrice,
    sort,
  };
}
