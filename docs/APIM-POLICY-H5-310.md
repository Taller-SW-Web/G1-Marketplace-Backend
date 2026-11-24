# APIM policy readiness — issue #310

**Status: offline review only. Do not deploy without express authorization.**
Confirmed in GitHub on 23 November 2026: issue #307 was closed and APIM
Consumption is Online. The policy has **not** been validated in that
instance. Online status is not policy validation or deployment authorization;
this task does not deploy it. The repository does not contain the target
API/subscription configuration needed to validate policy inheritance, consumer
keys, or cache behavior.

The canonical policy already integrated in `develop` is
[`azure-apim/policies/api-policy.xml`](../azure-apim/policies/api-policy.xml)
(PRs #340/#342). This branch does not add a second APIM policy or change that
shared policy. It currently propagates `X-Correlation-Id`, applies CORS,
rate-limiting, and JWT validation; it does not contain catalog cache policies.

There is a public-header contract mismatch to resolve before claiming
correlation is complete: the BFF emits `X-Request-Id`, while the canonical
APIM policy emits `X-Correlation-Id`. The BFF accepts
`[A-Za-z0-9._-]{1,64}` for `X-Request-Id`; `X-Correlation-Id` is also used by
the backend on its internal G1-to-G6 request. The approved public header and
whether either layer should alias the other remain contract decisions. This
branch does not invent an alias or change the public contract.

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
   per-consumer partitioning. Confirm which subscription header/query parameter
   is configured, and test it in the target APIM instance before enabling lookup.
3. Existing global/product policy inheritance and any APIM behavior that could
   cache responses outside the API's intended scope.
4. Policy validation in the target APIM instance and a non-production
   cache-isolation test. Neither has been performed; offline static tests are
   not evidence of APIM execution.

## Subscription keys by consumer

Provision one APIM subscription for each consumer identity approved through the
consumer/API configuration process.
The repository does not establish the consumer inventory, APIM subscription
names, or secret-store references, so they remain placeholders rather than
invented identities. Use the configured APIM subscription header (the common
default is `Ocp-Apim-Subscription-Key`; confirm it in the APIM configuration).
Store and rotate key **values** only in the approved secret store/consumer
configuration; never put them in this repository, policy XML, tests, logs, or
issue evidence.

| Consumer identity | APIM subscription name/resource | Secret reference (not value) | Status |
| --- | --- | --- | --- |
| `<consumer identity to be approved>` | `<provision in APIM>` | `<external secret reference>` | Placeholder: configuration not confirmed |

Do not enable APIM caching or set the #345 TTL above zero in a deployed
environment until the contract, subscription configuration, and per-consumer
cache isolation are confirmed. No subscription key value is present in this
change.

## Offline validation

`npm run test:apim-policy` uses Node's built-in test runner and local files
only. It checks the canonical policy's existing controls, the public-header
mismatch, the catalog contract/runtime `no-store` state, and the absence of
active cache behavior or a duplicate policy artifact. These offline checks do
not call Azure, validate APIM's policy expression runtime, or authorize
deployment.

## 24 November offline review

`npm run test:apim-policy`: **6/6 PASS**. The mismatch remains explicit: G1's
public response/request contract uses `X-Request-Id`; APIM forwards
`X-Correlation-Id`, which is also the backend's G1→G6 correlation header. A
consumer/API owner must decide whether APIM should alias/propagate both or
whether the public contract changes. Until that decision, do not change either
header or claim end-to-end correlation alignment. This review made no Azure or
APIM runtime calls and left catalog caching disabled (`no-store`, TTL 0).
