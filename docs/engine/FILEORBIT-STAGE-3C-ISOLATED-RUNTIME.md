# FileOrbit Stage 3C — edition-aware isolated runtime reconstruction

## Baseline

Reviewed corrected Stage 3B candidate:
`fileorbit-stage3b-repository-recovery-corrected-r169.zip`
SHA-256: `5E14B97572EBA520F065156ABACFE8EBBA0CA1EAB020077F34E134742DCB75A5`

Baseline archive preserved. Stage 3C is a separate candidate.

Stage 3B report totals corrected per review to:
**1,227 tests, 1,226 passed, 1 skipped, 0 failed.**
This is a report correction from retained Stage 3B logs; no additional Stage 3B run is claimed.

## Context flow

`reconstructSavedMapRuntime` / `loadSavedMapRuntime` / `admitSavedMapRuntime`
→ `resolveSavedMapNodeLimit(callerMaxNodes, policyContext)`
→ `resolvePolicyContext` issued-context validation
→ load stored tree structurally without an edition cap
→ actual node count
→ declared/actual consistency
→ context + caller capacity decision
→ attachment adoption
→ isolated V2 layout/refinement.

Important correction: `maxNodes` no longer defaults to `MAX_SAVED_MAP_NODES` (300). It defaults to `null`, allowing the paid context to supply 1,000. A caller may tighten but cannot elevate the context limit. Omitted caller limits no longer cap a valid paid context at 300.

Capacity and consistency are checked before attachment adoption or layout. Structural tree errors remain `runtime-reconstruction-failed`; count inconsistency remains `node-count-inconsistent`; capacity returns `node-limit`; invalid contexts return `invalid-policy-context`.

No authority is inferred from loaded records or document metadata.

## Isolated admission boundary

Added `admitSavedMapRuntime`:

- validates load result, dataset token, viewport, context, and caller budget;
- loads tree structurally;
- validates actual vs declared count;
- applies capacity;
- returns graph/tree/map identity without adopting attachments or running layout.

A successful admission result is explicitly **not** proof of readable rendering. `reconstructSavedMapRuntime` uses the same admission path and then performs attachment adoption and V2 layout.

## V2 geometry limitation

Measured separately:

- Paid 1,000-node data admission succeeds.
- Free 300-node runtime reconstruction succeeds with text/image/PDF/zero-byte attachments and exact SHA-256.
- Paid 1,000-node V2 reconstruction currently fails with:
  `runtime-reconstruction-failed: ... no workspace scale up to 16 satisfies angular clearance`
  for the representative broad-root fixture. This is an existing V2 geometry constraint, not a capacity/admission failure.

V2 refinement receives the effective runtime diagnostic bound; the layout/refinement algorithms are unchanged. No production LOD was activated. A successful paid admission is reported as admission only, not as readable rendering.

## Tests

`tests/engine/persistence/stage3c-runtime-context.test.mjs`:

1. Free 299/300 admitted; 301 `node-limit`.
2. Paid 999/1,000 admitted; 1,001 `node-limit`.
3. Lower paid-context and caller budgets tighten; higher caller budget cannot elevate free.
4. Malformed/forged context and forged declared count fail closed.
5. Paid repository load followed by same-context admission; free override rejected; paid reconstruction reaches the documented V2 geometry blocker.
6. Free 300 reconstruction preserves four attachment payloads (text/image/PDF/zero-byte) and SHA-256; repeated dispose/reconstruct is safe.
7. Paid 1,000 admission succeeds while reconstruction reports the V2 geometry blocker.
8. `loadSavedMapRuntime` threads context and returns typed free/paid capacity errors.

Existing runtime tests continue to cover actual/declared mismatch, pre-attachment rejection, caller-owned input preservation, free 300, and 301.

## Operation boundary

| Operation | Free | Paid test | Result |
|---|---:|---:|---|
| Data admission 299/300 | accepted | — | — |
| Data admission 301 | rejected | — | `node-limit` |
| Data admission 999/1,000 | — | accepted | — |
| Data admission 1,001 | — | rejected | `node-limit` |
| Context caller budget 100 over 300 free | rejected | — | context wins, `node-limit` |
| Forged context | rejected | rejected | `invalid-policy-context` |
| Forged declared count | rejected | rejected | `node-count-inconsistent` |
| Runtime 300 with attachments | accepted | — | V2 layout succeeds |
| Runtime 1,000 broad-root | — | admission accepted | V2 geometry blocker |
| Repository load paid + same context | — | accepted | — |
| Repository load paid + free override | rejected | — | `node-limit` |

## Changed files

- `src/engine/hypertree/persistence/runtime.js`
- `src/engine/hypertree/persistence/index.js`
- `tests/engine/persistence/stage3c-runtime-context.test.mjs`
- `docs/engine/FILEORBIT-STAGE-3C-ISOLATED-RUNTIME.md`
- Stage 3B correction report totals corrected.

No change to repository/recovery protections, Orbit format, database version, schemas, attachment limits, Orbit Folder stale protection, search/PDF colors, or LOD harnesses.

## Tests executed

- Focused runtime/persistence suite: **99 tests, 98 pass, 1 skip, 0 fail**, exit 0
  - Stage 3C tests: 8/8 PASS
  - Skip: pre-existing fake-IndexedDB overlapping-readwrite case; native IndexedDB concurrency/durability NOT RUN.
- `p1b-main`: **69/69 PASS**, exit 0
- Complete free regression: **1,235 tests, 1,234 pass, 1 skip, 0 fail**, exit 0
  - Remaining: 1,166 tests, 1,165 pass, 1 skip

Stage 3B report totals are separately corrected to the reviewed figure (1,227/1,226/1); the Stage 3C full run above is the actual fresh run on this combined tree.

## PASS / FAIL / NOT RUN

**PASS**
- Free 299/300 admission; 301 rejection.
- Paid 999/1,000 admission; 1,001 rejection.
- Omitted caller limit does not cap paid at 300.
- Lower context/caller budgets and anti-elevation.
- Malformed/forged context and forged count rejection.
- Paid repository load with same explicit context.
- Free 300 reconstruction with text/image/PDF/zero-byte attachment integrity and dispose/reconstruct.
- Stage 3B repository/recovery protections retained.
- Focused and complete free regression executed fresh.

**FAIL**
- None in executed focused/full tests.

**NOT RUN / BLOCKED**
- Paid 1,000 complete runtime reconstruction: V2 angular-clearance geometry blocker; admission passes separately.
- Native browser IndexedDB concurrency/durability; FakeIndexedDB only.
- Main-app paid activation, creation/editor UI, Upload, cloud, payments, Upgrade UI, Tauri, enterprise, deployment, publishing.



