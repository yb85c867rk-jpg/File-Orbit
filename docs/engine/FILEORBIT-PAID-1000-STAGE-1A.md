> Historical Stage 1A snapshot. Stage 1B-1 adds free-only policy consumers; see `FILEORBIT-PAID-1000-STAGE-1B-1.md`.

﻿# FileOrbit Paid 1,000 — Stage 1A review packet

Status: **Stage 1A only**. Central definitions and pure shadow policy. No paid behavior, UI, entitlement, or consumer integration.

Baseline: accepted PC free-edition packet `fileorbit-pc-free-edition-readiness-r169.zip`
Baseline SHA-256 verified: `E7608F387E5A9676CEF8F908B77241A26469ADCFB5889D00B4795FFDD6ADA441`

## 1. Changed-file list and rationale

### Contract-correction revision

Relative to the previous Stage 1A candidate, this correction changes only:
- `src/engine/hypertree/edition/policy.js`
- `tests/engine/edition/edition-policy.test.mjs`
- this report and the rebuilt candidate archive.

Existing application source/test/vendor files remain unchanged. The previous Stage 1A candidate archive is preserved.

### New policy files
- `src/engine/hypertree/edition/policy.js` — immutable edition node limits and pure `evaluateNodeAccess` API.
- `src/engine/hypertree/edition/index.js` — explicit public exports.

### New test
- `tests/engine/edition/edition-policy.test.mjs` — free/paid boundaries, invalid inputs, context fallback, caller caps, purity, default alignment.

### Documentation updates (candidate only)
- `docs/engine/FILEORBIT-PAID-1000-REQUIREMENTS.md` — Stage 1A boundary and unapproved-decision separation.
- `docs/engine/FILEORBIT-PAID-1000-ARCHITECTURE.md` — current shadow-only status; future integration sections remain planning.
- `docs/engine/FILEORBIT-PAID-1000-PERFORMANCE.md` — proposed budgets vs measured results, actual binary fixture depth, 50-result discoverability issue, 1,000 browser NOT RUN.
- `docs/engine/FILEORBIT-PAID-1000-IMPLEMENTATION-PLAN.md` — Stage 1 split into delivered 1A and future 1B consumer integration.
- `docs/engine/FILEORBIT-PAID-1000-STAGE-1A.md` — this report.

**No existing application source, test behavior, format, limit default, layout, rendering, label, search, hit-test, or recovery file was changed.**

## 2. Policy API

Exports:

```js
EDITION_IDS
EDITION_NODE_LIMITS
NODE_ACCESS_REASONS
evaluateNodeAccess({ edition, nodeCount, callerMaxNodes })
editionNodeLimit(edition)
```

### Inputs

| Input | Meaning |
|---|---|
| `edition` | `'free'`, `'paid'`, missing/null/empty (defaults free), or unknown (rejected). |
| `nodeCount` | Total document nodes including the synthetic root. Positive safe integer only. |
| `callerMaxNodes` | Optional caller budget. Must be a positive safe integer. May tighten the edition limit; can never raise it. |

### Decision table

| Context | nodeCount | callerMax | Allowed | Effective limit | Reason |
|---|---:|---:|---|---:|---|
| free | 299 | — | yes | 300 | `within-limit` |
| free | 300 | — | yes | 300 | `within-limit` |
| free | 301 | — | no | 300 | `edition-node-limit` |
| paid (isolated test) | 999 | — | yes | 1000 | `within-limit` |
| paid (isolated test) | 1000 | — | yes | 1000 | `within-limit` |
| paid (isolated test) | 1001 | — | no | 1000 | `edition-node-limit` |
| free | 300 | 1000 | yes | 300 | `within-limit`, tightened by edition |
| paid | 301 | 300 | no | 300 | `caller-node-limit` |
| missing edition | 300 | — | yes | 300 | free default |
| unknown edition | 1 | — | no | — | `unsupported-edition` |
| invalid count | -1/0/1.5/NaN/Infinity/string | — | no | — | `invalid-node-count` |
| invalid caller | any valid count | 0/negative/fractional/nonfinite | no | — | `invalid-caller-limit` |

