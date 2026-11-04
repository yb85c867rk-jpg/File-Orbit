# FileOrbit Stage 3A — edition-aware snapshot and Orbit package lifecycle

Status: internal capacity-context integration only. Paid contexts are confined to isolated tests; the normal application remains free-only at 300 nodes. No read-only/downgrade/expiry/export policy is implemented.

Baseline: `fileorbit-stage2b2-pager-correction-r169.zip`
Baseline SHA-256 verified:
`3B7DC3896BBE5BC6F242AA66181C546A88C9BC7F8667EF35DC59309BF712D7E2`

## 1. Context API and trust boundary

New internal API in `src/engine/hypertree/edition/context.js`:

- `FREE_POLICY_CONTEXT` — frozen free context.
- `createInternalPolicyContext({ edition, maxNodes })` — internal factory; paid is for isolated tests.
- `resolvePolicyContext(value)` — missing/null defaults to free; malformed, unknown, non-frozen, or unissued contexts fail.
- `contextEditionLimit(context)`.
- `evaluateContextNodeAccess(context, nodeCount, callerMaxNodes)`.

Trust boundary:
- The context is an **internal capacity input**, not proof of purchase, entitlement, license, or authorization.
- Contexts are branded in a module-private `WeakSet`; an equally shaped object from JSON, imported metadata, package content, URL, localStorage, or UI is rejected as `invalid-policy-context`.
- No mutable global paid flag exists.
- No context field is serialized into the document or Orbit package.
- The normal application does not create or pass a paid context.
- `tests/helpers/stage3a-paid-context.mjs` is the only paid-context constructor used in this delivery.

Limits:
- Free: 300 total nodes including root.
- Paid test capacity: 1,000 total nodes including root.
- Context `maxNodes` and caller resource budgets may tighten.
- Higher context/caller values cannot exceed the edition limit.

## 2. Changed files

- `src/engine/hypertree/edition/context.js` (new)
- `src/engine/hypertree/edition/index.js`
- `src/engine/hypertree/persistence/node-limit.js`
- `src/engine/hypertree/persistence/codec.js`
- `src/engine/hypertree/persistence/backup.js`
- `src/engine/hypertree/persistence/index.js` (snapshot-context helper export)
- `tests/helpers/stage3a-paid-context.mjs` (new)
- `tests/engine/persistence/stage3a-edition-context.test.mjs` (new)
- `docs/engine/FILEORBIT-STAGE-3A-EDITION-CONTEXT.md`

Repository storage, recovery, main-app admission, editor integration, and LOD activation are untouched.

## 3. Per-operation boundary matrix

| Operation | Context source | Free default | Paid test | Oversize behavior |
|---|---|---|---|---|
| `buildSaveSnapshot` | explicit `policyContext` | 300 | 1,000 | `node-limit`; no snapshot returned |
| `ownSaveSnapshot` | inherited internal snapshot context, or explicit internal context | 300 | 1,000 | Explicit free ownership rejects paid snapshot |
| `encodeBackup` | explicit `policyContext` | 300 | 1,000 | fails before package completion |
| `decodeBackup` | explicit `policyContext` | 300 | 1,000 | 301–1,000 under free is `node-limit`, not corruption; input blob untouched |
| Repository storage/recovery | unchanged free adapter | 300 | — | unchanged |
| Main application | unchanged free defaults | 300 | — | unchanged |

Snapshot construction attaches the resolved internal context via a non-enumerable symbol. Ownership validation reads it when no explicit context is supplied, preventing a paid snapshot from being accidentally validated as free. Explicit free ownership still rejects a paid snapshot.

## 4. Format and integrity

Unchanged:
- Orbit magic/version/schema.
- Manifest fields; no edition/license/policy/purchase/entitlement fields.
- Node IDs, topology, folder nesting, names, long Korean text, metadata, ordering.
- Attachment IDs/references, bytes, classification, per-file 20 MiB, per-map 100 MiB.
- Actual-vs-declared node counts.
- Detached snapshot ownership.
- Free-size packages decode in both free and paid contexts.
- Oversized packages fail with `node-limit`; bytes are unchanged and are not reclassified as corrupt.
- Invalid/forged context fails `invalid-policy-context`.
- Caller tree mutations during asynchronous encode do not alter the package tree/metadata.

## 5. Round-trip integrity

Tests use nested folders, long Korean names, duplicate names, zero-byte attachment, text/image/PDF payloads, and actual SHA-256 comparisons.

- 300-node free package: IDs/topology/names/descriptions/attachment SHA-256 match after round trip.
- 1,000-node paid-test package: same.
- Four attachments: text, image, PDF, zero-byte text; payload hashes match.
- Free package → paid decode: accepted.
- Paid 1,000 package → free decode: `node-limit`; input bytes hash unchanged.
- 301 package → free decode: `node-limit`; input bytes hash unchanged.

## 6. Tests

- Stage 3A edition-context tests: **9/9 PASS**
- Targeted persistence/edition suite: **117 tests, 116 pass, 1 skip, 0 fail**, exit 0
- Complete free regression: **1,205 tests, 1,204 pass, 1 skip, 0 fail**, exit 0
  - p1b-main: 69/69
  - Remaining: 1,136 tests, 1,135 pass, 1 skip
  - Skip: pre-existing fake-IndexedDB overlapping-readwrite case; native IndexedDB serialization remains NOT RUN.

No test was weakened to accommodate the context integration.

## 7. PASS / FAIL / NOT RUN

**PASS**
- Internal context API and trust boundary.
- Free/paid snapshot boundaries.
- Context propagation into ownership.
- Lower budgets and anti-elevation.
- Format-preserving encode/decode.
- Attachment/hash round trip.
- Oversize rejection without mutation/corruption.
- Caller mutation isolation.
- Targeted and complete free regression.

**FAIL**
- None in executed tests.

**NOT RUN**
- Repository storage/recovery paid capacity.
- Read-only/downgrade/expiry/export permissions.
- Main-app admission, editor, LOD activation.
- Paid UI/accounts/payments/cloud/deployment.
- Native browser acceptance beyond test Node environment.

This is not complete paid-edition support.

