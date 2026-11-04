# FileOrbit Stage 3B correction — cross-context replacement and recovery context

## Baseline

Original Stage 3B candidate: `fileorbit-stage3b-repository-recovery-r169.zip`
SHA-256: `48AA4BE42417B8E438D22D203CFBD889223836F83DFAD96A01F91BB1FEF0032B`
The original archive is preserved unmodified. This is a separate corrected candidate.

## Defects corrected

### 1. Existing oversized map replacement

`repository.save` previously checked only the incoming snapshot capacity. A free-context save of a valid 1-node snapshot targeting an existing paid 1,000-node map could replace it.

Correction inside the save transaction, before any attachment/document/map mutation:

- read the existing map and document;
- validate document identity/generation;
- load and validate the stored tree independently of the incoming snapshot;
- derive the actual stored node count;
- compare actual count to stored metadata count (`node-count-mismatch` if forged/inconsistent);
- apply the repository context limit to the **existing** document (`node-limit` when insufficient).

A sufficient paid context can still replace it. Stale-generation and rollback remain.

### 2. Existing oversized recovery checkpoint replacement

`saveRecoveryCheckpoint` previously validated only the incoming recovery snapshot. A free-context 1-node checkpoint with the current workspace token/control version could replace a paid 1,000-node checkpoint.

Correction inside the recovery save transaction, before deleting/replacing checkpoint or attachment rows:

- read and validate the active checkpoint;
- load and validate its stored tree;
- derive actual count; require it to equal the checkpoint’s declared count;
- apply the repository context limit to the existing checkpoint;
- only then read usage and perform replacement.

Audited mutation paths:

| Path | Behavior |
|---|---|
| `saveRecoveryCheckpoint` replacement | Checks active existing checkpoint capacity before deletion |
| `retireThrough` | Checks every checkpoint it will delete before deletion |
| `discardWorkspace` | Checks every workspace checkpoint before deletion |
| `supersedeSource` | Routes source/child through `loadCheckpoint`, which applies capacity |
| `beginSave` | Reservation only; no retained-data deletion |
| `abandonSave` | Reservation cleanup only; no retained checkpoint deletion |
| `claimSource` / `releaseClaim` | Claim metadata only; no retained-data deletion |
| `createWorkspace` | Creates control; does not delete existing document data |

### 3. Recovery snapshot context and error typing

`materializeRecoverySnapshot` spread the save snapshot, dropping the non-enumerable policy context. `buildRecoverySnapshot` spread before materializing, losing the symbol even earlier.

Corrections:

- exported `attachSnapshotPolicyContext`; recovery materialization reattaches trusted context;
- `buildRecoverySnapshot` passes its trusted context explicitly to materialization;
- `ownValidatedRecoverySnapshot` inherits `snapshotPolicyContext(snapshot)` when no explicit override is supplied;
- explicit repository/free override takes precedence;
- ownership returns a snapshot carrying the resolved issue context;
- structural validation runs with normal tree limits first, then actual count is checked, then context capacity is applied;
- paid-size valid data under free returns `node-limit`, not `recovery-tree-invalid`;
- malformed structure remains `recovery-tree-invalid`; forged declared count is `recovery-node-count-mismatch`; storage inconsistency is `node-count-mismatch`/`node-count-inconsistent`.

No policy authority is serialized. A forged plain object/spread has no context and is treated as free.

## Operation boundary matrix