Decision objects are frozen. Evaluation is deterministic, has no imports, no I/O, no logging, no global state, and does not mutate caller-owned input.

## 3. Node-limit consumer inventory

### Edition-access guards (not changed in 1A)
| Consumer | Path | Current behavior |
|---|---|---|
| Editor admission | `src/engine/hypertree/editor/validation.js` | `EDITOR_MAX_NODES=300`; add/edit admission rejects >300. |
| Directory selection | `src/engine/hypertree/exploration/directory-selection.js` | default `maxNodes=300`; main passes `EDITOR_MAX_NODES`. |
| Create map | `src/engine/hypertree/exploration/create-map.js` | defaults to `EDITOR_MAX_NODES`; rejects over limit. |
| Persistence schema | `src/engine/hypertree/persistence/schema.js` | `MAX_SAVED_MAP_NODES` aliases 300. |
| Encode/decode | `persistence/backup.js`, `persistence/codec.js` | 300-node saved-map guards. |
| Repository | `persistence/repository.js` | 300-node save/load guards. |
| Recovery | `persistence/recovery-repository.js`, `recovery-codec.js`, `recovery-schema.js` | 300-node recovery guards. |
| Runtime | `persistence/runtime.js` | reconstructed tree max defaults to 300. |
| UI gate | `tests/harness/m5-exploration/main.mjs` | edit availability checks <=300; directory collection uses constant. |

These enforce **edition access** at the application boundary. They are not replaced by the new policy yet.

### Structural/resource guards (not edition policy)
| Guard | Path | Purpose |
|---|---|---|
| `LIMITS.maxNodes=100000` | `data/errors.js`, `data/tree-loader.js` | Generic parser safety ceiling, not edition access. |
| `V2_MAX_NODES=2000` | `layout/experimental-v2.js` | Layout contract/resource safety. |
| `SCENE_LIMITS.maxNodes=1500` | `render/scene.js` | Renderer object limit. |
| Hit snapshot cap 1500 | `interaction/hit-test.js` | Interaction resource limit. |
| `DIAGNOSTIC_MAX_NODES=300` | `layout/experimental-metrics.js` | O(N²) diagnostic guard; currently blocks 1,000-node refinement. |
| `CROWDING_MAX_NODES=400` | `layout/experimental-v2-crowding.js` | Optional crowding path budget. |
| `LOCAL_CROWDING_MAX_NODES=400` | `layout/experimental-v2-local-crowding.js` | Optional local-crowding budget. |
| Label `defaultMaxLabels=40`, `maxVisibleBudget=500` | `render/label-overlay.js` | Label/presentation budget, never document size. |
| `MAX_SEARCH_RESULTS=50` | `exploration/search.js` | Result/highlight presentation cap; unresolved 1,000 discoverability issue. |
| Attachment 20 MiB/100 MiB | editor/classification/persistence | Resource/commercial limits; unchanged. |

### Mixed guard
`create-map.js` and `repository.js` combine **edition access** with structural/resource checks. A future policy integration must preserve their integrity checks; it must not replace them with a simple max override.

## 4. Shadow status

- The policy module is **not imported by `main.mjs`, create/open/save/recovery, or any production application path**.
- No global paid flag, URL switch, localStorage unlock, activation UI, account, payment, telemetry, or console logging was added.
- Paid contexts appear only in `edition-policy.test.mjs`.
- `EDITOR_MAX_NODES` remains 300. All existing application defaults remain 300.
- No document format, license field, layout, render, label, search, or hit-test behavior changed.

## 5. Unapproved behavior preserved

Still not implemented/approved:
- free opening of 301–1,000-node documents;
- read-only mode;
- oversized recovery behavior;
- expiry/downgrade editing;
- export permissions for paid-size documents in free mode;
- paid UI, entitlement, accounts, payments, or offline policy.

## 6. Tests

