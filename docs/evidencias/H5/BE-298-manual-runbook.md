# BE #298 — manual G5/G6 runbook packet

**State: PREPARED / NOT RUN.** This is a sanitized manual runbook and blank report template, not an integration client. Preparing or validating these files makes no business API or sandbox calls, does not contact RabbitMQ, and proves no integration. Do not label any result **REAL** until an authorized run has actually happened.

This packet defines no service URLs, environment-variable names, request payloads, endpoints, or contract contents. The future operator must use only the approved, pinned G5/G6 contracts and procedures; do not derive a request from mock fixtures or this packet.

## Execution gates — all applicable gates must pass before a run

| Gate | Required before execution | Current packet status |
| --- | --- | --- |
| G1 adapters | The required G1 adapters must exist in the exact candidate build, be reviewed, and be configured for the approved provider path (not a mock/fixture). | **BLOCKED.** In this worktree `src/checkout/external/marketplace.gateway.ts` routes Sales and inventory through mock-only calls when mocks are enabled and rejects those calls when mocks are disabled. `src/catalog/product-availability.service.ts` explicitly keeps inventory availability fixture-backed while I-01 is open. This packet does not implement adapters. |
| Authorization, environment, and window | Use the canonical G5 environment/test instructions already recorded in G1 Backend #133 and G5 issue #65. This handoff is not authorization for a particular run: written authorization must still identify its scope, operator, and time window. Stop if the actual artifact or environment differs from the recorded instructions. | Historical instructions exist; authorization and a run window are not provided or verified by this preparation. |
| Secure credential provisioning | An authorized owner must provision credentials through the approved secret-management channel. Never put credentials in this repository, report, command history, logs, or chat. | Not provided or verified by this preparation. |
| G6 runtime JWT acceptance | Have authorized runtime acceptance evidence covering the G6 cases whose observed HTTP statuses are **200, 401, and 403**, with each case matched to its expected behavior by G6’s approved procedure. Do not infer status-to-case mapping here; local fixtures do not satisfy this gate. | Not provided or verified by this preparation. |
| G7 grants | Grants are **confirmed**, per the task handoff. Treat this gate as satisfied; do not re-request grant confirmation. This does not provide credentials or authorize a test outside its approved scope. | **CONFIRMED per handoff.** |
| G5 canonical procedure and pins | Use the canonical procedure and environment/test instructions already supplied in G1 Backend #133 and G5 issue #65. The canonical M1 v1.10.0 deployed OpenAPI is pinned to commit `95325de5b9b1db44fcfb92e945256b604f0a86f7`; M2 is pinned to v1.6.0. These records are the source of truth for requests, expected outcomes, and sequence. Do not ask G5 to reconfirm them. Stop if the actual artifact or environment differs from the recorded handoff. | **RECORDED; not a blocker.** |

**Inventory reservation constraint:** G5 reported that inventory reservation remains simulated until G6 is deployed. Until the authorized G6 deployment is confirmed, do not run or describe reservation as live/REAL. If a pinned procedure requires a live reservation, block that case until G6 is deployed. If the approved procedure explicitly permits a simulated reservation, label it **SIMULATED** and exclude it from REAL integration evidence.

## Manual sequence for a future authorized run

1. **Readiness review (no calls).** Record the candidate G1 build and verify all gates above. Use the case IDs, sequence, environment, and test instructions already recorded in G1 Backend #133 and G5 issue #65; do not request G5 reconfirmation or improvise. Confirm the authorized test data are synthetic and the owner has specified any required cleanup. Stop if the actual artifact or environment differs from the recorded handoff, or if another execution gate is not met.
2. **G6 acceptance evidence.** If not already evidenced, perform only the G6 runtime JWT acceptance cases authorized by G6’s procedure. Confirm the procedure’s expected behavior and record the observed 200/401/403 status for each approved case. Stop on a missing or unexpected result; do not continue to G5 on the strength of mock/local tests.
3. **G5 M1.** Follow the recorded M1 v1.10.0 procedure exactly, in its specified order. Keep each approved case separate in the report. Do not replay a write or retry an uncertain operation unless the pinned procedure explicitly authorizes it.
4. **G5 M2.** Follow the recorded M2 v1.6.0 procedure exactly, in the sequence established by the canonical G5 handoff.
5. **Reservation case, if in scope.** Proceed as a live case only after G6 deployment is confirmed and the pinned procedure authorizes it. Otherwise leave it blocked or explicitly simulated as described above; never count it as REAL.
6. **Close and sanitize.** Follow the approved cleanup/closeout procedure. Transfer only the allowed fields below into a reviewed copy of `BE-298-report.template.json`. Keep raw operational material out of the report and repository.

## Evidence rules

The sanitized report may contain only these fields for each case:

| Field | Record |
| --- | --- |
| `case_id` | Approved case identifier from the pinned procedure. |
| `http_status` | Observed numeric HTTP status; do not substitute an expected value. |
| `contract_version` | Exact pinned contract version used for the case. |
| `correlation_reference` | Sanitized, non-secret correlation reference suitable for sharing. |
| `elapsed_ms` | Observed elapsed duration in milliseconds. |

**Never include:** access/refresh/JWT/OTP values; authorization headers, cookies, or other auth material; PII or customer/account identifiers; secret values or environment-variable contents; raw request/response bodies or payloads; full URLs or query strings; database records/dumps; or unreviewed logs, screenshots, traces, or attachments. Do not copy operational evidence into this packet.

## Classification and limits

- The committed template starts at `NOT_RUN`; this packet’s status is **PREPARED / NOT RUN**.
- Local tests, mock fixtures, simulated reservations, adapter presence, contract validation, or a filled-in template alone do not demonstrate an external integration.
- Use **REAL** only after the authorized run actually occurs, all applicable gates have passed, and the observed results are recorded against the pinned procedures. Partial, blocked, skipped, or simulated cases must remain so labeled and must not be summarized as a complete REAL run.
- This packet does not authorize execution, provision credentials, verify deployment, certify G6 JWT acceptance, change grants, or establish G5/G6 availability.

## Remaining blockers at preparation time

1. Implement/review the required G1 provider adapters; the current source is mock-only for G5 checkout/inventory and fixture-backed for I-01 availability.
2. Obtain an authorized environment/window and secure credential provisioning for the specific run.
3. Obtain G6 runtime JWT acceptance evidence for the approved 200/401/403 cases.
4. Confirm G6 deployment before any inventory reservation is represented as live; otherwise keep that case blocked or simulated.

G7 grants are already confirmed per handoff and are **not** a remaining blocker for this packet.
