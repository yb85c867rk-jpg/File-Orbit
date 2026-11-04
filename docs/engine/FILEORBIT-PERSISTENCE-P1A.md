# FileOrbit Persistence P1a — Implemented Foundation

Status: **P1a IMPLEMENTED / P1b-P3 NOT IMPLEMENTED**  
Baseline: r34 behavior preserved  
Plan: `FILEORBIT-PERSISTENCE-AND-BACKUP-PLAN.md` revision r35.1  
Native browser durability: **NOT RUN**

P1a is internal only. There is no Save/Open UI and no automatic storage access in the normal harness startup.

## Public/shared APIs

### `src/engine/hypertree/persistence/schema.js`

- `DB_NAME`, `DB_VERSION=1`, `SCHEMA_VERSION=1`
- store names for `maps`, `mapDocuments`, `mapAttachments`, `settings`, `meta`
- `APPLICATION_LIBRARY_HARD_CAP_BYTES=512MiB`
- `QUOTA_SAFETY_RESERVE_BYTES=16MiB`
- `PersistenceError`, record validators

### `src/engine/hypertree/persistence/ids.js`

- `createMapId`, `createAttachmentId`
- `isPersistentId`, `assertMapId`, `assertAttachmentId`

Runtime dataset tokens are never used as durable IDs.

### `src/engine/hypertree/persistence/codec.js`

- `buildSaveSnapshot({tree, registry, mapping, mapId, expectedGeneration, datasetToken, capturedRevision, allocateAttachmentId})`
- `attachmentRefsFromSnapshot(snapshot)`

The snapshot clones the live tree, resolves Blobs through the runtime registry, builds a proposed runtime→persistent mapping, rewrites attachment references only in the persisted copy, validates 300 nodes, 20MiB/file, 100MiB/map, and returns the proposal without mutating live objects.

### `src/engine/hypertree/persistence/idb.js`

- `openPersistenceDatabase`
- `deletePersistenceDatabase`
- request/transaction helpers and normalized IDB errors
- upgrade stores/indexes (`by_modifiedAt`, `by_mapId`)
- blocked callback, versionchange closure, connection close

### `src/engine/hypertree/persistence/repository.js`

`createPersistenceRepository()` returns:

- `open`, `close`
- `save(snapshot)`
- `load(mapId)`
- `list()`
- `remove(mapId, {expectedGeneration})`
- `repairUsage()`
- `usage()`
- `estimate()`

Save uses one readwrite transaction across maps, documents, attachments, and `meta.libraryUsage`; stale generation, map collision, missing durable rows, application cap, and quota warnings are handled without treating request success as transaction success.

### `src/engine/hypertree/persistence/runtime.js`

- `createRestoredAttachmentRegistry({attachments, datasetToken})`
- `reconstructSavedMapRuntime({loaded, datasetToken, viewport})`
- `loadSavedMapRuntime({repository, mapId, datasetToken, viewport})`

The runtime candidate preserves stored node IDs, adopts persistent attachment IDs with explicit metadata, builds graph/layout/model, and does not touch live globals, frames, sessions, history, or object URLs. Callers must dispose the candidate registry.

### `src/engine/hypertree/editor/attachments.js`

Added `registry.adopt({attachmentId, file, metadata})` for persistent ID restoration. Blob is accepted; originalName/mime come from explicit metadata, not `Blob.name`.

## Schema

`maps` — light list metadata: `mapId`, name, timestamps, generation, node count, attachment bytes/count.  
`mapDocuments` — canonical tree and attachment refs.  
`mapAttachments` — compound `[mapId, attachmentId]`, Blob + metadata, `sha256:null`.  
`settings` — key/value; theme reserved for P1b.  
`meta` — transactional `libraryUsage` and schema marker.

Per-map attachment ownership. No deduplication, no persistent history.

## Validation and limits

- 300 nodes including root.
- 20 MiB per attachment.
- 100 MiB per saved map.
- 512 MiB application library hard cap.
- Admitted node/metadata/name limits from existing loader/editor rules.
- P1 structural/reference/size validation only. Same-size byte corruption is not detected and is not claimed.
- Persistent IDs are validated; node IDs preserved; sibling order preserved.
- Runtime dataset token/revision are not persisted.

## Executed tests

- Persistence tests: **70/70 pass** against the actual repository/codec and an IndexedDB-compatible transaction test double.
- Full `tests/engine`: **943/944 (1 skipped: fake IndexedDB concurrency limit) pass**.
- Existing editor/render/interaction/exploration regressions pass.
- Syntax checks pass.
- Native browser verification: **NOT RUN**.

Covered: first save/load/list/usage, non-mutating mapping proposal, metadata-only no Blob put, add-file only new Blob, delete→Undo→reinsert, injected transaction abort, stale generation, ID collision, missing/size/schema failure, authoritative row accounting, corrupt/missing/overreported summaries, orphan bytes, per-file/per-map/node/library limits, two repository connections, atomic deletion/usage, adoption/Blob compatibility, Unicode/legacy metadata, tree/document/row metadata mismatch, repeated references, snapshot-boundary mutation protection, null/deleted/non-null classification consistency at save/load, semantic classification key-order equivalence, rejected overwrite/new-save preservation, connection unavailable/failure/blocked/versionchange, storage estimate advisory.

## Test-double limitations

The test double models asynchronous requests, staged readwrite transactions, abort/rollback, upgrade transactions, indexes, and versionchange. It does **not** model real browser disk quotas, process-level transaction serialization across tabs, crash durability, eviction, or private-mode behavior. Native browser evidence remains NOT RUN.

## Deferred

P1b Save/Open UI and dirty replacement guard; P2 lifecycle/conflict hardening; P3 Download/Upload package. No dependencies, UI redesign, storage writes on normal startup, or native integration.




























































