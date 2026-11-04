# FileOrbit Stage 3H — transactional integrity correction

## Baseline preserved

Original Stage 3H candidate:
`fileorbit-stage3h-transactional-editing-r169.zip`
SHA-256: `EFA2354220F969B2EF4DE7D73BEC2BB4C90EBE9674F1071590A0CAB03659E902`

This is a separate corrected candidate. The original archive is unchanged.

## Six corrections

### 1. Runtime-owned single-use transactions

- Each runtime has a private ownership token and private pending-transaction map.
- Handles are frozen opaque objects; transaction state is **not** stored in caller-accessible fields.
- Commit resolves the handle in the issuing runtime only.
- Foreign, forged, cancelled, disposed, and consumed handles are rejected.
- At commit the runtime revalidates owner, `mapId`, dataset token, revision, trusted policy admission, actual candidate node count, and attachment integrity.
- A paid transaction committed by a free runtime returns `foreign-transaction`; the free document is untouched.
- Duplicate commit returns `consumed-transaction` and never disposes the live bridge.

### 2. No-op commands

- Commands returning a successful no-op get an explicit no-op handle.
- No candidate bridge, revision change, dirty transition, or history entry is created.
- Rename, metadata, folder edit, and data edit no-ops are covered.
- Repeated no-op invocation is safe.

### 3. Presentation reconciliation

`applyView` validates against the candidate model:

- current folder exists and is a folder;
- expanded proxy still exists in that folder and grouping is still active;
- folder/cluster pages are valid integers and clamped by `buildScene`;
- selected node and search target still resolve to visible items;
- invalid groups/pages fall back explicitly rather than throwing.

Covered: 41→40 cluster collapse, 40→41 restoration, deletion of cluster member, current-folder/subtree deletion, Undo/Redo, partial last pages, and changed proxy membership.

### 4. Failure atomicity and teardown

Defined commit point: **after host/state/history/revision/dirty publication**.

Before the commit point:

- injected host-replacement failure and history-publication failure restore document, loaded tree, host/DOM, history plan, revision, dirty state, and presentation;
- candidate resources are disposed;
- live runtime remains usable.

After the commit point:

- old-bridge teardown failure returns success with `teardownError`;
- it does not claim rollback and does not resurrect the old/disposed bridge;
- live new document remains published.

Equivalent behavior applies to Undo/Redo. Pending transactions are tracked; cancellation/runtime disposal releases candidate resources without touching live or foreign runtimes.

### 5. Attachment payload staging

File additions now require candidate-local payload staging:

- new attachment requires actual `File`/`Blob` payload;
- ID must not collide with a different retained payload;
- payload size must equal metadata size;
- per-file 20 MiB and 100 MiB/map limits enforced;
- every tree-referenced attachment must exist with metadata matching its payload;
- missing/mismatched payload fails before bridge/history publication;
- deleted payloads remain only as retained by the bounded runtime/undo state.

Covered: missing payload, size mismatch, real new-file add → preview → Undo → Redo → save/reopen → recovery with SHA-256, and cleanup.

### 6. Repeated commit safety

Consumed/rejected handles never dispose live resources. Delayed duplicate callbacks cannot tear down the published bridge. Pending candidate bridges are disposed only when still candidate-owned.

## Transaction lifecycle

1. `prepare` creates command/candidate clone and validates command admission.
2. No-op returns explicit no-op handle.
3. File additions stage payloads candidate-locally and verify ID/metadata/bytes/limits.
4. Candidate bridge/model/frame is built on detached staging host.
5. History entry is planned; no live state changes.
6. Handle is registered against issuing runtime.
7. `commit` validates owner, identity, dataset, revision, policy admission, actual count, attachments.
8. Host/DOM and state are published; history is committed; revision/dirty advance.
9. Commit point reached. Old bridge teardown failure is reported without rollback.
10. Handle is consumed; candidate no longer owns resources.

## Tests

