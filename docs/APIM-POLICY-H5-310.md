# APIM policy candidate — issue #310

**Status: offline preparation only. Do not deploy without express authorization.**
Confirmed in GitHub on 23 November 2026: issue #307 was closed and APIM
Consumption is Online. The candidate policy has **not** been validated in that
instance. Online status is not policy validation or deployment authorization;
this task must not deploy it. This repository also does not contain the
instance/API configuration needed to validate policy inheritance, subscription
settings, or cache behavior.

The candidate policy is
[`infra/apim/policies/catalog-api.xml`](../infra/apim/policies/catalog-api.xml).
It preserves a safe `X-Request-Id` supplied by a caller (the BFF accepts
`[A-Za-z0-9._-]{1,64}`) or uses APIM's request ID when the header is absent or
unsafe, then returns that same ID. `X-Request-Id` is the BFF's demonstrated
public correlation header. `X-Correlation-Id` is used by the backend on its
internal G1→G6 request; it is not declared as a public BFF request/response
header. The disagreement over using `correlation-id` as the public name remains
a contract decision; this policy does not invent an alias or change the public
contract.

## Cache scope and prerequisites

The route/method allowlist in policy code is deliberately exact:

| Operation | Contract | Candidate path scope (inactive) |
| --- | --- | --- |
| `GET /api/v1/catalog/home` | `docs/contratos/openapi-catalogo-h4.json`, `security: []` | Yes |
| `GET /api/v1/catalog/filters` | Same contract, `security: []` | Yes |
| `GET /api/v1/catalog/products` | Same contract, `security: []` | Yes |

The current OpenAPI says all three responses use `Cache-Control: no-store`, and
the runtime catalog interceptor also sets `no-store`. Therefore the policy
contains **no active cache lookup or cache store**, and does not override the
origin's cache directive. Merely being in the candidate scope does not make a
request cacheable. No HIT/MISS behavior is forced or claimed. This preserves the
existing contract rather than silently changing it.

Explicitly excluded, even where the operation is public or advertises a short
cache lifetime:

- Detail and commercial product routes in
  `docs/contratos/product-detail-h4.openapi.yaml`: `/api/v1/catalog/products/{slug}`,
  and its `/price`, `/variants`, `/availability`, and `/recommendations` routes.
- Checkout, cart, favorites, account, orders, and any authenticated or
  personalized route. They are not in the allowlist.
- Any method other than `GET`, and catalog requests carrying `Authorization` or
  `Cookie`.

Any future proposal to add cache policies is outside this task and requires
express authorization plus resolution in the API contract/APIM configuration:

1. Whether the three catalog responses may cease to be `no-store`; an approved
   cache directive and TTL are not present in the current contract. Do not copy
   the 30-second availability TTL: availability is explicitly out of scope.
2. APIM cache-key behavior for every documented `products` query parameter and
   per-consumer partitioning. Confirm which subscription header/query parameter
   is configured, and test it in the target APIM instance before enabling lookup.
3. Existing global/product policy inheritance and any APIM behavior that could
   cache responses outside this policy's scope.
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

Do not enable caching until the subscription configuration and per-consumer
cache isolation are confirmed. No subscription key value is present in this
change.

## Offline validation

`npm run test:apim-policy` uses Node's built-in test runner and local contract
files only. It checks that the allowlist equals the public GET operations in the
catalog contract, rejects protected/non-catalog routes from the candidate scope,
and verifies correlation propagation, the contract's `no-store` state, and the
absence of active cache behavior. XML well-formedness is checked separately.
These offline checks do not call Azure, validate APIM's policy expression
runtime, or authorize deployment.
