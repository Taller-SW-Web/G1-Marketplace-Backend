const { randomUUID, createHash } = require("node:crypto");
const { createProvider } = require("./catalog/provider");
const { parseQuery } = require("./catalog/query");
const { CatalogError, problem } = require("./catalog/errors");

function createApp({
  env = process.env,
  provider = createProvider(env),
  healthCheck,
  log = console.info,
} = {}) {
  const origin = env.CORS_ORIGIN || "http://localhost:3000";
  if (origin === "*") throw new Error("CORS_ORIGIN must be an explicit origin");
  return async (req, res) => {
    const startedAt = Date.now();
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Origin");
    const send = (status, body, isProblem = false) => {
      res.writeHead(status, {
        "Content-Type": `${isProblem ? "application/problem+json" : "application/json"}; charset=utf-8`,
      });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.headers.origin) {
        if (req.headers.origin !== origin)
          throw new CatalogError("ORIGIN_NOT_ALLOWED", 403);
        res.setHeader("Access-Control-Allow-Origin", origin);
      }
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method !== "GET") {
        res.setHeader("Allow", "GET, OPTIONS");
        throw new CatalogError("METHOD_NOT_ALLOWED", 405);
      }
      const url = new URL(req.url, "http://marketplace.local");
      if (url.pathname === "/" || url.pathname === "/health") {
        let connected = false;
        try {
          await healthCheck?.();
          connected = Boolean(healthCheck);
        } catch {
          /* Never expose database error details. */
        }
        send(connected ? 200 : 503, {
          status: connected ? "UP" : "DOWN",
          service: "g1-marketplace-backend",
          database: { connected },
          timestamp: new Date().toISOString(),
        });
        return;
      }
      if (
        !["/api/v1/catalog/home", "/api/v1/catalog/products"].includes(
          url.pathname,
        )
      )
        throw new CatalogError("NOT_FOUND", 404);
      res.setHeader("X-Catalog-Source", provider.source);
      const query = parseQuery(url.searchParams);
      const result = url.pathname.endsWith("/home")
        ? await provider.home(requestId)
        : await provider.search(query, requestId);
      send(200, result);
      log(
        JSON.stringify({
          event: "catalog_read",
          requestId,
          path: url.pathname,
          source: provider.source,
          status: 200,
          queryHash: query.q
            ? createHash("sha256").update(query.q).digest("hex")
            : undefined,
          durationMs: Date.now() - startedAt,
        }),
      );
    } catch (error) {
      const safe = error instanceof CatalogError ? error : new CatalogError();
      log(
        JSON.stringify({
          event: "catalog_error",
          requestId,
          code: safe.code,
          diagnostic: safe.diagnostic,
          status: safe.status,
          durationMs: Date.now() - startedAt,
        }),
      );
      send(safe.status, problem(safe, requestId), true);
    }
  };
}

module.exports = { createApp };
