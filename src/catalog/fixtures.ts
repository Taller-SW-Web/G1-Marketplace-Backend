import type { CatalogProvider, Category, ProductCardDTO } from "./types";
import { CatalogError } from './errors';
// Synthetic fixtures only. Never used as a fallback for a failed real provider.
const categories: Category[] = [
  { categoryId: "running", name: "Running" },
  { categoryId: "training", name: "Entrenamiento" },
  { categoryId: "outdoor", name: "Aire libre" },
];
const names = [
  "Zapatillas de running",
  "Polo de entrenamiento",
  "Mochila deportiva",
  "Short de running",
];
const products: ProductCardDTO[] = Array.from({ length: 32 }, (_, i) => ({
  productId: `mock-product-${i + 1}`,
  slug: `producto-demostracion-${i + 1}`,
  name: `${names[i % names.length]} ${String(i + 1).padStart(2, "0")}`,
  categoryId: categories[i % categories.length].categoryId,
  brandId: "mock-brand",
  image: {
    url: `/fixtures/product-${i % 4}.svg`,
    alt: `${names[i % names.length]} de demostración`,
  },
}));

export function createMockProvider(): CatalogProvider {
  return {
    source: "MOCK",
    async home() {
      return { categories, featuredProducts: [] };
    },
    async filters() {
      return { categories, brands: [{ brandId: 'mock-brand', name: 'Marca de demostración' }] };
    },
    async search(query) {
      if (query.categoryId && !categories.some(item => item.categoryId === query.categoryId) ||
          query.brandId && query.brandId !== 'mock-brand') throw new CatalogError('INVALID_FILTER', 400);
      // Prices here are synthetic test data, never projected as commercial amounts.
      const fixturePrice = (product: ProductCardDTO) => 10 * Number(product.productId.replace('mock-product-', ''));
      let results = products.filter(
        (product) =>
          (!query.q ||
            product.name
              .toLocaleLowerCase("es-PE")
              .includes(query.q.toLocaleLowerCase("es-PE"))) &&
          (!query.categoryId || product.categoryId === query.categoryId) &&
          (!query.brandId || product.brandId === query.brandId) &&
          (query.minPrice === undefined || fixturePrice(product) >= query.minPrice) &&
          (query.maxPrice === undefined || fixturePrice(product) <= query.maxPrice),
      );
      if (query.sort)
        results = [...results].sort(
          (a, b) =>
            (a.name.localeCompare(b.name, "es") ||
              a.productId.localeCompare(b.productId)) *
            (query.sort === "NAME_DESC" ? -1 : 1),
        );
      const totalElements = results.length;
      return {
        sort: query.sort ?? null,
        data: results.slice(
          query.page * query.pageSize,
          (query.page + 1) * query.pageSize,
        ),
        page: {
          number: query.page,
          size: query.pageSize,
          totalElements,
          totalPages: Math.ceil(totalElements / query.pageSize),
        },
      };
    },
  };
}
