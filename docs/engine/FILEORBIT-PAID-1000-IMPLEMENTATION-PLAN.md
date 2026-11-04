# FileOrbit paid 1,000-node edition — implementation plan

Status: planning only. Do not implement paid features until ChatGPT reviews this plan and issues an implementation prompt.

Accepted baseline: `review/fileorbit-pc-free-edition-readiness-r169.zip`, SHA-256 `E7608F387E5A9676CEF8F908B77241A26469ADCFB5889D00B4795FFDD6ADA441`.

## Stage 0 — Baseline freeze and profiling

### Outcome
- Accepted free-edition packet remains unchanged.
- A disposable profiling copy and fixtures exist.
- Baseline identity and performance evidence are recorded.

### Files / artifacts
- `docs/engine/FILEORBIT-PAID-1000-PERFORMANCE.md`
- `analysis/paid-1000/benchmark-layout.mjs`
- `analysis/paid-1000/browser-profile.mjs`
- `analysis/paid-1000/search-profile.mjs`
- `analysis/paid-1000/fixtures/*.orbit`
- `analysis/paid-1000/*.json`

### Dependencies
- Accepted r169 baseline.
- No product changes.

### Tests / evidence
- Verify baseline archive SHA.
- Re-run 300/1,000 layout benchmark.
- Record 300 browser metrics; mark 1,000 browser NOT RUN if layout fails.

### Exit criteria
- Current 1,000 failure mode is reproducible.
- No baseline file modified.

### Rollback
- Analysis files only; delete profiling artifacts if required.

### Review evidence
- Baseline SHA and source manifest.
- Benchmark JSON/browser JSON.

## Stage 1 — Edition policy structure (shadow mode)

### Stage 1A/1B-1 status

- Stage 1A delivered central definitions and pure policy in the previous candidate.
- Stage 1B-1 delivered free-only integration for creation, directory collection, editor admission, and add-child.
- Stage 1B-2 delivered free-only saved-document, backup/import, runtime, and recovery integration.
- Layout integration and paid admission remain later. See `FILEORBIT-PAID-1000-STAGE-1B-2.md`.

### Stage 1B (not started)

Thread the policy through application consumers after review. The work items below describe Stage 1B, not current behavior.

### Outcome
- Central edition limits/policy exists and defaults to free.
- All operations can receive explicit limits without changing visible behavior.
- Paid features remain disabled.

### Likely files
- New `src/engine/hypertree/edition/policy.js`
- New `src/engine/hypertree/edition/limits.js` (or integrate policy)
- `src/engine/hypertree/editor/validation.js`
- `src/engine/hypertree/exploration/create-map.js`
- `src/engine/hypertree/exploration/directory-selection.js`
- `src/engine/hypertree/persistence/schema.js`
- `src/engine/hypertree/persistence/backup.js`
- `src/engine/hypertree/persistence/codec.js`
- `src/engine/hypertree/persistence/repository.js`
- `src/engine/hypertree/persistence/runtime.js`
- `src/engine/hypertree/persistence/recovery-*.js`
- `tests/harness/m5-exploration/main.mjs`
- New `tests/engine/edition/policy.test.mjs`

### Dependencies
- Decisions: free 300 and paid 1,000 boundaries are fixed by this brief.
- No payment/account decisions needed for shadow mode.

### Implementation constraints
- `EDITOR_MAX_NODES` remains 300 as free default.
- All APIs accept explicit max/access; no global mutable paid flag.
- Shadow policy may log/return access decisions; it must not enable paid editing.
- No `.orbit` format change, no license field.

### Tests / acceptance
- Free 299/300/301 behavior identical.
- Fake paid policy 999/1,000/1,001 unit boundaries.
- Free full suite remains 1,137/1,136/1 (or current accepted count).
- No UI or behavior change without a policy override.

### Rollback
- Delete policy module and revert plumbing; default constant behavior remains.

### Review evidence
- Policy API and table.
- Free suite log.
- Boundary test log.
- Diff showing paid path disabled by default.

## Stage 2 — 1,000-node layout, label, and performance prototype

### Outcome
- A disposable branch/prototype demonstrates a viable 1,000-node scene.
- Decision recorded: optimized full layout vs cluster/focus LOD.
- No paid UI; prototype gated off.

### Likely files
- `src/engine/hypertree/layout/experimental-metrics.js`
- `src/engine/hypertree/layout/experimental-v2-refinement.js`
- `src/engine/hypertree/layout/experimental-v2.js`
- Possible new `layout/lod-*.js` or `layout/cluster-*.js`
- `src/engine/hypertree/render/label-overlay.js`
- `src/engine/hypertree/render/scene.js`
- `src/engine/hypertree/render/graph-renderer.js`
- `src/engine/hypertree/interaction/hit-test.js`
- `src/engine/hypertree/exploration/search.js` / `search-activation.js`
- `tests/harness/m5-exploration/main.mjs`

### Work items
1. Replace O(N²) diagnostic metrics with spatial-grid metrics (or make diagnostics optional in production).
2. Re-test 1,000 stage/refine across flat/wide/deep/mixed/balanced.
3. If stage remains infeasible, implement cluster/focus LOD:
   - full graph retained;
   - visible subset/cluster proxies;
   - expansion on focus/zoom/search;
   - no document ID changes.
