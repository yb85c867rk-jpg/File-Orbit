# FileOrbit Paid 1,000 — Stage 1B-2 review packet

Status: **Stage 1B-2 only**. Free-only policy integration across saved documents, backup/import, runtime reconstruction, and recovery. No paid admission, paid UI, format, layout, or entitlement changes.

Baseline: `fileorbit-paid-1000-stage1b2-r169.zip`
Baseline SHA-256 verified:
`E4D959600A83A954369230830E6D4D09F16F2835E9A852F4AB4CFFDC39A8499A`

Review correction: Stage 1B-2 runtime count consistency. This correction adds no paid behavior, layout work, format change, or deployment.

## 1. Changed files and API compatibility

### Source changed
| File | Change |
|---|---|
| `src/engine/hypertree/persistence/node-limit.js` | New shared adapter: derives the free limit from `EDITION_NODE_LIMITS.free`; resolves lower/higher/invalid caller budgets. |
| `src/engine/hypertree/persistence/schema.js` | Re-exports `MAX_SAVED_MAP_NODES` from the central adapter; removes editor-validation dependency for the node limit. |
| `src/engine/hypertree/persistence/backup.js` | Encode/decode use explicit free policy budget; higher overrides capped; invalid limits fail explicitly. |
| `src/engine/hypertree/persistence/codec.js` | Snapshot build/own use the central free budget instead of truthiness/constant checks. |
| `src/engine/hypertree/persistence/repository.js` | Snapshot assertion and saved-map load use explicit free policy limits and actual tree counts. |
| `src/engine/hypertree/persistence/runtime.js` | Reconstruction uses the central free budget; validates the actual loaded graph count against `loaded.map.nodeCount` before attachment adoption/layout; returns the actual count. |
| `src/engine/hypertree/persistence/recovery-codec.js` | Owned recovery validation uses the central free budget at tree admission. |
| `src/engine/hypertree/persistence/recovery-repository.js` | Recovery checkpoint save uses the central free budget. |

`recovery-schema.js` was inspected and retained; it now receives the same derived `MAX_SAVED_MAP_NODES=300` through the schema re-export. No format change.

### Correction-only changes versus Stage 1B-2 baseline

- `src/engine/hypertree/persistence/runtime.js`
- `tests/engine/persistence/runtime-consistency.test.mjs`
- This report and the orbit-only evidence files

No other source boundary was changed by this correction.

### Tests added/changed
- `tests/engine/persistence/edition-persistence.test.mjs` — snapshot/backup/recovery/runtime boundaries, lower/elevated/invalid budgets, actual-vs-declared mismatch, 300-node attachment integrity.
- `tests/engine/persistence/persistence.test.mjs` — repository save/load 300, reject forged 301, verify existing map/generation unchanged.
- `tests/engine/persistence/recovery.test.mjs` — 300 checkpoint accepted, rejected 301 attempt preserves the existing checkpoint.
- `tests/engine/persistence/runtime-consistency.test.mjs` — actual/declared mismatch, matching 2/300, actual 301, stub repository, input/live-state preservation, and pre-adoption rejection ordering.

### API compatibility
- `MAX_SAVED_MAP_NODES` remains a public numeric export with value **300**, now derived from the central free limit.
- `buildSaveSnapshot` return shape and normal error codes/messages are unchanged.
- `repository.save/load` signatures and result shapes are unchanged.
- `reconstructSavedMapRuntime` / `loadSavedMapRuntime` signatures are unchanged; default numeric value remains 300.
- Runtime reconstruction now rejects actual/declared count disagreement with typed `PersistenceError.code === "node-count-inconsistent"` before attachment adoption, layout, or model creation.
- Existing lower `limits.maxNodes` values continue to tighten, with effective-limit messages.
- Higher `limits.maxNodes` values are capped at 300; they cannot admit a 301st node.
- Invalid `limits.maxNodes` (0, negative, fractional, nonfinite, non-number, empty string) fails with `invalid-node-limit` rather than truthiness fallback.
- `limits.maxNodes = null/undefined` retains the free default.
- Generic parser/resource limits are unchanged and remain separate from edition admission.

## 2. Consumer matrix

| Boundary | Stage 1B-2 status |
|---|---|
| `buildSaveSnapshot` | **Integrated**, explicit free budget |
| `ownSaveSnapshot` | **Integrated**, free admission |
| Repository snapshot assert/save | **Integrated** through owned snapshot |
| Repository load | **Integrated**, explicit free limit + actual count |
| Backup encode | **Integrated**, explicit free budget |
| Backup decode/import | **Integrated**, declared + actual tree count |
| Runtime reconstruction | **Integrated**, explicit free budget and actual/declared count consistency |
| Recovery snapshot build | **Integrated** through save-snapshot budget |
| Recovery owned validation | **Integrated**, explicit free limit |
| Recovery checkpoint save | **Integrated**, free limit before transaction |
| Recovery checkpoint load | **Integrated** through owned validation |
| Recovery schema declared count | Unchanged; derived free constant |
| Generic tree-loader parser cap | Separate resource limit; unchanged |
| Layout/render/labels/search/hit testing | Out of scope; unchanged |
| Paid admission/read-only/expiry | Out of scope; absent |
| Paid UI/entitlement/accounts/payment | Out of scope; absent |

## 3. Integrity and preservation