- Runtime ownership: paid handle committed by free runtime rejected; paid document unchanged; free unchanged.
- Forged handle rejected.
- Duplicate commit consumed; live `scene()` still works.
- Cancelled handle consumed; live state preserved.
- Dispose with pending handle releases candidate; another runtime unaffected.
- No-op rename/metadata/folder/data: revision, dirty, history unchanged.
- 41→40 cluster collapse, 40→41 restoration, selected member deletion, Undo/Redo.
- Failure injection: host replacement, history publication, teardown; pre-commit rollback and post-commit `teardownError`.
- Undo/Redo teardown failure.
- New-file add without payload/size mismatch rejected.
- Real payload add, preview, Undo/Redo, save/reopen/recovery, SHA-256.
- Existing all-shape 300/1,000, boundaries, attachments, branch history retained.

## Browser evidence

Actual isolated controls:

- Rename → Undo → Redo.
- Metadata edit → Undo.
- Delete/Undo/restored attachment preview.
- No-op rename twice: revision and undo count unchanged.
- Add real file payload: preview text `새 첨부 내용`, revision advances.
- 41-child cluster boundary: overview → delete member → folder mode → Undo cluster mode.
- Search reveal and preview.
- Before unmount: frame children 1, preview children 2.
- After unmount: frame children 0, preview children 0.
- Browser errors: **0**.
- Screenshots: `01-mounted.png`, `02-rename.png`, `03-preview-restored.png`, `04-search.png`, `05-add-file.png`, `06-cluster-boundary.png`.

## Final execution totals

- Focused Stage 3H/editor/LOD/persistence: **163 tests, 162 pass, 1 skip, 0 fail**, exit 0
  - Corrected Stage 3H runtime tests: 10/10 PASS
- `p1b-main`: **69/69 PASS**, exit 0
- Complete free regression: **1,269 tests, 1,268 pass, 1 skip, 0 fail**, exit 0
  - Remaining: 1,200 tests, 1,199 pass, 1 skip
- Skip: pre-existing FakeIndexedDB overlapping-readwrite case; native IndexedDB concurrency NOT RUN.

Machine-readable summary is generated from final logs and verified against these totals.

## Limitations

- Isolated runtime only; normal-app paid editing/LOD activation remains off.
- Complete paid editing/install across all normal-app surfaces not claimed.
- Host replacement/history failure are injected model faults; real DOM host-replacement failure was not independently reproduced in browser.
- PDF rendering, FPS, native IndexedDB concurrency NOT RUN.
- Narrow-host label limitation remains.
- No Upload/cloud/payments/Upgrade/Tauri/enterprise/deployment/publishing/OntoMap.

## Changed files

- `analysis/stage3h/editable-runtime.mjs`
- `analysis/stage3h/app.mjs`
- `analysis/stage3h/index.html`
- `analysis/stage3h/browser-evidence.mjs`
- `analysis/stage3h/browser-evidence.json` + 6 screenshots
- `tests/engine/persistence/stage3h-editable-runtime.test.mjs`
- `evidence/stage3h-correction/test-summary.json` + final logs
- `docs/engine/FILEORBIT-STAGE-3H-CORRECTION.md`

No main.mjs changes; no normal-app paid/LOD activation.

## PASS / FAIL / NOT RUN

**PASS**
- Runtime ownership, foreign/forged rejection, single-use consumed/cancelled/disposed handles.
- Duplicate commit without live disposal.
- No-op command handling.
- Presentation reconciliation at 40/41 and replay.
- Pre-commit rollback and post-commit teardown reporting.
- Real attachment payload staging, preview, Undo/Redo, save/reopen/recovery, SHA.
- Browser execution of no-op, file addition, cluster boundary, Undo/Redo, navigation/search/preview.
- Full free regression.

**FAIL**
- None in executed checks.

**NOT RUN / LIMITATIONS**
- Normal-app paid integration.
- Real-browser host replacement failure (injected model fault only).
- PDF/FPS/native IndexedDB.
- Upload/cloud/payments/Upgrade/Tauri/enterprise/deployment/publishing.
