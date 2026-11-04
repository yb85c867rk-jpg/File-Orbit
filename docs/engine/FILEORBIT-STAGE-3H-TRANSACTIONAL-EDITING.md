# FileOrbit Stage 3H — transactional LOD editing and Undo/Redo

## Baseline

Reviewed Stage 3G candidate:
`fileorbit-stage3g-creation-editor-r169.zip`
SHA-256: `6CC20507B9B4A82F9429C77FF88A72CC3AAC6F86BF1C70A7FDDE9C111DA12E57`

Baseline preserved. Stage 3H is a separate candidate.

## Transaction boundary and ownership

| Resource | Owner | Transaction behavior |
|---|---|---|
| Document tree/graph | Live runtime document | Authoritative; candidate works on a clone; replaced only at commit |
| Attachment registry | Runtime bridge | Candidate bridge adopts all retained attachments; old bridge disposed after swap; IDs/hashes preserved |
| Presentation model/renderer | Runtime bridge | Candidate model/adapter prepared against detached staging host; old bridge disposed only after commit |
| Selection/navigation/page | Runtime view snapshot | Captured before preparation; applied to candidate; deleted selection gets explicit parent/null fallback |
| History | `createEditorHistory` | Entry planned before commit; commit only after state replacement; undo/redo commit only after replay install |
| Revision/dirty | Runtime | Increment after successful install; failure/stale leaves live revision/dirty intact |
| Identity | Loaded map | `mapId`/generation retained; presentation proxies never serialized |

`prepare()`:
- builds command through existing command builders;
- re-admits the candidate with the trusted context and actual node count;
- builds a detached candidate bridge/registry/frame;
- captures history entry and plans history;
- does not mutate/dispose the live runtime.

`commit()`:
- revalidates base revision, dataset token, and candidate capacity;
- swaps staging host and state;
- commits history;
- increments revision/dirty;
- disposes the old bridge.

Failure, stale, cancellation, or render preparation failure disposes candidate-owned bridge/host/registry and preserves live state, history position, revision, and dirty state.

Undo/Redo use the existing replay command builders, actual history plans, real candidate installation, and commit history movement only after success.

## Behavior

- Rename, metadata edit, folder/data edit, add-child folder/file, and delete.
- Subtree delete/restore including empty folders and attachments.
- Metadata-only edits preserve scene membership/page.
- Deleted selected nodes fall back explicitly (parent or no selection).
- No full-document V2 refinement is used by the LOD transaction.
- Proxies remain presentation-only.

## Tests

Model/runtime tests:

- All five fixtures at 300 and 1,000: rename, delete, Undo, Redo, exact IDs restored.
- Add at 299→300 and 999→1,000; 300/1,000 rejection without mutation.
- Delete subtree with attachments/empty folder; Undo restores exact metadata and attachment SHA-256.
- Stale prepared transaction rejected at commit; live revision/name preserved.
- Candidate render failure with invalid staging host preserves live state.
- New command after Undo clears Redo branch; repeated Undo/Redo.
- Save/reopen and recovery checkpoint round trips after edit, with same document identity and advanced generation.
- Runtime dispose makes further access fail.

Browser evidence (actual controls):
- Mount editable runtime; rename document; Undo; Redo.
- Metadata edit and Undo.
- Delete attachment-bearing file; Undo; preview text content.
- Delete again to free capacity; add folder; scene/host remains one canvas.
- Navigation breadcrumb, search reveal, preview.
- Before unmount: frame children 1, preview children 2.
- After unmount: frame children 0, preview children 0.
- Browser errors 0.

Screenshots: `01-mounted.png`, `02-rename.png`, `03-preview-restored.png`, `04-search.png`; raw JSON `browser-evidence.json`.

## Final execution totals

- Focused Stage 3H/editor/LOD/persistence: **158 tests, 157 pass, 1 skip, 0 fail**, exit 0
  - Stage 3H runtime tests: 5/5 PASS
- `p1b-main`: **69/69 PASS**, exit 0
- Complete free regression: **1,264 tests, 1,263 pass, 1 skip, 0 fail**, exit 0
  - Remaining: 1,195 tests, 1,194 pass, 1 skip
- Skip: pre-existing FakeIndexedDB overlapping-readwrite case; native IndexedDB concurrency NOT RUN.

Machine-readable summary is generated from final logs and verified against these totals.

## Limitations

- This stage is an isolated LOD editing runtime; normal-app paid admission/LOD activation remains off.
- Complete paid editing/installation across the normal app, production LOD, and all editor surfaces is not claimed.
- PDF rendering, FPS, native IndexedDB concurrency, Upload/cloud/payments/Upgrade/Tauri/enterprise/deployment/publishing are NOT RUN/out of scope.
- V2 geometry checks were not relaxed.
- Narrow-host label limitation and prior Stage 3E limitations remain.

## Changed files

- `analysis/stage3h/editable-runtime.mjs`
- `analysis/stage3h/app.mjs`
- `analysis/stage3h/index.html`
- `analysis/stage3h/browser-evidence.mjs`
- `analysis/stage3h/browser-evidence.json` + 4 screenshots
- `tests/engine/persistence/stage3h-editable-runtime.test.mjs`
- `tools/test-summary.mjs`
- `evidence/stage3h/test-summary.json` + final logs
- `docs/engine/FILEORBIT-STAGE-3H-TRANSACTIONAL-EDITING.md`

No main.mjs changes; no normal-app paid/LOD activation; no commercial policy change.

## PASS / FAIL / NOT RUN

**PASS**
- Transactional candidate preparation/admission at install boundary.
- Rename/metadata/add/delete and actual Undo/Redo.
- Subtree deletion/restoration with attachments and empty folders.
- Stale/render-failure/branch/replay preservation.
- Exact IDs/topology/metadata/attachment SHA-256.
- Save/reopen and recovery round trips.
- All five fixtures at 300/1,000.
- Actual browser editing/navigation/search/preview and cleanup.
- Full free regression.

**FAIL**
- None in executed checks.

**NOT RUN / LIMITATIONS**
- Normal-app paid editing/LOD activation; complete paid editing/install across all surfaces.
- PDF rendering, FPS, native IndexedDB concurrency.
- Upload/cloud/payments/Upgrade/Tauri/enterprise/deployment/publishing.