- Actual tree nodes are counted and compared with declared snapshot/manifest/checkpoint counts; declared counts alone are not trusted.
- Runtime reconstruction compares `graph.nodes.size` with `loaded.map.nodeCount` before attachment adoption, layout, and model creation, and returns the actual count.
- ID uniqueness, topology, metadata, attachment references, attachment bytes/hashes, schema validation, and transaction boundaries remain in place.
- Oversized input is rejected before installation; no truncation and no partial adoption.
- Repository rejection is tested to preserve the existing map/generation.
- Recovery rejection is tested to preserve the existing checkpoint.
- Cancellation/stale-result, external conflict, dirty state, destination identity, and success-feedback paths were not changed.
- Existing attachment limits remain 20 MiB/file and 100 MiB total.

## 3.1 Runtime count consistency correction

Reproduced defect: a valid folder-only tree with 1 actual node and `loaded.map.nodeCount = 2` was accepted; the returned runtime reported 2 while `graph.nodes.size` was 1.

Correction contract:
- After structural `loadTree` succeeds, compare `loadedTree.graph.nodes.size` with `loaded.map.nodeCount`.
- On disagreement, throw `PersistenceError` with code **`node-count-inconsistent`** and message `Saved map runtime node count is inconsistent.`
- This check runs before attachment adoption, layout staging/refinement, and exploration-model creation.
- Runtime returns the actual loaded count, never the declared metadata, after a successful match.
- No metadata is silently rewritten and no partial runtime is returned.
- The existing free limit still applies before this consistency check; 301 actual nodes are rejected by structural loading.
- Later attachment/layout/model failures still clear the built registry.

`node-count-inconsistent` matches the existing repository load consistency code, keeping the runtime and repository contract aligned.

## 4. Paid access disabled

- `persistence/node-limit.js` calls the policy with `edition: 'free'` only.
- No production source path uses paid edition or entitlement.
- Higher caller budgets are capped at 300; tests attempt 1,000 and still reject 301.
- No paid UI, activation switch, URL/localStorage unlock, account, payment, license field, or telemetry was added.

## 5. Tests

### Newly executed targeted persistence/recovery

| Run | Tests | Pass | Skip | Fail | Exit |
|---|---:|---:|---:|---:|---:|
| Backup + repository + recovery + runtime consistency + boundary tests + policy/free consumers | 111 | 110 | 1 | 0 | 0 |

The skip is the same pre-existing fake-IndexedDB serialization case. Runtime consistency suite: **6/6 PASS**. Existing boundary suite: **9/9 PASS**. Repository 300/301 test: PASS. Recovery preservation test: PASS.

### Complete free regression (fresh run)

| Run | Tests | Pass | Skip | Fail | Exit |
|---|---:|---:|---:|---:|---:|
| p1b-main | 69 | 69 | 0 | 0 | 0 |
| Remaining | 1,103 | 1,101 | 1 | 1 | 1 |
| **Aggregate** | **1,172** | **1,170** | **1** | **1** | **1** |

The skip is the pre-existing fake-IndexedDB recovery serialization case. The fresh correction run failed only the known intermittent `orbit-only-main` lifecycle test; all 6 new runtime consistency tests and 105 targeted persistence/recovery/policy tests passed. The previous Stage 1B-2 full result (1,166 tests, 1,165 pass, 1 skip, 0 fail) is **retained but predates this correction** and does not include the 6 new tests. See section 5.1.

## 5.1 Orbit-only failure evidence

The first Stage 1B-2 full run observed a failure in the exact test:

`tests/engine/exploration/orbit-only-main.test.mjs` — `only .orbit files are listed, opened, downloaded, and old extensions are rejected before replacement`

Captured assertion:
- Expected: `/Only \.orbit files are supported/`
- Actual: `Opened alpha.orbit; the file changed outside FileOrbit. Saving requires a conflict decision.`
- Wrapper: actual `1`, expected `0`

Evidence is retained at `evidence/paid-1000-stage1b2-runtime-fix/ORBIT-ONLY-FAILURE.md`. The same failure was **observed** on the unmodified Stage 1B-2 baseline in a separate reproduction; the reproduction log is retained as `evidence/paid-1000-stage1b2-runtime-fix/baseline-orbit-only.txt`.

This is an observed intermittent baseline issue, not an assumed root cause. The fresh correction full run reproduced the same exact failure; its complete log is retained as `evidence/paid-1000-stage1b2-runtime-fix/correction-full-run-orbit-failure.txt`. A later clean rerun of the earlier Stage 1B-2 suite is **not** evidence that it was fixed or resolved, and this correction does not modify that lifecycle test or behavior.

## 6. PASS / FAIL / NOT RUN

**PASS**
- Free-only persistence/recovery policy integration.
- 300 accepted and 301 rejected at snapshot, backup, repository, runtime, and recovery boundaries (targeted).
- Actual count versus declared count rejection at snapshot and repository boundaries.
- Runtime actual/declared mismatch rejected with `node-count-inconsistent` before attachment adoption/layout; matching 2/300 accepted; caller input/live state preserved.
- Lower budgets and attempted higher-limit overrides.
- Invalid limits explicit.
- Rejected repository/recovery operations preserve existing data.
- Attachment bytes at 300 and existing resource limits.
- Public constants/defaults and free-only admission.
- Targeted correction suite: 111 tests, 110 pass, 1 skip, 0 fail.
- Full regression was executed after correction: 1,172 tests, 1,170 pass, 1 skip, 1 known pre-existing intermittent failure.

**FAIL**
- Full regression: the known intermittent `orbit-only-main` lifecycle test failed again. It is unrelated to runtime count consistency and was not modified. No targeted runtime/persistence/recovery test failed.

**NOT RUN**
- 1,000-node layout/render/browser support.
- Paid admission/read-only/expiry/downgrade.
- Paid UI/entitlement/accounts/payment/cloud/deployment.
- Tablet/phone.

This is not 1,000-node application support.



