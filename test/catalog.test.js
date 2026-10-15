const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { parseQuery } = require("../src/catalog/query");
const {
  createProvider,
  createRealProvider,
  CONTRACT_SHA,
} = require("../src/catalog/provider");
const { createApp } = require("../src/app");
const parse = (value) => parseQuery(new URLSearchParams(value));
const env = {
  CATALOG_SOURCE: "real",
  CATALOG_INTEGRATION_APPROVED: "true",
  PRODUCTOS_BASE_URL: "https://provider.example",
  PRODUCTOS_SERVICE_TOKEN: "synthetic-test-token",
  PRODUCTOS_CONTRACT_VERSION: "0.6.0-rc.1",
  PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA,
  PRODUCTOS_MEDIA_HOSTS: "images.example",
};
const product = {
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
const pagePayload = (items = [product]) => ({
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

test("actual HTTP timeout aborts a slow local provider", async (t) => {
  const upstream = http.createServer((_req, res) => {
    setTimeout(() => {
      if (!res.destroyed) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(pagePayload()));
      }
    }, 250);
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  t.after(() => {
    upstream.closeAllConnections();
    upstream.close();
  });
  const provider = createRealProvider({
    ...env,
    NODE_ENV: "development",
    PRODUCTOS_TIMEOUT_MS: "100",
    PRODUCTOS_BASE_URL: `http://127.0.0.1:${upstream.address().port}`,
  });
  await assert.rejects(provider.search(parse("q=polo"), "test-correlation"), {
    diagnostic: "PROVIDER_TIMEOUT",
    status: 503,
  });
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
  let seen;
  const provider = createRealProvider(env, async (url, options) => {
    seen = { url, options };
    return Response.json({ ...pagePayload(), pagina: 2 });
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
  assert.equal(seen.options.headers["X-Correlation-Id"], "correlation-test");
  assert.equal(
    seen.options.headers.Authorization,
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
  assert.deepEqual(await provider.home("id"), {
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
for (const overrides of [
  { images: [] },
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
test("HTTP flow: mock home/search, validation before provider, source, CORS, method and safe errors", async (t) => {
  const server = http.createServer(
    createApp({
      env: { CATALOG_SOURCE: "mock" },
      healthCheck: async () => {},
      log: () => {},
    }),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(`${base}/api/v1/catalog/home`);
  assert.equal(home.headers.get("x-catalog-source"), "MOCK");
  assert.equal((await home.json()).categories.length, 3);
  const search = await fetch(`${base}/api/v1/catalog/products?q=running`);
  assert.equal(search.status, 200);
  assert.ok((await search.json()).data.length > 0);
  const empty = await fetch(`${base}/api/v1/catalog/products?q=zzzzzz`);
  assert.deepEqual((await empty.json()).data, []);
  const invalid = await fetch(`${base}/api/v1/catalog/products?q=x`);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, "INVALID_SEARCH_QUERY");
  const blocked = await fetch(`${base}/api/v1/catalog/home`, {
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get("access-control-allow-origin"), null);
  const post = await fetch(`${base}/api/v1/catalog/products`, {
    method: "POST",
  });
  assert.equal(post.status, 405);
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
});
test("invalid input never invokes provider; error bodies do not expose diagnostics", async (t) => {
  let calls = 0;
  const provider = {
    source: "REAL",
    search: async () => {
      calls++;
      throw new Error("private token");
    },
  };
  const server = http.createServer(createApp({ provider, log: () => {} }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal(
    (await fetch(`${base}/api/v1/catalog/products?q=x`)).status,
    400,
  );
  assert.equal(calls, 0);
  const response = await fetch(`${base}/api/v1/catalog/products?q=polo`);
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("private token"));
});
