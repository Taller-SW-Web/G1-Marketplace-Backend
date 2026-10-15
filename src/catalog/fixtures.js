// Synthetic fixtures only. Never used as a fallback for a failed real provider.
const categories = [
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
const products = Array.from({ length: 32 }, (_, i) => ({
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

function createMockProvider() {
  return {
    source: "MOCK",
    async home() {
      return { categories, featuredProducts: [] };
    },
    async search(query) {
      let results = products.filter(
        (product) =>
          (!query.q ||
            product.name
              .toLocaleLowerCase("es-PE")
              .includes(query.q.toLocaleLowerCase("es-PE"))) &&
          (!query.categoryId || product.categoryId === query.categoryId),
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

module.exports = { createMockProvider };