### Policy and free boundary

- Corrected policy boundary suite: **12/12 PASS**, exit 0 (newly executed).
- Focused `free-edition-audit` + policy: **15/15 PASS**, exit 0 (newly executed).
- New coverage: null/primitive/array input; uniform result keys on success and every invalid path; frozen results; invalid node/caller; unsupported edition; missing-context 301; free callerMax=1000 still rejects 301.
- Existing free application default 300/301 and existing-map preservation are covered by `free-edition-audit.test.mjs` and the main-entry suites.

### Full serial free regression — retained evidence, not a fresh run

The following full-suite result is retained from the previous Stage 1A candidate. It was **not re-executed** after this contract-only correction. It is shown to distinguish retained evidence from the freshly executed focused tests above.

| Run | Tests | Pass | Skip | Fail | Exit |
|---|---:|---:|---:|---:|---:|
| p1b-main | 69 | 69 | 0 | 0 | 0 |
| Remaining (includes 8 new policy tests) | 1,076 | 1,075 | 1 | 0 | 0 |
| **Aggregate** | **1,145** | **1,144** | **1** | **0** | **0** |

The single skip is `tests/engine/persistence/recovery.test.mjs:276`: “concurrent legacy and recovery writes cannot both pass obsolete totals.” Reason: FakeIndexedDB stages overlapping readwrite transactions; native IndexedDB serialization is NOT RUN. This is the pre-existing skip.

No existing test was changed, skipped, or weakened. The policy boundary tests are **not** evidence of successful 1,000-node application support. Current 1,000 layout/render remains NOT RUN/FAIL as documented in the performance report.

### Application defaults unchanged

- Candidate source/test/vendor diff against the accepted packet: **3 added files, 0 removed, 0 modified**:
  - `src/engine/hypertree/edition/index.js`
  - `src/engine/hypertree/edition/policy.js`
  - `tests/engine/edition/edition-policy.test.mjs`
- `EDITOR_MAX_NODES` remains 300.
- `MAX_SAVED_MAP_NODES` remains 300.
- Attachment limits remain 20 MiB per file / 100 MiB total.
- No production file imports the edition policy.
- No active app behavior changed.

### Packaging verification

The candidate archive was built and extracted separately. Its source/test/vendor tree has:
- 3 added files vs the accepted packet (edition index/policy and policy test);
- 0 removed files;
- 0 modified source/test/vendor files;
- corrected focused policy/free-boundary smoke **15/15 PASS** from the extracted candidate.
- Vendor `vendor/jit/jit.2.0.1.js`, `LICENSE`, and `MANIFEST.json` are present.

The retained full 1,145-test serial run was performed on the previous Stage 1A candidate before this contract correction. The corrected archive changes only policy/test/report files; no production consumer or existing application file changed. The full suite was not presented as freshly rerun after the correction.

## 7. PASS / FAIL / NOT RUN

**PASS**
- Central immutable edition definitions.
- Pure deterministic policy and decision objects.
- Free 299/300/301; isolated paid 999/1,000/1,001.
- Invalid counts/callers/context rejection.
- Caller caps cannot elevate.
- Uniform ten-property result contract, including invalid inputs.
- Input immutability.
- Defaults remain 300; no app integration.

**FAIL**
- None in Stage 1A policy tests.

**NOT RUN / unresolved**
- 1,000-node layout/render/browser performance.
- Consumer integration (Stage 1B/later).
- Read-only/export/expiry/recovery policy behavior.
- Paid UI, entitlement, account, payment, cloud, deployment.
- Tablet/phone.

## 8. Residual risks / review focus

1. The policy defines proposed paid 1,000 but does not make the application support it.
2. Existing edition guards are duplicated across persistence/editor layers; Stage 1B must thread a single decision without removing integrity checks.
3. The 300 diagnostic cap and layout stage infeasibility remain separate technical blockers.
4. The 50-result search cap may limit discoverability at 1,000; later navigation work must address it.
5. Free default must remain 300 in every future consumer integration.