4. Enforce priority labels: root, selected, focused folder, hovered, search result.
5. Add generation/cancellation token and stale-result rejection.
6. Add scene-level culling/resource cleanup.
7. Instrument open-to-interactive, frame p95, selection/search latency, visible-label counts, heap.

### Dependencies
- Stage 1 policy.
- Decision: is every node reachable via focus/zoom/search (recommended yes)?
- Decision: overview shows folder/cluster proxies vs all node dots.

### Tests / acceptance
- 1,000 fixtures successfully open in disposable copy.
- No node lost; model node count remains 1,000.
- All node IDs discoverable through search/focus; hit testing matches rendered positions.
- Label priority tests for selected/search/focused.
- Frame budget target p95 ≤33 ms (proposed).
- Free 300 behavior unchanged; full free suite pass.

### Rollback
- Feature flag/`>300` LOD path off; free path unchanged.
- Keep full-layout prototype isolated.

### Review evidence
- Benchmark before/after.
- Screenshots of overview/focus/zoom/search.
- Reachability and hit-test results.
- Decision memo: full layout vs LOD.

## Stage 3 — 1,000-node data lifecycle and compatibility

### Outcome
- Paid-size documents can be created/imported/opened/edited/saved/recovered with integrity.
- Free/paid compatibility and read-only behavior implemented (subject to decisions).
- Free behavior remains default.

### Likely files
- Stage 1 policy/limit consumers.
- `editor/validation.js`, `editor/action.js`, `editor/history-*.js`
- `persistence/*` all codecs/repository/runtime/recovery
- `tests/harness/m5-exploration/main.mjs`
- `tests/engine/edition/*`, persistence/recovery tests

### Work items
- Thread policy/access through create, collect, import, open, editor, save, backup, recovery.
- Add 999/1,000/1,001 integration tests for each entry point.
- Paid-size file opened free: read-only/export-preserving (if approved); no truncation, no rewrite.
- Expired/unavailable entitlement: read-only/export-preserving (if approved).
- Preserve IDs/topology/metadata/attachment hashes.
- Ensure recovery preserves over-free documents.
- No successful save/download after policy denial.

### Dependencies
- Stage 2 layout support (to display 1,000).
- Decisions 6–9 from requirements (free read-only/export, expiry behavior).
- No payment provider needed if entitlement is stubbed.

### Tests / acceptance
- 300/301 free; 999/1,000/1,001 paid.
- Open paid file free; verify full node count, IDs/topology/attachments, no writes.
- Save/reopen/recovery at 1,000 with attachments.
- Cancellation/stale save/recovery.
- Free suite unchanged.

### Rollback
- Policy override off; free defaults; container unchanged.

### Review evidence
- Boundary matrix per operation.
- Hash/ID/topology comparison logs.
- Read-only/export tests.
- Full regression totals.

## Stage 4 — Upgrade and entitlement implementation (only after commercial approval)

### Outcome
- Upgrade → plan info → account/payment (external) → server-verified entitlement → paid features enabled.
- Enforcement is server-verified, not a client-only flag.

### Likely files
- New `src/engine/hypertree/edition/entitlement.js`
- New `src/engine/hypertree/edition/entitlement-store.js`
- Upgrade UI in harness shell (`tests/harness/m5-exploration/index.html`, `main.mjs`, new dialog module)
- Server-facing verification interface (no server implemented in this stage unless separately authorized)

### Work items
- Define entitlement states: free, paid-active, paid-expired, pending, unavailable.
- Verify purchase result server-side; signed proof/cache.
- Apply policy live without remounting document; preserve open document, draft, selection, destination.
- Cancellation/failed activation/refund/expiry flows.
- Offline cached policy per approved decisions.
- Distinguish QA feature flag from commercial enforcement.

### Dependencies
- Product decisions: licensing model, pricing, account, payment provider, tax/refund, offline grace, device limits.
- No payment/account work is authorized until these are approved.

### Tests / acceptance
- Verified activation, forged client result rejected, cancellation/failure, expiry, refund.
- Open document/editor draft preserved across activation.
- No paid access without valid entitlement.
- Offline behavior exactly matches approved policy.

### Rollback
- Entitlement provider off; default free; no document migration.

## Stage 5 — Regression and acceptance

### Outcome
- Paid 1,000 PC acceptance under Chrome/Edge.
- Free acceptance preserved.

### Tests
- Full free suite (split serial).
- New edition/layout/persistence integration suites.
- 300 vs 1,000 performance comparison.
- Actual PC manual: create/open/save/reopen, conflict, recovery, search, labels, previews, upgrade/expiry.
- Tablet/phone deferred as already documented.

### Evidence
- Test totals/exits/skips.
- Browser/native screenshots and measurement JSON.
- Hash/ID/topology/attachment verification.
- Free/paid boundary matrix.
- Final archive + SHA manifest.

### Rollback
- Keep free baseline archive and prior paid archive; feature gate off; no format migration.

## Recommended first implementation stage

**Stage 1 — Edition policy structure (shadow mode).**

Reason: it creates the single policy/limit boundary required by every later stage without enabling paid behavior or changing document format. It can be implemented and reviewed while the layout LOD decision and commercial decisions remain open.

Stage 1 must not:
- raise the default free limit;
- enable paid creation/editing;
- add Upgrade UI or payment code;
- change `.orbit` content;
- modify the accepted baseline archive.

After Stage 1, ChatGPT should review the policy API and boundary tests before authorizing Stage 2 layout work.
