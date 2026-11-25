# APIM policy readiness — issue #310

**Status: offline review only. Do not deploy without express authorization.**
Confirmed in GitHub on 23 November 2026: issue #307 was closed and APIM
Consumption is Online. The APIM owner subsequently confirmed the target and
consumer configuration in writing. This branch only records those details;
the policy has **not** been validated in the instance and no Azure operation or
runtime request was made. Online status and written configuration are not
policy validation or deployment authorization.

| Setting | Confirmed value |
| --- | --- |
| Instance / resource group / region / tier | `apim-g1-marketplace-20` / `rg-marketplace-g1` / West US / Consumption |
| API ID / suffix | `marketplace-api` / `v1` |
| Gateway | `https://apim-g1-marketplace-20.azure-api.net/v1` |
| Backend `serviceUrl` | `https://g1-marketplace-backend.onrender.com` (origin, no path prefix) |

The canonical policy already integrated in `develop` is
[`azure-apim/policies/api-policy.xml`](../azure-apim/policies/api-policy.xml)
(PRs #340/#342). This branch does not add a second APIM policy. The canonical
policy applies CORS, rate-limiting, and JWT validation; it does not contain
catalog cache policies. This branch proposes an offline update to its
correlation-header mapping.

The public header is `X-Correlation-Id`, confirmed as the H5 standard and agreed
with G6/G7. Inbound, APIM preserves or creates that ID; if the value is outside
the BFF's safe `[A-Za-z0-9._-]{1,64}` format, APIM replaces it with a UUID.
It then aliases the normalized value as `X-Request-Id` toward the BFF. Outbound, APIM returns
`X-Correlation-Id` to the client (and CORS exposes it). The BFF's `X-Request-Id`
alias remains an internal compatibility detail; the separate G1→G6
`X-Correlation-Id` propagation is unchanged. The policy change is represented
in XML and offline tests only; it has not been executed by APIM.

## Cache scope and prerequisites

The catalog cache contract was reviewed against the current OpenAPI:

| Operation | Contract | Cache status |
| --- | --- | --- |
| `GET /api/v1/catalog/home` | `docs/contratos/openapi-catalogo-h4.json`, `security: []` | Disabled: `no-store` |
| `GET /api/v1/catalog/filters` | Same contract, `security: []` | Disabled: `no-store` |
| `GET /api/v1/catalog/products` | Same contract, `security: []` | Disabled: `no-store` |

The current OpenAPI says all three responses use `Cache-Control: no-store`, and
the current `develop` runtime uses `no-store`. PR #345 separately prepares an
in-process cache candidate; it now defaults `CATALOG_CACHE_TTL_MS` to `0` so the
runtime keeps `no-store` unless explicitly configured. A nonzero value can emit
a public shared-cache directive and would diverge from this OpenAPI contract;
do not set it in a deployed environment until that contract/TTL change is
approved. Therefore the canonical APIM policy has **no cache lookup or cache
store**, and this branch does not add one or override the origin's cache
directive. No HIT/MISS behavior is forced or claimed.

Explicitly excluded, even where the operation is public or advertises a short
cache lifetime:

- Detail and commercial product routes in
  `docs/contratos/product-detail-h4.openapi.yaml`: `/api/v1/catalog/products/{slug}`,
  and its `/price`, `/variants`, `/availability`, and `/recommendations` routes.
- Checkout, cart, favorites, account, orders, and any authenticated or
  personalized route. They are not in the allowlist.
- Any method other than `GET`, and catalog requests carrying `Authorization` or
  `Cookie`.

Any future proposal to add cache policies requires express authorization plus
resolution in the API contract/APIM configuration:

1. Whether the three catalog responses may cease to be `no-store`; an approved
   cache directive and TTL are not present in the current contract. Do not copy
   the 30-second availability TTL: availability is explicitly out of scope.
2. APIM cache-key behavior for every documented `products` query parameter and
   per-consumer partitioning. The currently configured subscription header is
   `api-key`; test it in the target APIM instance before enabling lookup.
3. Existing global/product policy inheritance and any APIM behavior that could
   cache responses outside the API's intended scope.
4. Policy validation in the target APIM instance and a non-production
   cache-isolation test. Neither has been performed; offline static tests are
   not evidence of APIM execution.

## Subscription keys by consumer

The APIM owner confirmed subscription-required is active, the current header is
`api-key`, and the following subscriptions are scoped to All APIs. The
`<rate-limit>` isolation/runtime behavior still needs an authorized non-prod
check. Store and rotate key **values** only in the approved secret
store/consumer configuration; never put them in this repository, policy XML,
tests, logs, or issue evidence. Values remain only in their approved secret
stores.

| Consumer identity | APIM subscription name/resource | Secret reference (not value) | Status |
| --- | --- | --- | --- |
| `web-frontend-g1` | `web-frontend-g1` (All APIs) | Vercel Env Vars, G1-Marketplace-Frontend: `APIM_SUBSCRIPTION_KEY` (server-side only; never `NEXT_PUBLIC_`) | Confirmed; value not recorded |
| `ci-qa-smoke` | `ci-qa-smoke` (All APIs) | GitHub Actions Secrets, G1-Marketplace-Backend: `APIM_QA_SUBSCRIPTION_KEY` | Confirmed; value not recorded |
| `demo-team` | `demo-team` (All APIs) | Local/Postman team secret store (outside Git) | Confirmed; value not recorded |

Do not enable APIM caching or set the #345 TTL above zero in a deployed
environment until the contract, subscription configuration, and per-consumer
cache isolation are confirmed. No subscription key value is present in this
change.

## Offline validation

`npm run test:apim-policy` uses Node's built-in test runner and local files
only. It checks the canonical policy's existing controls, the
`X-Correlation-Id` → `X-Request-Id` alias, the catalog contract/runtime
`no-store` state, the documented subscription inventory, and the absence of
active cache behavior or a duplicate policy artifact. These offline checks do
not call Azure, validate APIM's policy expression runtime, or authorize
deployment.

## APIM QA smoke (manual, read-only)

The `CI-CD` workflow has an opt-in `RUN_APIM_QA_SMOKE` dispatch input. It uses
`APIM_QA_SUBSCRIPTION_KEY` from GitHub Actions Secrets and sends exactly two
GETs to the non-production gateway: the contracted catalog products route
(expect `200`, and compare response `X-Correlation-Id` / `X-Request-Id` with a
synthetic request ID) and `/v1/wishlist` without JWT (expect `401`). It logs
only status and boolean header-match results; it never logs response bodies or
the subscription key. It does not send a burst, mutate data, or deploy. Run it
only with explicit QA authorization and after the intended policy revision has
been applied. A passing request validates only these cases, not all operations
or the APIM policy language/runtime generally.

### Real QA attempt — 25 Nov 2026 UTC

GitHub Actions run [45528575052](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45528575052)
confirmed the QA secret was present without displaying its value. Both requests
returned `404`: catalog products (expected `200`) and wishlist without JWT
(expected `401`). `X-Correlation-Id` matched the synthetic input, but
`X-Request-Id` did not. This is a **failed REAL gateway check**, not a pass or
evidence for all operations. Do not repeat it until the APIM owner reviews the
imported operations, `/v1`→`/api/v1` rewrite, and applied policy revision. No
response bodies or key values were logged; no load test or deployment ran.

### Recheck after APIM correction — 25 Nov 2026 UTC

After the APIM owner confirmed the route/rewrite and policy correction (repo
commit `df137b1`), workflow run
[45536575477](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45536575477)
sent the same two GETs once. Catalog products returned `503` (expected `200`);
both response correlation headers matched the synthetic request ID. Wishlist
without JWT returned `401` as expected. This no longer reproduced the earlier
`404`s and confirms the tested correlation behavior, but the smoke remains
**not fully passed** because catalog is unavailable. The owner separately
reported that this `503` is the BFF/G6 `CATALOG_UNAVAILABLE` response after
the request reaches Render; this workflow intentionally did not log response
bodies, so that specific classification is owner-reported, not inferred from
the smoke output. Build and tests passed; deploy, versioning, and image jobs
were skipped. No response bodies or secret values were logged, and no load
test or deployment ran.

## 24 November offline alignment

The APIM owner confirmed `X-Correlation-Id` as the public header, its alias to
`X-Request-Id` for the BFF, the `api-key` subscription header, and three
consumer subscriptions. The offline policy/test/runbook changes reflect those
decisions. The APIM QA smoke is an explicit, bounded manual workflow; no
rate/load test, deployment, or cache change is included. Catalog caching
remains disabled (`no-store`, TTL 0); `AZURE_CREDENTIALS` is blocked by the
tenant's directory permissions.