| Operation | Existing target | Free 300 | Paid 1,000 | Result |
|---|---|---:|---:|---|
| Repository save replacement | Paid 1,000 | Incoming 1 | — | `node-limit`, no mutation |
| Repository save replacement | Paid 1,000 | — | Incoming 1 | Succeeds |
| Repository save replacement | Paid 1,000 | — | Lower paid 500 | `node-limit` |
| Repository save replacement | Forged count | — | — | Count inconsistency, not capacity |
| Checkpoint replacement | Paid 1,000 | Incoming 1 | — | `node-limit`, checkpoint/tree/attachments/control/usage retained |
| Checkpoint replacement | Paid 1,000 | — | Incoming 1 | Succeeds |
| Checkpoint retire | Paid 1,000 | — | — | `node-limit` via free |
| Checkpoint discard | Paid 1,000 | — | — | `node-limit` via free |
| Checkpoint supersede | Paid 1,000 | — | — | Source load capacity applies |
| Recovery ownership | Paid 1,000, no override | — | — | Inherits paid context, accepted |
| Recovery ownership | Paid 1,000, explicit free | — | — | `node-limit` |
| Plain/spread snapshot | Paid 1,000 | — | — | No authority; `node-limit` |

## Regression results

`tests/engine/persistence/stage3b-correction.test.mjs`:

1. Paid 1,000 map saved; free 1-node replacement with current mapId/generation rejected; tree, generation, timestamps, attachments SHA-256 and usage unchanged; paid 1-node replacement succeeds.
2. Paid 1,000 map with attachment; free replacement rejected; attachment name/bytes/SHA-256 and accounting unchanged.
3. Paid 1,000 checkpoint; free 1-node replacement with current workspace token/controlVersion rejected; checkpoint ID/generation/tree, attachment hashes, workspace control and usage unchanged; paid replacement succeeds.
4. Free retire and discard of retained paid checkpoint rejected without control/checkpoint mutation.
5. Paid recovery snapshot preserves context through materialization; no-override ownership accepted; explicit free override `node-limit`; free repository `node-limit`; plain forged object has no authority; forged count `recovery-node-count-mismatch`.
6. Free 299/300, paid 999/1,000 accepted; 301/1,001 rejected.
7. Stored map count forged in IndexedDB: free replacement and paid load report count inconsistency, not capacity/corruption.

Existing tests cover transaction rollback, generations, stale writes, cancellation, claims, attachment hashes, and accounting.

## Tests

- Focused corrected suite: **91 tests, 90 pass, 1 skip, 0 fail**, exit 0
  - Skip: pre-existing fake-IndexedDB overlapping-readwrite case; native IndexedDB concurrency/durability NOT RUN.
- `p1b-main`: **69/69 PASS**, exit 0
- Complete free regression: **1,227 tests, 1,226 pass, 1 skip, 0 fail**, exit 0
  - Remaining: 1,158 tests, 1,157 pass, 1 skip
  - Corrected per review against the retained Stage 3B logs; no additional Stage 3B run is claimed here.

Fresh logs: `evidence/stage3b-correction/`.

## PASS / FAIL / NOT RUN

**PASS**
- Smaller free replacement of existing paid map rejected atomically.
- Smaller free replacement of existing paid checkpoint rejected atomically.
- Lower paid context budget rejection.
- Current generation/control version used, so failures are capacity-based.
- Recovery context preservation/inheritance and explicit-free override.
- Free 300/301 and paid 1,000/1,001 boundaries.
- Forged counts vs actual stored/incoming counts.
- Exact tree/topology/metadata/attachment SHA-256/generation/control/usage preservation.
- Authorized paid replacement still works.
- Existing transaction, claim, cancellation, stale-write, accounting protections.
- Complete free regression.

**FAIL**
- None in executed checks.

**NOT RUN**
- Native browser IndexedDB concurrency/durability (FakeIndexedDB only).
- Runtime/layout/editor/main-app paid admission.
- Paid UI, read-only/downgrade/expiry/export permissions.
- Upload, cloud, Tauri, enterprise, deployment, publishing.

## Preservation

- Free default 300 nodes including root; paid internal test context 1,000.
- 20 MiB/file and 100 MiB/map attachment limits.
- Orbit Folder browser and stale-request protection.
- Search paths `#60A5FA`, edge opacity `0.55`.
- PDF filename/type badge `#F87171`, icon-free labels.
- Stage 3A and isolated LOD behavior.
- No Orbit format/database version/stored schema change.

