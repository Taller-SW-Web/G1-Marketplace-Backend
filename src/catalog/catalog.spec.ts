import assert from "node:assert/strict";
import * as http from "node:http";
import { once } from "node:events";
import { parseQuery } from "./query";
import { createProvider, createRealProvider, CONTRACT_SHA } from "./provider";
import type { CatalogEnvironment } from "./types";
const parse = (value: string) => parseQuery(new URLSearchParams(value));
const env: CatalogEnvironment = {
  CATALOG_SOURCE: "real",
  CATALOG_INTEGRATION_APPROVED: "true",
  PRODUCTOS_BASE_URL: "https://provider.example",
  PRODUCTOS_SERVICE_TOKEN: "synthetic-test-token",
  PRODUCTOS_CONTRACT_VERSION: "0.6.0-rc.1",
  PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA,
  PRODUCTOS_MEDIA_HOSTS: "images.example",
};
const product: Record<string, unknown> = {
  product_id: "p1",
  name: "Zapatillas",
  slug: "zapatillas",
  categoria_id: "running",
  marca_id: "b1",
  images: ["https://images.example/p1.jpg"],
  catalog_version: 42,
  pricing_preparado: true,
  perfil_fisico: "private",
};
const pagePayload = (items: Record<string, unknown>[] = [product]) => ({
  items,
  pagina: 1,
  tamanio: 24,
  total: items.length,
});

test("real provider rejects a different contract revision or a non-origin base URL", () => {
  for (const overrides of [
    { PRODUCTOS_CONTRACT_SHA: "unreviewed-revision" },
    { PRODUCTOS_CONTRACT_VERSION: "0.5.0" },
    { PRODUCTOS_BASE_URL: "https://provider.example/api/v1" },
  ])
    assert.throws(() => createRealProvider({ ...env, ...overrides }), {
      code: "CATALOG_UNAVAILABLE",
    });
});

