# FileOrbit Stage 3I — promoted transactional editing runtime

## Baseline

Reviewed Stage 3H correction:
`fileorbit-stage3h-rollback-attachment-correction-r169.zip`
SHA-256: `0780C257685EA6119C3497C079376EFC4254887291CB7ACC029316391B923286`

Baseline preserved. Stage 3I is a separate candidate.

## Production layout

Promoted implementation:
`src/engine/hypertree/editor/runtime/`

- `editable-runtime.js` — transaction preparation/ownership, command preparation, commit/cancel/replay lifecycle.
- `attachment-state.js` — attachment maps, tree-reference verification, current/history retention, usage accounting.
- `document-state.js` — authoritative loaded-document replacement and identity-preserving attachment bytes.
- `presentation.js` — validated view capture/reconciliation after topology changes.
- `host-publication.js` — host configuration contract, captured-parent/anchor swap, rollback.
- `history-state.js` — history retention entries and bridge resource sweep.
- `testing.js` — explicit fault-seam factory, not imported by normal application modules.
- `index.js` — public runtime entry point.

Compatibility wrapper:
`analysis/stage3h/editable-runtime.mjs` now re-exports the production runtime. It contains no implementation and no analysis/fixture dependencies.

Dependency audit:
- production runtime imports only production editor/LOD/persistence modules;
- no `analysis/`, fixture, test helper, paid-context construction, or browser-evidence import;
- fault injection is an explicit `faults` seam supplied by tests, not a normal-app import.

## Host configurations

Supported:

1. **Model-only**
   - `host: null`, `candidateHostFactory: null`
   - no renderer; scene/model operations only.
2. **Rendered attached host**
   - live host element plus `candidateHostFactory`;
   - factory is mandatory; constructor throws if omitted;
   - every prepare must produce a staging host; a null staging host rejects preparation;
   - candidate frame is rendered before publication;
   - commit swaps host, failure restores captured parent/anchor.
3. **Detached/headless staging**
   - host with no parent, with factory; or factory without a live host;
   - candidate renderer remains detached;
   - no attached map is blanked; no live DOM publication occurs.

Attached host rollback:
- captures original host, parent, and next anchor;
- replaces candidate with old host on failure;
- removes candidate host;
- exact same mechanism for command commit and Undo/Redo.

## Resource ownership

| Resource | Owned by | Release |
|---|---|---|
| Current document tree | runtime current bridge | replaced only at commit; old bridge disposed after commit point |
| Current attachment payloads | current loaded document + bridge registry | swept when no current tree/history reference remains |
| Undo/Redo retained attachments | history entries (`attachmentRefs`) | released on history eviction, Redo-branch replacement, or runtime disposal |
| Pending transaction tree/attachments | pending transaction record + candidate bridge | cancel, rejection, stale, or runtime disposal |
| Renderer/host | current bridge adapter + live/staging host | old bridge disposed after commit; candidate removed on failure; frame cleared by harness unmount |
| Preview URLs | bridge-owned map | revoked on bridge dispose |
| App preview elements | harness/app | elements cleared on refresh/unmount; URLs not double-revoked |

Attachment retention sweep:
- after successful commit or Undo/Redo, resources are swept against the current tree plus undo/redo entries;
- evicted/cleared Redo entries no longer pin payloads;
- `currentLoaded.attachments` is filtered to retained IDs;
- current-document bytes and retained-history bytes are reported separately by `runtime.usage`;
- pending candidate bytes are reported separately;
- 20 MiB/file and 100 MiB/map limits remain enforced.

## Preserved Stage 3H corrections

- runtime-owned opaque single-use transactions;
- foreign/forged/consumed/cancelled/disposed rejection;
- commit-time identity/dataset/revision/policy/actual-count revalidation;
- no-op commands without revision/history changes;
- 40/41 presentation reconciliation;
- captured-parent/anchor DOM rollback;
- null-safe Undo/Redo publication failures;
- post-commit teardown reporting;
- attachment-ID collision rejection;
- explicit retained-payload reuse;
- tree-reference metadata verification.

## Tests

- Existing Stage 3H regression suite now imports the promoted production runtime.
- Added host-configuration contract test.
- Added attachment retention/usage test:
  - current vs history bytes;
  - delete attachment → history retention;
  - Undo/Redo;
  - 20-entry eviction releases unreachable payload;
  - pending transaction bytes and cancellation cleanup.
- All prior ownership/no-op/collision/host/failure/topology tests retained.

## Browser evidence

Actual isolated controls against the promoted implementation:

- editing, Undo/Redo, no-op, real file attachment addition/preview;
- attached-host rollback: same old host connected, one stage/canvas, `history-publish-failed`, state/revision unchanged;
- cluster-boundary deletion/Undo;
- search and preview;
- full unmount: frame children 0, preview children 0;
- browser errors 0.

Screenshots: `01-mounted.png`, `02-rename.png`, `03-preview-restored.png`, `04-search.png`, `05-add-file.png`, `06-cluster-boundary.png`.

## Final execution totals

- Focused Stage 3I/editor/LOD/persistence: **167 tests, 166 pass, 1 skip, 0 fail**, exit 0
  - Promoted runtime tests: **14/14 PASS**
- `p1b-main`: **69/69 PASS**, exit 0
- Complete free regression: **1,273 tests, 1,272 pass, 1 skip, 0 fail**, exit 0
  - Remaining: 1,204 tests, 1,203 pass, 1 skip
- Skip: pre-existing FakeIndexedDB overlapping-readwrite case; native IndexedDB concurrency NOT RUN.

Machine-readable summary is generated from final logs and verified against these totals.

## Limitations

- No normal-app paid/LOD activation.
- Detached/headless host paths are model-supported; browser evidence covers attached hosts.
- Preview URLs are bridge-owned; app does not independently revoke them.
- PDF rendering, FPS, native IndexedDB concurrency NOT RUN.
- Narrow-host label limitation remains.
- No Upload/cloud/payments/Upgrade/Tauri/enterprise/deployment/publishing/OntoMap.

## Changed files

- `src/engine/hypertree/editor/runtime/*` (new production runtime modules)
- `src/engine/hypertree/lod/saved-document-bridge.js` (attachment sweep hook)
- `analysis/stage3h/editable-runtime.mjs` (compatibility re-export)
- `analysis/stage3h/app.mjs`, `index.html`, browser evidence
- `tests/engine/persistence/stage3h-editable-runtime.test.mjs`
- `evidence/stage3i/test-summary.json` + logs/browser evidence
- `docs/engine/FILEORBIT-STAGE-3I-PROMOTED-RUNTIME.md`

## PASS / FAIL / NOT RUN

**PASS**
- Production promotion with no analysis/test/paid dependencies.
- Compatibility wrapper consumes production.
- Host configuration enforcement and captured DOM rollback.
- Attachment current/history/pending ownership and eviction sweep.
- All Stage 3H corrections and previous regressions.
- Browser editing/Undo/Redo/rollback/attachment/search/unmount.
- Full free regression.

**FAIL**
- None in executed checks.

**NOT RUN / LIMITATIONS**
- Normal-app paid integration.
- Real detached-host browser scenario.
- PDF/FPS/native IndexedDB.
- Upload/cloud/payments/Upgrade/Tauri/enterprise/deployment/publishing.
