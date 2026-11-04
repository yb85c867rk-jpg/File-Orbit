# FileOrbit Stage 3H — rollback and attachment-collision correction

## Baseline preserved

Previous correction archive:
`fileorbit-stage3h-transactional-integrity-correction-r169.zip`
SHA-256: `5E7828FC6BC4590224943AD32091F7CF47845AD58F5DF36EA21E12008EC69278`

This is a separate corrected candidate. The archive is unchanged.

## 1. Actual-DOM rollback

Host publication now captures, before replacement:

- original host element;
- original parent node;
- original next sibling/anchor;
- candidate staging host.

The shared `swapCandidateHost` / `restoreHost` mechanism is used by command commit and Undo/Redo.

On any pre-commit failure:

- if the candidate was inserted, it is replaced back by the captured old host;
- if the old host was detached, it is reinserted at the captured anchor;
- candidate hosts are removed;
- no disposed candidate remains in the DOM;
- runtime host, document, loaded identity, history plan, revision, dirty state, and presentation remain old.

Cases handled:

- attached host with next sibling;
- attached host with no next sibling;
- old host detached/absent;
- no host at all;
- replacement error;
- history publication failure;
- null optional hosts.

After the commit point, teardown failure is reported as `teardownError`; it does not claim rollback or resurrect the old bridge.

## 2. Null-safe Undo/Redo failures

Undo/Redo now uses the same host swap/restore helper.

When `candidateHost` and `oldHost.parentNode` are both null:

- no parent dereference occurs;
- history-publication failure returns `{ ok:false, reason:'history-publish-failed' }`;
- tree, loaded identity, revision, dirty state, history cursor, presentation, and live bridge remain usable.

Tests cover Undo and Redo failures without hosts, plus an actual attached-DOM rollback in browser evidence.

## 3. Attachment-ID collision semantics

Explicit policy:

- **Retained reuse** requires `reuseAttachment:true` and no new payload.
  - Metadata must match the retained attachment exactly.
  - The candidate tree references the retained payload.
- **New payload with an existing ID** is rejected with `attachment-id-collision`.
  - No silent aliasing.
  - Caller must choose a distinct attachment ID.
- **New ID** requires an actual `File`/`Blob`.
  - Metadata size must equal payload size.
  - 20 MiB/file and 100 MiB/map limits apply.
- Tree reference metadata is checked against adopted attachment metadata:
  - `originalName`;
  - `sizeBytes`;
  - `mime`.
- No byte equality is inferred from equal name/size/MIME.
- No asynchronous digest lifecycle is introduced; collision is rejected synchronously before bridge/history publication.

Rejections leave live tree, registry, history, revision, dirty state, and attachment usage unchanged.

## Tests

Corrected runtime tests: **12/12 PASS**

- Runtime ownership, foreign/forged/consumed/cancelled/disposed handles.
- Duplicate commit safe.
- No-op commands.
- 41↔40 presentation reconciliation.
- Pre-commit history/host failure and post-commit teardown.
- Undo/Redo history failure with no hosts; cursor/state preserved.
- Attachment collision:
  - same ID, same metadata, different bytes → `attachment-id-collision`;
  - same ID without explicit reuse → `attachment-reference-required`;
  - same ID with differing metadata → `attachment-mismatch`;
  - explicit retained reuse → preview/SHA/Undo/Redo;
  - independent new ID/payload → distinct preview.
- Real new-file payload add → preview → Undo → Redo → save/reopen → recovery with SHA.
- Existing all-shape 300/1,000, capacity, no-op, proxy separation, topology/metadata/ID tests retained.

## Browser evidence

Actual attached-host rollback:

- Commit rename (`rollbackBefore`, revision 4).
- Arm history fault through the UI; invoke Undo.
- Undo rejected with `history-publish-failed`.
- Runtime host is the **same** old host, still connected.
- Actual DOM `.lod-stage` is the **same** old host.
- Stage count **1**, canvas count **1**.
- Tree/name remains `롤백-전.txt`; revision 4, undo 2/redo 0 unchanged.
- Clear fault; Undo succeeds (revision 5, name restored).

Other browser execution:

- no-op rename twice: revision/undo unchanged;
- real file attachment addition + preview `새 첨부 내용`;
- 41→40 cluster boundary → folder mode → Undo cluster mode;
- navigation, search, preview;
- before unmount frame 1 / preview 2; after 0 / 0;
- errors 0.

Screenshots: `01-mounted.png`, `02-rename.png`, `03-preview-restored.png`, `04-search.png`, `05-add-file.png`, `06-cluster-boundary.png`.

Model/injected failures and browser execution are reported separately above.

## Final execution totals

- Focused Stage 3H/editor/LOD/persistence: **165 tests, 164 pass, 1 skip, 0 fail**, exit 0
  - Corrected Stage 3H runtime tests: 12/12 PASS
- `p1b-main`: **69/69 PASS**, exit 0
- Complete free regression: **1,271 tests, 1,270 pass, 1 skip, 0 fail**, exit 0
  - Remaining: 1,202 tests, 1,201 pass, 1 skip
- Skip: pre-existing FakeIndexedDB overlapping-readwrite case; native IndexedDB concurrency NOT RUN.

Machine-readable summary is generated from final logs and checked against these totals.

## Limitations

- Isolated runtime only; no normal-app paid/LOD integration.
- Host/history failures are injected model faults; attached-DOM rollback is actual browser evidence.
- Detached-host replacement and absent-host paths are model-tested; no separate real-browser detached-host scenario.
- No asynchronous attachment byte-digest lifecycle; conflicting new payloads are rejected synchronously.
- PDF rendering, FPS, native IndexedDB concurrency NOT RUN.
- Narrow-host label limitation remains.
- No Upload/cloud/payments/Upgrade/Tauri/enterprise/deployment/publishing/OntoMap.

## Changed files

- `analysis/stage3h/editable-runtime.mjs`
- `analysis/stage3h/app.mjs`
- `analysis/stage3h/index.html`
- `analysis/stage3h/browser-evidence.mjs`
- `evidence/stage3h-rollback-correction/browser-evidence.json` + 6 screenshots
- `tests/engine/persistence/stage3h-editable-runtime.test.mjs`
- `evidence/stage3h-rollback-correction/test-summary.json` + logs
- `docs/engine/FILEORBIT-STAGE-3H-ROLLBACK-ATTACHMENT-CORRECTION.md`

No main.mjs changes; no normal-app paid/LOD activation.

## PASS / FAIL / NOT RUN

**PASS**
- Actual-DOM rollback on history publication failure.
- Null-safe Undo/Redo failure without hosts.
- Attachment collision/reuse semantics and metadata-reference checks.
- Attachment preview/SHA/Undo/Redo/save/reopen/recovery.
- Existing ownership/no-op/presentation/failure/capacity regressions.
- Browser attached-host rollback and attachment handling.
- Full free regression.

**FAIL**
- None in executed checks.

**NOT RUN / LIMITATIONS**
- Normal-app paid integration.
- Real detached-host browser scenario.
- PDF/FPS/native IndexedDB.
- Upload/cloud/payments/Upgrade/Tauri/enterprise/deployment/publishing.