test("actual HTTP timeout aborts a slow local provider", async () => {
  const upstream = http.createServer((_req, res) => {
    const timer = setTimeout(() => {
      if (!res.destroyed) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(pagePayload()));
      }
    }, 250);
    timer.unref();
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const address = upstream.address();
  assert.ok(address && typeof address !== "string");
  const provider = createRealProvider({
    ...env,
    NODE_ENV: "development",
    PRODUCTOS_TIMEOUT_MS: "100",
    PRODUCTOS_BASE_URL: `http://127.0.0.1:${address.port}`,
  });
  try {
    await assert.rejects(provider.search(parse("q=polo"), "test-correlation"), {
      diagnostic: "PROVIDER_TIMEOUT", status: 503,
    });
  } finally {
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

for (const length of [1, 121])
  test(`q length ${length} is rejected`, () =>
    assert.throws(() => parse(`q=${"a".repeat(length)}`), {
      code: "INVALID_SEARCH_QUERY",
    }));
for (const length of [2, 120])
  test(`q length ${length} is accepted`, () =>
    assert.equal(parse(`q=${"a".repeat(length)}`).q.length, length));
test("spaces normalize; empty q is catalog", () => {
  assert.equal(parse("q=++polo+++running++").q, "polo running");
  assert.equal(parse("q=+++").q, "");
});
for (const query of [
  "page=-1",
  "page=1.5",
  "page=1e2",
  "pageSize=0",
  "pageSize=49",
  "pageSize=999999999999999999999",
]) {
  test(`invalid pagination ${query}`, () =>
    assert.throws(() => parse(query), { code: "INVALID_PAGE" }));
}
test("pagination defaults and boundaries", () => {
  assert.equal(parse("").pageSize, 24);
  assert.equal(parse("pageSize=48&page=1").page, 1);
});
test("unknown/duplicate/admin criteria rejected", () => {
  for (const query of [
    "estado=INACTIVO",
    "q=polo&q=running",
    "categoryIds=a,b",
  ])
    assert.throws(() => parse(query));
});
test("unpublished sort never reaches provider", () =>
  assert.throws(() => parse("sort=PRICE_ASC"), { code: "INVALID_SORT" }));
test("mock requires explicit opt-in and is forbidden in production", () => {
  assert.equal(createProvider({}).source, "UNCONFIGURED");
  assert.throws(() =>
    createProvider({ CATALOG_SOURCE: "mock", NODE_ENV: "production" }),
  );
});
test("real mode requires approval, token and pinned contract", async () => {
  for (const key of [
    "CATALOG_INTEGRATION_APPROVED",
    "PRODUCTOS_SERVICE_TOKEN",
    "PRODUCTOS_CONTRACT_SHA",
  ]) {
    const config = { ...env };
    delete config[key];
    await assert.rejects(createProvider(config).search(parse("q=polo")), {
      code: "CATALOG_UNAVAILABLE",
    });
  }
});
test("provider maps one-based page, canal, category and name order; projects public fields only", async () => {
  let seen!: { url: URL; options: RequestInit };
  const provider = createRealProvider(env, async (url, options) => {
    seen = { url, options };
    return Response.json({ ...pagePayload(), pagina: 2, total: 25 });
  });
  const result = await provider.search(
    parse("q=polo&page=1&categoryIds=running&sort=NAME_DESC"),
    "correlation-test",
  );
  assert.equal(seen.url.searchParams.get("pagina"), "2");
  assert.equal(seen.url.searchParams.get("tamanio"), "24");
  assert.equal(seen.url.searchParams.get("canal"), "MARKETPLACE");
  assert.equal(seen.url.searchParams.get("categoriaId"), "running");
  assert.equal(seen.url.searchParams.get("orden"), "NOMBRE_DESC");
  assert.equal(new Headers(seen.options.headers).get("X-Correlation-Id"), "correlation-test");
  assert.equal(
    new Headers(seen.options.headers).get("Authorization"),
    "Bearer synthetic-test-token",
  );
  assert.equal(result.page.number, 1);
  assert.deepEqual(Object.keys(result.data[0]).sort(), [
    "brandId",
    "categoryId",
    "image",
    "name",
    "productId",
    "slug",
  ]);
});
test("home includes only active categories and no invented featured products", async () => {
  const provider = createRealProvider(env, async () =>
    Response.json({
      categories: [
        { categoria_id: "active", name: "Running", status: "ACTIVA" },
        { categoria_id: "hidden", name: "Private", status: "INACTIVA" },
      ],
    }),
  );
  expect(await provider.home("id")).toEqual({
    categories: [{ categoryId: "active", name: "Running" }],
    featuredProducts: [],
  });
});
test("valid empty pages stay empty", async () => {
  const provider = createRealProvider(env, async () =>
    Response.json(pagePayload([])),
  );
  assert.equal((await provider.search(parse("q=zz"))).data.length, 0);
});
for (const status of [401, 403, 429, 500, 503])
  test(`provider ${status} becomes safe catalog 503, not empty or user logout`, async () => {
    const provider = createRealProvider(
      env,
      async () => new Response("secret upstream error", { status }),
    );
    await assert.rejects(provider.search(parse("q=polo")), {
      code: "CATALOG_UNAVAILABLE",
      status: 503,
    });
  });
test("timeout and invalid JSON are errors", async () => {
  const timeout = createRealProvider(env, async () => {
    throw new DOMException("token must not leak", "TimeoutError");
  });
  await assert.rejects(timeout.search(parse("q=polo")), {
    diagnostic: "PROVIDER_TIMEOUT",
  });
  const invalid = createRealProvider(env, async () => new Response("not json"));
  await assert.rejects(invalid.search(parse("q=polo")), {
    code: "CATALOG_UNAVAILABLE",
  });
});
test.each([
  { label: "omitted", images: undefined },
  { label: "empty", images: [] },
])("$label provider images preserve the card and pagination with image null", async ({ images }) => {
  const provider = createRealProvider(env, async () => Response.json(pagePayload([
    { ...product, product_id: "without-image", images }, product,
  ])));
  const result = await provider.search(parse("q=polo"));
  expect(result.data).toHaveLength(2);
  expect(result.data[0]).toMatchObject({ productId: "without-image", name: product.name, image: null });
  expect(result.data[1].image).toEqual({ url: "https://images.example/p1.jpg", alt: product.name });
  expect(result.page).toEqual({ number: 0, size: 24, totalElements: 2, totalPages: 1 });
});

for (const overrides of [
  { images: null },
  { images: "https://images.example/p1.jpg" },
  { images: [""] },
  { images: ["javascript:alert(1)"] },
  { images: ["https://user:pass@images.example/x"] },
  { images: ["http://images.example/x"] },
  { images: ["https://evil.example/x"] },
  { slug: "../admin" },
  { status: "INACTIVO" },
]) {
  test(`reject malformed/unsafe commercial card ${JSON.stringify(overrides)}`, async () => {
    const provider = createRealProvider(env, async () =>
      Response.json(pagePayload([{ ...product, ...overrides }])),
    );
    await assert.rejects(provider.search(parse("q=polo")), {
      code: "CATALOG_UNAVAILABLE",
    });
  });
}

test.each([undefined, 'stale-service-token'])('explicit demo mode omits Authorization even with token %s', async (token) => {
  const provider = createRealProvider({ ...env, PRODUCTOS_AUTH_MODE: 'demo-no-auth', PRODUCTOS_SERVICE_TOKEN: token },
    async (_url, options) => {
      expect(new Headers(options.headers).has('Authorization')).toBe(false);
      expect(new Headers(options.headers).get('X-Correlation-Id')).toBe('demo-correlation');
      return Response.json(pagePayload());
    });
  expect((await provider.search(parse('q=polo'), 'demo-correlation')).data).toHaveLength(1);
});

test.each(['', 'anonymous'])('invalid authentication mode %s fails closed instead of bypassing token validation', (mode) => {
  expect(() => createRealProvider({ ...env, PRODUCTOS_AUTH_MODE: mode })).toThrow();
});
