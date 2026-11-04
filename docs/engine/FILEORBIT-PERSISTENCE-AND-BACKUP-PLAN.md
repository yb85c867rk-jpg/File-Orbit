# FileOrbit Persistent Storage and Map Backup — Implementation Plan

Status: **P1a IMPLEMENTED — P1b IMPLEMENTED — P2 IMPLEMENTED — P3 AUTOMATED SCOPE VERIFIED — NATIVE BROWSER ACCEPTANCE NOT RUN — PLAN REVISION r35.1**  
Planning baseline: **r34**, user-verified in the browser; archive SHA-256 `F5140E182EE282FA64D14600019814822DC05F0377E05F74156B427F6CB507E7E7`
Authorized project: `C:\Users\openw\Documents\Projects\visual-directory`

This document is source-grounded planning. P1a repository/codec/runtime and P1b explicit Save/Open UI are implemented. P2 storage lifecycle/quota/conflict hardening is implemented; P3 and folder-first large-map exploration remain plans. No automatic startup storage exists, and no browser durability verification is claimed.

### Revision r35.1 changes

- **R1:** exact non-mutating runtime→persistent attachment mapping lifecycle, proposal publication only after transaction completion, durable-row existence checks, and save/mapping sequences.
- **R2:** Policy A replacement guard for Save-before-Open/Create; ordinary Save remains non-locking and newer edits stay dirty; dataset/revision revalidation before discard.
- **R3:** durable attachments follow only the saved tree; runtime history is never a durable owner; Undo→Save reinserts missing Blobs and metadata-only saves verify durable rows.
- **R4:** 512 MiB renamed an application hard cap; transactional library usage; incremental/peak space accounting; P1 structural/size-only integrity with no false corruption claim; portable backup retains full SHA-256.

---

## 1. Approved storage decision and product boundary

**Selected storage:** IndexedDB in the browser.

Target platforms:

- desktop Chrome/Edge (PC)
- Android Chrome
- iPhone/iPad Safari browser or installed PWA

Stored data:

- map identity and metadata;
- authoritative tree and node metadata;
- original attachment Blobs;
- necessary application settings (initially theme).

Explicitly not selected:

- SQLite / WASM SQLite
- OPFS as the primary store
- backend or cloud synchronization
- native filesystem connection

### 1.1 Durability truth

Browser storage is **device-, browser-profile-, and origin-specific**. It is not:

- a backup;
- a synchronization service;
- guaranteed permanent storage;
- available across devices or browser profiles.

`navigator.storage.persist()` can reduce eviction risk where supported, but does not guarantee retention. Users can clear site data or lose storage through OS/browser cleanup. The portable Download package is the backup mechanism; IndexedDB is the working library.

No unload-time asynchronous save is promised. Dirty-state warning is synchronous only.

---

## 2. Actual source audit

### 2.1 Existing source inventory

All paths are relative to the project root.

| Source | Existing API / fact | Persistence relevance | Disposition |
|---|---|---|---|
| `src/engine/hypertree/data/tree-loader.js` | `loadTree()`, `normalizeLimits()`, strict plain-data tree validation | Validates saved/imported trees; enforces depth/node/id/name/metadata limits | **Reuse**, add persistence validator outside loader |
| `src/engine/hypertree/data/metadata.js` | `cloneMetadata()` | Canonical JSON-like node data cloning and limits | **Reuse** for snapshot/validation |
| `src/engine/hypertree/data/errors.js` | `TreeLoadError`, `LIMITS` | Bounds for saved/imported data | **Reuse** |
| `src/engine/hypertree/graph/graph.js` | `Graph`, `addNode()`, metadata limits | Builds candidate graph from validated saved tree | **Reuse** |
| `src/engine/hypertree/graph/node.js` | `GraphNode` with `id/name/kind/data` | Node identity and metadata carrier; layout fields are derived | **Reuse**; never persist layout fields |
| `src/engine/hypertree/editor/attachments.js` | `createAttachmentRegistry()`, `sweepAttachmentOwnership()` | Session registry, size caps, metadata, ownership sweep | **Extend** with persistent-record adoption / ID-preserving restore API |
| `src/engine/hypertree/editor/attachment-classification.js` | `MAX_ATTACHMENT_BYTES`, `MAX_ATTACHMENT_TOTAL_BYTES`, `classifyAttachment()`, `classifyFile()`, `readAttachmentPrefix()` | Format classification and 20 MiB/file, 100 MiB/dataset caps | **Reuse**; do not reclassify from contents on normal load if saved classification exists |
| `src/engine/hypertree/editor/attachment-viewer.js` | `resolveAttachmentViewerTarget({details, registry})`, viewer lifecycle | Looks up `registry.get(attachmentId)` and reads `.file` (Blob-compatible) | **Reuse**; no viewer change expected |
| `src/engine/hypertree/editor/validation.js` | `EDITOR_MAX_NODES=300`, `MAX_NAME_CODE_POINTS=200`, `createEditorIdAllocator()` | Active map node identity/allocation and limits | **Reuse**; saved maps must not exceed existing 300-node policy |
| `src/engine/hypertree/editor/commands.js` | `buildRenameCommand`, `buildAddChildCommand`, metadata/folder/data editors, delete/reparent builders | Clones live tree and produces candidate topology/metadata | **Reuse**; persistence captures committed tree only |
| `src/engine/hypertree/editor/action.js` | `performEditorCommandInstallation()`, rename/add/metadata/edit/delete installers | Atomic candidate install and history commit | **Reuse**; dirty/revision hooks added in main |
| `src/engine/hypertree/editor/history.js` | `createEditorHistory()`, bounded 20 entries / 2 MiB entry / 8 MiB total | Session Undo/Redo snapshots | **Reuse unchanged**; explicitly **not persisted** |
| `src/engine/hypertree/editor/history-replay.js` | `performMetadataHistoryReplay()`, `validateReplayAttachments()` | Undo/Redo candidate reinstall and attachment availability | **Reuse**; confirms history depends on live registry/Blobs |
| `src/engine/hypertree/editor/controller.js` | editor form state, dirty, saving | Draft state is not map metadata | **Reuse**; Save blocked while form open/saving |
| `src/engine/hypertree/exploration/create-map.js` | `prepareCreateMapCandidate()`, `normalizeRelativePath()` | Builds independent candidate tree and registry; IDs currently `cm-{datasetToken}-{counter}` | **Reuse**; persistence snapshots committed tree and allocates durable IDs |
| `src/engine/hypertree/exploration/reparent-action.js` | `installCandidateEnvironment()` | Candidate draw/labels/hits, commit/recover boundary | **Reuse** as the installation boundary for Open |
| `src/engine/hypertree/exploration/navigation-model.js` | `createExplorationModel()`, `details()` reads node `data.attachmentId` | Details/viewer resolve live attachment ID | **Reuse** with persistent attachment IDs adopted by registry |
| `src/engine/hypertree/exploration/search.js` | `searchTree()` | Search is derived from committed tree | **Reuse**; no saved/search results persisted |
| `tests/harness/m5-exploration/main.mjs` | live `tree`, `dataRevision`, `datasetToken`, `attachmentRegistry`, `history`, `installCreatedMap`, boot/empty startup, action wiring, Create Map terminal restoration | Primary runtime integration point | **Extend** with persistence controller, dirty state, Save/Open actions and Open installation |
| `tests/harness/m5-exploration/index.html` | toolbar and Map menu; Upload/Download disabled (`data-action="upload"`, `"download"`) | Add minimal Save/Open controls; preserve structure | **Extend**; no redesign |
| `tests/harness/m5-exploration/shell-controls.js` | action-button controller, theme/fullscreen, history toolbar | Theme setting source; action wiring | **Reuse/Extend** for setting load |
| `tests/harness/m5-exploration/create-map-dialog.js` | Create Map stage/button lifecycle | Replacement dirty prompt occurs before this dialog | **Reuse**; no storage logic inside |
| `src/engine/hypertree/render/label-overlay.js` | label lifecycle and measurement | Open must install labels through same candidate context | **Reuse** |
| `src/engine/hypertree/exploration/frame.js` | frame staging, draw/labels/hits | Open must reproduce draw→labels→hit installation | **Reuse** |

### 2.2 Existing facts that constrain the design

1. **Node IDs are durable strings already.** Create Map uses `cm-{token}-{counter}`; editor additions use `fo-{token}-{counter}`. Runtime dataset tokens influence generation but node IDs are stored in the tree. Preserve node IDs across save/open.
2. **Attachment IDs are currently runtime IDs** (`att-{datasetToken}-{counter}`). They are stored in node data and resolved through the session registry. Persistence must not make runtime dataset tokens durable map identity and must not require node IDs to be rewritten when the runtime token changes.
3. **`createAttachmentRegistry()` accepts File/Blob objects only in memory.** It has no restore/adopt path and no persistent key. Opening a saved map needs a registry-compatible object seeded from persistent records.
4. **History entries contain full candidate trees and attachment references** and are bounded session-only. They are not suitable for persistence and must be cleared on open/replacement.
5. **`dataRevision` is runtime-only** and increments after successful editor/reparent/history operations. Create Map resets it to `0`.
6. **`datasetToken` is runtime-only** and increments on boot/Create Map. It appears in editor intents and attachment runtime IDs.
7. **`installCandidateEnvironment()` already provides the atomic candidate ownership boundary** desired by Open: draw/labels/hits then commit, with recovery.
8. **No persistence APIs, IndexedDB usage, localStorage usage, or storage manager calls currently exist** in source.
9. **Upload/Download are disabled placeholders.** They must not be repurposed as Save/Open.
10. **Current caps:** 300 nodes including root; 20 MiB per attachment; 100 MiB total live dataset attachments; loader data limits larger but editor policy is stricter.

### 2.3 New components

| New path | Purpose |
|---|---|
| `src/engine/hypertree/persistence/schema.js` | DB name/version, store names, record validators, limits |
| `src/engine/hypertree/persistence/ids.js` | persistent map/attachment ID allocation and validation |
| `src/engine/hypertree/persistence/codec.js` | live tree ↔ persisted canonical tree; attachment ID remap; node data cloning |
| `src/engine/hypertree/persistence/idb.js` | IndexedDB open/upgrade/blocked/versionchange/cleanup |
| `src/engine/hypertree/persistence/repository.js` | save/load/list/delete API, optimistic generation, transactions |
| `src/engine/hypertree/persistence/runtime.js` | build candidate runtime from saved document + attachment Blobs |
| `src/engine/hypertree/persistence/backup.js` | P3 portable package encode/decode/validate |
| `tests/harness/m5-exploration/persistence-controller.js` | Save/Open actions, dirty state, prompts, status integration |
| `tests/harness/m5-exploration/saved-maps-dialog.js` | minimal saved-map list UI |
| `tests/harness/m5-exploration/unsaved-map-prompt.js` | Save / Discard / Cancel replacement prompt |
| `tests/harness/m5-exploration/backup-controls.js` | P3 Download/Upload integration |

### 2.4 Required extensions

- **`attachments.js`:** add an adopt/restore path that creates a registry record for a supplied persistent attachment ID, Blob/File, and saved metadata while enforcing existing per-file/total limits. Newly added attachments continue using runtime-generated IDs.
- **`main.mjs`:** add `activeMap` identity (`mapId`, `generation`, `savedRevision`), persistence action guards, dirty derivation, persistence controller lifecycle, and Open installation reusing presentation suspension/restoration.
- **`index.html` / action controller:** add Save and Open Saved Map actions in toolbar and Map menu; Update Upload/Download availability only in P3; add non-redesign unsaved-state text.
- **`shell-controls.js`:** allow initial theme from persisted settings rather than always defaulting without a settings source.
- **`main.mjs` action guards:** block Save during editor saving/form, creation ownership, drag, transition, and persistence in-flight; Open/Create Map must run the unsaved-map decision first.

---

## 3. Identity and schema

### 3.1 Distinct identities

| Identity | Scope | Rule |
|---|---|---|
| `mapId` | Durable saved map | New UUID on first save/import; never derived from `datasetToken` |
| node `id` | Durable within map | Preserve stored string; validate uniqueness; do not renumber on open |
| `attachmentId` | Durable within map | Persistent UUID assigned on first save/import; node `data.attachmentId` in the saved tree references it |
| runtime attachment ID | Session | For unsaved additions, existing `att-{token}-{n}` may be used until save mapping |
| `datasetToken` | Session | Fresh on boot/open/Create Map; never stored as durable identity |
| `dataRevision` | Session | Increments on committed mutations; not durable |
| `savedRevision` | Session | Last runtime revision successfully saved; `0` after open; not loaded as a durable revision |
| `generation` | Durable map record | Increments on each successful save; optimistic conflict token |

On Open:

- allocate a fresh runtime `datasetToken`;
- reset `dataRevision=0` and `savedRevision=0`;
- load stored node IDs unchanged;
- adopt stored persistent attachment IDs;
- clear history and any pending editor/search/transition state.

The saved map record stores only `savedAt`/`generation`, never the runtime `savedRevision`. `savedRevision` is session bookkeeping only and must never become durable identity or authorize a clean state after Open.

### 3.1a Attachment identity mapping lifecycle

**Owner:** the persistence controller/session object owns the mapping, not the live tree, history, graph, or registry:

```text
PersistentSession {
  activeMap: { mapId, generation, savedRevision } | null,
  attachmentIds: Map<sessionAttachmentId, persistentAttachmentId>,
  saveOperationToken,
  replacementGuard
}
```

- Loaded/Open records already use persistent attachment IDs in node data. Adoption inserts `persistentId → persistentId` and registers the Blob under that ID. No remapping of stored node IDs is required.
- Create Map/editor additions use runtime IDs such as `att-{datasetToken}-{n}`. The map holds those IDs until the first successful save that references them.
- Snapshot construction copies `attachmentIds` into a **proposed mapping** and assigns new persistent IDs only in that proposal. It builds a separate persisted tree whose `data.attachmentId` values are persistent IDs. The live tree and live history are never mutated.
- The session `attachmentIds` map is updated only after the save transaction completes successfully and only if the operation still belongs to the same dataset/session. A failed or stale save discards the proposal.
- A mapping entry is identity bookkeeping, **not proof that a durable Blob row still exists**. Every save transaction rechecks `mapAttachments` existence/size for each referenced ID before deciding a Blob put is unnecessary.

### 3.2 IndexedDB schema v1

Database: `fileorbit`  
Version: `1`

Stores:

`maps` — keyPath `mapId`; index `by_modifiedAt`:

```text
{
  schemaVersion: 1,
  mapId, name,
  createdAt, modifiedAt, savedAt,
  generation,
  nodeCount,
  attachmentBytes,
  storedAttachmentCount
}
```

`mapDocuments` — keyPath `mapId`:

```text
{
  schemaVersion: 1,
  mapId, generation, savedAt,
  tree: canonical validated tree,
  attachmentRefs: [
    { attachmentId, originalName, sizeBytes, mime, classification }
  ]
}
```

`mapAttachments` — keyPath `['mapId','attachmentId']`:

```text
{
  mapId, attachmentId,
  blob,
  originalName, sizeBytes, mime,
  classification,
  sha256: null
}
```

`sha256` is `null` in P1/P2 saved records. P1 validates schema, required fields, ID uniqueness, references, declared size, Blob type/shape, and classification consistency. It does **not** detect arbitrary same-size byte corruption. Full attachment SHA-256 integrity is required for the portable backup package; adding hashes to normal Save is a later, separately reviewed slice. No hashing or file reads may run inside an IndexedDB transaction.

`settings` — keyPath `key`:

```text
{ key: 'theme', value: 'dark' | 'light' }
```

`meta` — keyPath `key`; transactional library accounting:

```text
{ key: 'libraryUsage', storedAttachmentBytes, updatedAt }
{ key: 'schema', schemaVersion: 1 }
```

`meta.libraryUsage` is read and updated inside the same readwrite transaction that changes attachment rows. This serializes concurrent-tab cap enforcement. If the record is absent or inconsistent, a repair transaction scans `mapAttachments` and rebuilds it before further saves.

A separate `maps` metadata store allows the saved-map list to load names/dates/sizes without reading every tree.

### 3.3 Saved tree shape

Persisted tree retains only:

```text
{ id, name, kind: 'folder'|'file', data, children? }
```

For files, `data` retains:

- `dataType`
- `description`
- `link` (web-link only)
- `attachmentId` (persistent ID)
- `originalName`
- `sizeBytes`
- `mime`
- `classification`

Topology and **children array order** are preserved. Names, kinds, descriptions, links, and node data are preserved. Legacy fixture nodes without attachment IDs are saved as ordinary metadata with no `attachmentId`; Open must not invent attachments or reclassify their contents.

Never persisted:

- DOM nodes or CSS;
- sessions, controllers, navigators, overlays;
- hit snapshots;
- object URLs;
- derived layouts/scenes/Graph adjacency Maps;
- viewport/focus/selection by default;
- absolute filesystem paths;
- transient search results;
- runtime `datasetToken`/`dataRevision` as durable identity.

### 3.4 Durable attachment ownership and runtime sweeps

**P1–P3 choice: per-map durable ownership; no cross-map sharing.**

- IndexedDB retains exactly the attachment rows referenced by each map's **saved tree**.
- Runtime registry retains Blobs needed by the live tree, session Undo/Redo, or a pending save.
- History remains session-only.
- Saving must not evict a Blob still needed by runtime Undo/Redo.
- Durable cleanup is independent of runtime history: a save removes durable attachment rows not referenced by the new saved tree, even if live history still holds a runtime reference.
- Runtime sweeps (`sweepAttachmentOwnership`) and durable cleanup are distinct mechanisms. A runtime sweep may keep a Blob for Undo; durable cleanup may remove that same row because history is not persisted.
- Deleting a map removes only that map's document and attachment rows. Per-map `[mapId, attachmentId]` ownership prevents cross-map deletion.
- No content-hash deduplication and no persistent history in P1–P3.

### 3.5 History

Undo/Redo remains **session-only** for P1–P3.

- Save does not serialize history.
- Open/replacement clears history.
- Reload loses history.
- A future persisted-history design requires separate approval and schema.

---

## 4. Atomic save, identity mapping, and open

### 4.1 Save snapshot and non-mutating mapping proposal

`captureSaveSnapshot()` runs synchronously on the committed live map and returns:

```text
{
  requestedAt,
  sessionToken, datasetToken, capturedRevision,
  mapId: activeMap.mapId | null,
  expectedGeneration: activeMap.generation | null,
  sourceTree: cloned live tree,
  mappingProposal: Map<sessionAttachmentId, persistentAttachmentId>,
  persistedTree: cloned tree with persistent attachment IDs,
  attachments: [
    { sessionId, persistentId, blob, originalName, sizeBytes, mime, classification }
  ],
  referencedPersistentIds: Set,
  saveOperationToken
}
```

Before opening any write transaction, the controller:

1. rejects if editor form/draft is open, Save/Open/replacement operation is in progress, drag/transition/create ownership is active;
2. clones the tree and metadata without Blobs;
3. copies the current session `attachmentIds` into the proposal;
4. allocates a new `att_<uuid>` in the proposal only for an attachment ID not already mapped;
5. builds `persistedTree` with proposed persistent IDs while leaving the live tree/history untouched;
6. obtains Blob references for attachments that may need writing;
7. performs advisory quota estimation and validates 300-node, 20 MiB/file, 100 MiB/map limits.

No file reads or unrelated asynchronous work occur inside the IDB transaction. Normal P1 Save does not compute SHA-256; backup P3 does.

### 4.2 Save transaction and durable attachment checks

One `readwrite` transaction across `maps`, `mapDocuments`, `mapAttachments`, and `meta`:

1. Read current `maps[mapId]` for an existing map.
2. Abort with `stale-generation` if stored `generation !== expectedGeneration`.
3. Abort with `map-missing` if an existing map disappeared.
4. For a new map, allocate `mapId` before the transaction and verify it is unused.
5. For every persistent ID referenced by `persistedTree`, read `mapAttachments[mapId, attachmentId]`.
   - record exists with matching declared size → no Blob put;
   - record absent or size mismatch → require a live Blob and put it with current metadata;
   - live Blob missing → abort `attachment-missing-live` before writing the document.
6. Read/repair `meta.libraryUsage` if necessary.
7. Compute:
   - `oldMapBytes` from current map attachment records;
   - `newMapBytes` from the persisted tree’s attachment rows;
   - `bytesOfPuts` for new/reinserted Blobs;
   - `finalStoredBytes = libraryUsage - oldMapBytes + newMapBytes`;
   - `peakAdditionalBytes = bytesOfPuts`.
8. Reject `library-limit` if `finalStoredBytes > 512 MiB`. Use `peakAdditionalBytes` for the advisory browser-quota check; do not assume deleted/replaced bytes are available before commit.
9. Put only required attachment Blobs.
10. Delete attachment rows for this map that are **not referenced by the persisted saved tree**, regardless of session Undo/Redo history.
11. Put the canonical `mapDocuments` record with the persisted tree and `attachmentRefs`.
12. Put the `maps` metadata record with `generation = previous + 1` and recomputed `attachmentBytes`.
13. Update `meta.libraryUsage.storedAttachmentBytes = finalStoredBytes`.
14. On transaction `complete`, report Saved, merge the proposal into session mapping/bookkeeping, and mark `savedRevision = capturedRevision` only for the originating session.
15. On `abort`/error, discard the proposal, keep the prior saved record, keep the live tree/history/registry unchanged, and release replacement ownership.

Transaction atomicity prevents a partial committed record. It does **not** guarantee against browser data deletion, quota eviction, storage corruption, or OS/browser cleanup.

### 4.2a Concrete save/mapping sequences

**First save → metadata edit → save**

1. Live attachments `att-1-0`; mapping is empty.
2. First save proposes `att-1-0 → att_P1`, persists tree with `att_P1`, writes Blob, commits. Session mapping now has `att_P1`.
3. Edit description; revision increments. Metadata-only save reuses `att_P1`, checks the durable row exists with matching size, does not put the Blob, and writes a new map document/generation.

**Add file → save**

1. New file gets runtime ID `att-2-7`; live tree/history reference it.
2. Save proposes a new persistent ID `att_P2`, persists a copied tree referencing `att_P2`, writes the Blob, commits, then adds `att-2-7 → att_P2` to session mapping.

**Save failure → retry**

1. Proposal allocates `att_P3` but transaction aborts.
2. Session mapping is unchanged; no savedRevision/generation update.
3. Live tree still references the runtime ID and Blob remains in registry.
4. Retry builds a fresh proposal, possibly with a different persistent ID, rechecks durable rows, and commits only on success.

**Save completion after dataset replacement**

- The transaction may commit a valid saved record for the originating map.
- The completion callback checks the originating `sessionToken`/`datasetToken`; it must not modify the replacement dataset’s activeMap, savedRevision, mapping, dirty indicator, or pending dialogs.
- The committed record is discoverable in the saved-map list but is not adopted by the new session.

**Delete → save → Undo → save**

1. Delete removes the file from live tree; history retains prior tree referencing the runtime attachment.
2. Save persists a tree without that attachment and deletes its durable row, even though runtime history still holds the Blob.
3. Undo restores the tree with the runtime attachment ID; session mapping still has its persistent ID, but the durable row is gone.
4. Next Save checks `mapAttachments` for the mapped persistent ID, sees it missing, and reinserts the live Blob bytes before committing. ID mapping alone never proves durable content exists.

### 4.3 Save races and revision marking

- `savedRevision` becomes `capturedRevision` only for the session/map that started the save.
- If `dataRevision > capturedRevision` when the transaction completes, the newer revision remains dirty. Ordinary Save does not lock mutations.
- If the map was replaced/opened while saving, the completion is stale by session operation token and must not update the new active map.
- A save that commits after its originating dataset closed remains a valid saved map record, but its completion changes no new active-map identity, mapping, dirty state, or UI.
- Proposal mappings are merged into session bookkeeping only after transaction completion and only for the originating session.
- Two tabs use `generation`: the second save fails `stale-generation`; no automatic merge or overwrite.

### 4.4 Open pipeline

1. Require the unsaved-map decision before replacing a dirty map.
2. Read map metadata, document, and referenced attachment records in one `readonly` transaction.
3. Validate schema version, required fields, ID uniqueness, tree limits, node count ≤300, attachment metadata, duplicate attachment IDs, classification shape, and all references.
4. If any attachment is missing, size-mismatched, or corrupt, fail explicitly; never silently omit nodes/attachments.
5. Build a candidate registry with persistent attachment IDs and Blob records; adopt `persistentId → persistentId` mappings without rewriting stored node references.
6. Build candidate tree/graph/model with `loadTree()`, stage/refine layout using current viewport, and create candidate session.
7. Reuse `installCandidateEnvironment()` and the measurable concealed candidate label context:
   - draw → labels → matching hits;
   - commit live refs only after success.
8. On success:
   - fresh `datasetToken`, `dataRevision=0`, `savedRevision=0`;
   - set `activeMap = {mapId, generation, savedRevision:0}`;
   - clear history, search, pending editor/transition, and close prior dialogs;
   - reveal prepared presentation.
9. On failure:
   - preserve current live map and saved map;
   - restore the previous presentation through the accepted coherent restoration path;
   - show the original error. Recovery restores the prior presentation, not pixel-identical canvas history; candidate recovery is not a blanket pixel rollback.
10. If no map was open, failure returns to empty startup.

### 4.5 Dirty state

```text
mapDirty = no active map ? false
         : activeMap.mapId === null ? true
         : dataRevision !== activeMap.savedRevision
```

- New Create Map is unsaved even at revision 0.
- Editor draft dirtiness remains separate; Save is blocked while the form is open/saving.
- Save does not increment `dataRevision` or history.
- Open/Create Map replacement prompts if `mapDirty`.
- The dirty indicator is explicit text, not only a color.

---

## 5. Product workflow

### 5.1 Minimal P1 UI

Add within the existing toolbar and Map menu:

- **Save Map** — explicit save.
- **Open Saved Map** — opens a map already in IndexedDB.
- saved-map list dialog:
  - map name;
  - modified date;
  - attachment size;
  - Open / Delete / Cancel; empty-state text when none.
  - Delete requires explicit confirmation and removes only that saved map.
- unsaved-change indicator: "Unsaved changes" or "Saved".
- replacement prompt: **Save / Discard / Cancel**.

Do not add tutorial slides, redesign panels, or change Create Map semantics.

Open Saved Map must remain reachable from empty startup; Save is disabled without an active map.

### 5.2 Semantics

| Active map | Save action |
|---|---|
| None | disabled |
| New unsaved (`mapId=null`) | first save allocates persistent map ID, writes document + attachments |
| Previously saved | update same map, expected generation checked |
| Clean saved | Save disabled/no-op |
| Dirty saved | Save updates same map; generation+1 |

There is no automatic save and no automatic open of the last map in P1.

### 5.3 Replacement and preemption — Policy A: bounded replacement guard

**Chosen policy:** Save-before-Open/Create acquires a replacement ownership guard that blocks map mutations through save and handoff to the replacement operation. Ordinary Save does not acquire this guard.

Flow:

1. Existing editor draft prompt runs first. Save/Open/Create cannot start while an editor draft is open or saving.
2. If the map is dirty, show Save / Discard / Cancel.
3. **Cancel** performs no save and no replacement; no guard has been acquired.
4. **Discard** proceeds to the target operation without saving; no guard is needed because the user explicitly abandoned changes.
5. **Save** acquires `replacementGuard = { token, intent, datasetToken, capturedRevision, target }` and calls Save.
6. While the guard is held, block:
   - editor commands and form opening/saving;
   - add/rename/edit/reparent/Delete;
   - Undo/Redo;
   - Create Map candidate start and Open Saved Map start;
   - drag/drop mutations.
   UI indicates “Saving before open/create…” and incompatible actions are disabled.
7. Save failure releases the guard, preserves the current map, and returns to the pending Save / Discard / Cancel decision with the error. No indefinite lock.
8. Save success releases the guard only after revalidating:
   - current `datasetToken` matches the guard;
   - current `dataRevision === capturedRevision`;
   - no newer map mutation or session replacement occurred.
9. If revalidation fails, do **not** discard newer edits. Keep the map dirty and re-prompt with the newer revision.
10. If revalidation passes, hand off ownership to Create Map suspension or the Open operation, then release the replacement guard. The replacement operation owns its own terminal restoration path.
11. If the target selector/dialog is cancelled before replacement begins, release the guard; the save remains completed and the map remains open/clean.
12. All guard releases are centralized in a terminal `finishReplacementIntent(token)` and are idempotent.

Save success alone never authorizes discard. Authorization requires successful save, matching dataset, matching captured revision, and no newer edit. Open editor drafts are accounted for before the guard.

| State | Owner | Mutations | Release |
|---|---|---|---|
| Ordinary Save | persistence save operation only | allowed; newer revisions remain dirty | save completion/failure |
| Dirty replacement prompt | prompt | allowed until choice | Cancel/Discard/Save choice |
| Save-before-replace | replacement guard | blocked | save failure, save+revalidation, or target cancel |
| Save success, revalidation fails | replacement guard | remains blocked briefly, then re-prompt | re-prompt shown; guard token finished |
| Target dialog before replacement | replacement guard | blocked | target Cancel |
| Create Map suspension / Open install | replacement operation terminal owner | blocked by that operation | replacement commit/failure/restore |
| Target operation failure | restoration owner | inert/blocked during restore | restore completion |

Ordinary Save does not lock the map: edits after its captured revision remain dirty when the transaction completes.

### 5.4 Upload/Download terminology

| Control | Meaning | Slice |
|---|---|---|
| Open Saved Map | open a map from IndexedDB | P1 |
| Save Map | write current committed map to IndexedDB | P1 |
| Upload | import a portable FileOrbit package | P3 |
| Download | export a portable backup package | P3 |

Upload is not the storage browser. Open is not package import.

---

## 6. Durability, quotas, and lifecycle

### 6.1 Storage estimate

Use `navigator.storage.estimate()` when available:

- show approximate usage/quota in the saved-map dialog or status;
- treat absence as unknown, not zero;
- persist request is optional and user-visible.

### 6.2 Persistence request

`navigator.storage.persist()` may be offered as an explicit action. Show the returned boolean honestly. Never state that persistence guarantees retention.

### 6.3 Quota and application caps

Three distinct limits:

1. **Live active-map limit:** 100 MiB referenced by the current live dataset (existing behavior).
2. **Application library hard cap:** **512 MiB** of stored attachment bytes across all saved maps. This is an application cap, rejected with `library-limit`, not a browser quota and not a soft warning.
3. **Browser quota:** estimated via `StorageManager.estimate()` where available; `QuotaExceededError` is authoritative.

Existing per-file (20 MiB), per-map (100 MiB), node (300), and metadata limits are unchanged.

Policy:

- Reject a save when post-commit `finalStoredBytes > 512 MiB`.
- Enforce the 512 MiB cap against `meta.libraryUsage` inside the same serialized readwrite transaction that changes attachments. Concurrent tabs therefore cannot both consume the same remaining capacity.
- If `meta.libraryUsage` is absent/inconsistent, repair it by scanning `mapAttachments` before enforcing the cap.
- Browser preflight:
  - `availableEstimate = quota − usage − safetyReserve` (use a documented reserve, e.g. 16 MiB, when values are finite);
  - `incrementalRequired = bytesOfPuts + metadataReserve`, where `bytesOfPuts` are Blobs that must be written before old/deleted rows are freed;
  - do not subtract bytes that will only be deleted at transaction commit.
- Estimates are advisory. A transaction may still fail with `QuotaExceededError`; preserve the last saved version and live map.
- Metadata-only save:
  - if all referenced durable rows exist with matching size, `bytesOfPuts=0` and no Blob put occurs;
  - if a referenced row is missing (e.g. reinsert after Undo), metadata-only is no longer byte-neutral and must include the reinserted Blobs in the incremental/cap calculation.
- Map deletion is available when the application cap is reached. P1b saved-map list includes a minimal **Delete Saved Map** confirmation; deletion removes that map’s document/attachments and updates `meta.libraryUsage` in one transaction. P2 hardens cleanup/error handling.

### 6.3a Integrity contract

- **P1/P2 saved-record validation** covers schema version, required fields, references, duplicate IDs, declared size, Blob shape, and classification consistency.
- Saved records use `sha256: null`. Same-size arbitrary byte corruption is **not detected** in P1/P2 and must not be claimed.
- Open detects missing rows, size mismatches, invalid references, and schema problems; it does not certify byte integrity.
- Portable backup P3 mandates per-attachment SHA-256 generation and verification.
- Normal-save hashing, if added later, occurs before any write transaction; no unrelated async hashing runs inside IDB.
- Transaction atomicity protects against partial writes, not against byte corruption, browser eviction, or external data deletion.

### 6.4 Errors and unavailable storage

Map errors to explicit states:

- `QuotaExceededError` / insufficient quota → save failed, last saved version intact.
- `library-limit` (512 MiB application hard cap) → save rejected; Delete Saved Map remains available.
- active-map 100 MiB limit exceeded → save rejected; no partial record.
- `attachment-missing-live` → referenced runtime Blob absent; abort with no document write.
- IndexedDB unavailable/denied/private mode → persistence unavailable; empty maps still work.
- transaction abort → no partial save.
- invalid/corrupt saved record → Open fails explicitly; current map preserved.
- missing attachment → Open fails explicitly; no silent node omission.
- incompatible higher schema version → explicit upgrade-required message.
- blocked DB open/upgrade → "Close other FileOrbit tabs and retry".
- `versionchange` → close connection, stop writes, require reload.

### 6.5 Multiple tabs

No real-time synchronization and no lock in P1.

- `generation` detects stale saves.
- Second tab save returns `stale-generation`; live map remains dirty.
- P2 adds explicit resolution: Reload saved version or save as a new copy. No automatic last-writer overwrite.
- Open of a map saved by another tab reads the latest committed record.

### 6.6 Crash/close

- IDB transactions are atomic: crash/incomplete transaction leaves previous saved version.
- No unload-time async save.
- A synchronous `beforeunload` dirty warning may be added, but not a guaranteed save.
- Browser data deletion is outside app control.

### 6.7 Cleanup

- Explicit map deletion removes map metadata, document, all per-map attachments, and updates `meta.libraryUsage` in one transaction.
- Save-time durable cleanup removes attachment rows not referenced by the new saved tree, regardless of live Undo/Redo history.
- Runtime sweeps are separate: they may retain a Blob for live history even after its durable row is deleted.
- Never delete a durable attachment referenced by another saved map. Per-map `[mapId, attachmentId]` ownership makes this structural.
- Durable cleanup never depends on an unpersisted history-owner list.
- Deleting a map does not affect live registry Blobs of the current unsaved map.
- No unload-time GC and no background compaction.

### 6.8 Connection lifecycle

- One connection per tab, opened on explicit persistence action/startup settings load.
- `close()` on page teardown.
- `versionchange` closes and marks unavailable.
- Clear transaction/listener references after completion.

---

## 7. Portable backup package (P3)

### 7.1 Format decision

Recommended: **dependency-free custom binary container** with extension `.fileorbit`.

Layout:

```text
magic: "FILEORBIT" (9 bytes)
containerVersion: uint16
manifestLength: uint32
manifest: UTF-8 JSON
attachments: raw bytes, concatenated
```

Manifest contains:

- `containerVersion`, `appSchemaVersion`, `exportedAt`;
- map name, optional `sourceMapId`, node count;
- canonical tree (persistent node IDs and persistent attachment IDs in the package);
- attachment entries:
  - package attachment ID;
  - byte offset and length;
  - originalName, sizeBytes, mime, classification;
  - SHA-256 hex;
- total attachment bytes and declared package size;
- no runtime dataset token/revision as durable identity.

The package is a complete backup because it contains the tree **and original attachment bytes**, not metadata-only JSON. Full SHA-256 hashes are mandatory here even though normal IndexedDB save records use structural/size validation only; package integrity does not imply live-save byte-integrity verification.

### 7.2 Packaging alternatives

| Approach | Pros | Cons | Decision |
|---|---|---|---|
| Custom binary container | dependency-free; simple random access; explicit version/checksums; low-copy Blob export | not inspectable by generic ZIP tools | **Proposed** |
| Store-only ZIP implemented locally | interoperable; CRC32; existing tools | central-directory complexity; 32-bit limits; optional DEFLATE support varies | feasible later; no dependency installed |
| TAR (+ optional gzip) | simple header | weak per-entry integrity, filename/length parsing, no practical random access | not preferred |
| JSON + base64 attachments | easy JSON tooling | 33% size overhead, full string/array memory, poor large-blob behavior | reject for backup |

If a ZIP dependency becomes desirable, it is a **proposal only**; do not install it in the planning slice.

### 7.3 Export

- Exports the **current committed live revision**, not silently the last saved revision.
- Editor form drafts are not included; Download is blocked while an editor draft is open, or prompts user to finish/cancel.
- Includes original attachment bytes for every referenced live attachment.
- Hashes each attachment with `crypto.subtle.digest('SHA-256')` one at a time before creating the package.
- Builds the download as `Blob([manifestHeader, ...attachmentBlobs])` where possible to avoid a full byte copy; peak memory bounded by manifest plus one attachment hash buffer.
- Creates one object URL, triggers download, and revokes it after the click/download handoff.
- If the live map is unsaved/new, package `sourceMapId` is null; import creates a new map.

### 7.4 Import

Treat package as untrusted:

1. Read magic/version/manifest length via Blob slices.
2. Reject truncated/oversized manifests and unsupported versions.
3. Validate manifest schema, node limits, names, metadata, duplicate IDs, attachment IDs, offsets, lengths, and total size.
4. Compute each attachment hash and compare; reject mismatch.
5. Reject if any offset overlaps, exceeds package size, or references missing bytes.
6. Build an isolated candidate tree/registry and install through the accepted candidate boundary.
7. Any failure preserves current live map and all saved maps.

Identity:

- Always allocate a **new persistent map ID** on import.
- Preserve valid node IDs within the imported map.
- Allocate new persistent attachment IDs and rewrite node attachment references, avoiding accidental overwrite.
- If the package source map ID already exists, import as a copy; never overwrite automatically.

---

## 8. Slice plan

### P1a — IndexedDB schema, codecs, repository (no UI integration) — IMPLEMENTED\n\nImplementation notes: [FILEORBIT-PERSISTENCE-P1A.md](FILEORBIT-PERSISTENCE-P1A.md).

**Behavior**

- Create/open DB v1 with stores/indexes including `meta.libraryUsage`.
- Persistent ID generation/validation.
- Canonical tree ↔ saved tree codec with non-mutating mapping proposal.
- Save/load/list/delete transactions in repository API.
- Generation conflict detection, durable attachment presence/size checks, quota/application-cap mapping, transaction rollback.
- Attachment adoption/restore registry adapter.
- Structural/size validation only; no normal-save SHA-256 in P1.

**Non-goals**

- No Save/Open buttons.
- No dirty UI/prompt.
- No portable backup.
- No automatic saving/opening.
- No normal-save byte hash or corruption detection.

**Source changes/new APIs**

- New `persistence/schema.js`, `ids.js`, `codec.js`, `idb.js`, `repository.js`, `runtime.js`.
- Extend `attachments.js` with adopt/restore.
- No main harness action wiring yet.

**Ownership/failure**

- Repository never owns live refs.
- Proposed mapping is returned to caller; repository does not mutate live tree/history.
- Failed transaction leaves prior records, proposals, and live objects unchanged.
- No Blob reads inside write transactions; Blobs may be put directly.

**Tests**

- Codec round-trip preserves order, names, metadata, links, classification.
- Persistent/runtime ID mapping and duplicate detection; live tree unchanged.
- First-save proposal is not published on abort.
- Save metadata-only does not `put` unchanged Blobs when durable rows exist.
- Missing durable row triggers Blob put even for metadata-only save.
- Durable cleanup removes rows absent from saved tree regardless runtime history.
- Transaction abort/quota leaves prior record.
- Stale generation rejects.
- Meta usage transactional cap under two instances.
- Missing attachment detected on load.
- Incompatible schema rejected.
- DB upgrade/blocked event mapping.
- Mocked IDB tests are repository evidence, not native durability.

**Native browser checklist**

- DB creation/upgrade in desktop Chrome/Edge, Android Chrome, iPhone Safari.
- Quota estimate availability.
- No uncaught versionchange/blocked errors.

**Completion**

- Repository contract tests pass and no live UI calls exist yet.
- API is ready for P1b.
- Implemented status: repository/codec/runtime foundation is present; native browser durability and Save/Open UI are **NOT** verified.

**Executed evidence (P1a implementation)**

- 31/31 persistence tests pass against the repository implementation and an IndexedDB-compatible transaction test double.
- Covered: first save/load/list/usage, non-mutating proposal, metadata-only no Blob put, add-file only new Blob, delete→Undo→reinsert, injected transaction abort, stale generation, map-ID collision, missing/size/schema failures, per-file/per-map/node/library limits, two repository connections, deletion/usage, adoption/Blob compatibility, Unicode/legacy metadata, connection unavailable/failed/blocked/versionchange, storage estimate advisory.
- Full `tests/engine`: **779/779 pass**.
- Native browser verification: **NOT RUN**. The test double is not native durability evidence.

### P1b — Explicit Save/Open UI and dirty workflow — IMPLEMENTED

**Behavior**

- Save Map and Open Saved Map in toolbar + Map menu.
- Saved-map list with name/modified/attachment size, Open/Delete/Cancel.
- Unsaved indicator.
- Save/Discard/Cancel before replacing dirty map.
- Policy A replacement guard: Save-before-Open/Create blocks mutations, revalidates dataset/revision, and releases on every terminal path.
- First save assigns map identity; subsequent save updates same map.
- Open installs through candidate draw/labels/hits and fresh runtime identity.
- Create Map, Open, and empty startup preserve accepted behavior.
- Session history cleared on Open/replacement; save does not add history.

**Non-goals**

- No auto-save, auto-open, cloud, package import/export.
- No conflict resolution beyond explicit Save failure.
- No history persistence.

**Source changes**

- Extend `main.mjs` with `activeMap`, dirty derivation, persistence controller lifecycle, action guards, Open candidate installation using accepted restoration.
- Extend `index.html`/action controller with minimal Save/Open.
- Add `saved-maps-dialog.js`, `unsaved-map-prompt.js`, `persistence-controller.js`.
- Theme setting read/write.

**Ownership/failure**

- Save captured revision only; newer edits stay dirty for ordinary Save.
- Policy A guard blocks mutations during Save-before-replace and is released on success handoff, failure, cancellation, or target-dialog cancel.
- Stale save completion cannot update a different active map.
- Open failure preserves current map; dirty prompt Cancel changes nothing.
- Save failure keeps last saved and live map.
- Open/replacement terminal owner prevents duplicate cleanup.

**Tests**

- Save → simulation reload → Open restores tree, metadata, attachment bytes.
- Metadata-only save does not rewrite unchanged Blobs.
- Add/reparent/Delete/Undo/Redo dirty changes; undo after save leaves dirty.
- Ordinary Save race: captured revision saved, newer revision dirty.
- Save-before-Open/Create: mutations blocked during guard; save failure/cancel releases lock; changed revision re-prompts.
- Open candidate draw/label/hit failure keeps current map (presentation recovery, not pixel rollback).
- Dirty prompt Save/Discard/Cancel.
- Open from empty startup.
- PDF/Markdown viewer after Open.
- Search/empty startup/Create Map preserved.
- Delete Saved Map removes only that map and frees usage.
- Actual entry action → controller → repository → install.
- Mocked IndexedDB is not browser durability evidence.

**Native browser checklist**

- Save, reload tab, Open, verify file bytes/viewer.
- Replace dirty map Cancel/Save/Discard.
- Two tabs same map stale save.
- Quota denial and private mode.
- desktop Chrome/Edge, Android Chrome, iPhone Safari.

**Completion**

- User can explicitly save, reload, open, and delete a saved map with attachments.
- Save-before-replace cannot discard a newer revision.
- No silent data loss on failure.
- Accepted r34 behavior preserved.

### P2 — Lifecycle, quota, conflict hardening

**Behavior**

- Storage estimate/usage UI.
- Optional persist request and honest outcome.
- `QuotaExceededError`, `library-limit`, unavailable IDB, blocked/versionchange messaging.
- Two-tab stale-save resolution (reload vs save as copy).
- Saved-map deletion hardening and usage repair.
- Durable cleanup diagnostics; no runtime-history dependency.
- Optional integrity-hash design review (not automatic in P2).
- Schema upgrade migration harness.
- Dirty `beforeunload` warning (no async save).

**Non-goals**

- No cross-device sync.
- No cloud.
- No package import/export.

**Tests**

- Quota abort leaves old save.
- 512 MiB application hard cap with transactional usage.
- Incremental peak bytes include Blob puts before deletes.
- Metadata-only save with all rows present performs zero puts.
- Metadata-only save with missing durable row reinserts bytes and counts growth.
- Missing/corrupt attachment structural validation limitations.
- Schema version mismatch.
- Blocked/versionchange.
- Two-tab generation conflict.
- Map deletion removes only own attachments and updates usage.
- Durable cleanup removes history-only rows; runtime history still holds its Blob.
- Runtime sweep preserves history Blob independently of durable cleanup.

**Completion**

- Persistence failures are actionable and non-destructive.
- Multi-tab conflicts are explicit.

### P3 — Portable Download/Upload backup

**Behavior**

- Download current committed live revision as `.fileorbit`.
- Upload validates and imports as a new map.
- Complete bytes, manifest, hashes, version, limits.
- Existing Upload/Download placeholders become functional.
- No overwrite of existing saved map.
- Download does not mark dirty state saved.

**Non-goals**

- No cloud upload.
- No ZIP dependency unless separately approved.
- No deduplication.

**Tests**

- Round-trip tree + Blob bytes + viewer.
- Missing/duplicate/corrupt IDs.
- Truncated/hash mismatch.
- Path/name/metadata limits.
- Peak memory/object URL revocation.
- Import failure preserves live and saved maps.

**Native browser checklist**

- Download/Upload on desktop Chrome/Edge, Android Chrome, iPhone Safari.
- Large package near limits.
- Cancel download/import.
- No duplicate map overwrite.

**Completion**

- Portable backup restores complete map + attachments on a new browser profile/device.
- Import cannot overwrite or partially install.

---

## 9. Required verification plan

### 9.1 Executable Node/integration

- Save → simulated reload → Open restores tree, metadata, sibling order, and file bytes.
- Metadata-only save does not rewrite unchanged Blobs.
- Repeated saves reuse persistent IDs; first-save proposal does not mutate live tree/history.
- Failed save publishes neither proposed mapping nor saved revision; retry works.
- Save completion after dataset replacement commits a valid record but leaves new session untouched.
- Delete → Save → Undo → Save reinserts bytes after durable cleanup.
- Metadata-only save with a missing durable row performs a Blob put.
- Structural/size validation accepts a same-size corrupted Blob in P1; document that this is not detected (negative integrity expectation).
- Add/reparent/Delete/Undo/Redo dirty transitions.
- Ordinary Save: mutate during pending save; captured revision saved, newer revision dirty.
- Save-before-Open/Create Policy A: mutation attempts blocked during guard; save failure/cancel releases guard and preserves map; revision revalidation failure re-prompts.
- Save races: edits during save; stale captured revision.
- Transaction failure, quota failure, stale generation.
- Meta library usage transactional cap with two repository instances.
- Peak incremental space includes puts before deletes; final cap separate from browser estimate.
- Missing attachment and incompatible schema.
- Candidate draw/label/hit failure during Open (recovery is not pixel rollback).
- Two-tab same-map save conflict using two repository instances.
- Cancelled replacement.
- PDF viewer after saved-map Open.
- Create Map and empty startup preservation.
- Saved map deletion isolation and library usage update.
- Backup round-trip/corruption with full SHA-256 verification.

### 9.2 Native browser (NOT RUN in planning)

- Desktop Chrome/Edge.
- Android Chrome.
- iPhone Safari (browser and installed PWA where applicable).
- Save/reload/Open with PDF and Markdown bytes.
- Private mode/IDB denial.
- Storage estimate/persist honesty.
- Quota denial.
- Two tabs stale save.
- Browser data clearing/relaunch.
- Backup download/upload.
- Fullscreen, focus, IME, search, drag, Delete, Undo/Redo regression.

Mocked IndexedDB tests are not native browser durability evidence. Executed checks must be reported separately from planned checks.

---

## 10. Resolved decisions and unresolved choices

### Resolved

- IndexedDB only.
- Per-map durable attachment ownership; no dedupe.
- Explicit Save/Open; no auto-save; no auto-open.
- First save allocates persistent map ID.
- Session-only Undo/Redo.
- Fresh runtime token/revision on Open; node IDs preserved.
- Save captures a revision and marks only that revision saved.
- Ordinary Save does not lock mutations; newer edits remain dirty.
- Save-before-Open/Create uses Policy A bounded replacement guard plus dataset/revision revalidation.
- Open is atomic candidate installation with recovery, not pixel rollback.
- Download exports current committed live revision, including unsaved committed edits.
- Import always creates a new map ID/copy.
- Saved-map list reads lightweight metadata store.
- 512 MiB **application hard cap**, separate from browser quota; per-map 100 MiB unchanged.
- Saved-map Delete ships in P1b so users can recover capacity at the application cap.
- P1/P2 use structural/reference/size validation only; normal saved records have `sha256:null` and do not detect arbitrary same-size corruption.
- Portable backup always uses full SHA-256.
- Custom binary backup container preferred; no dependency.

### Genuinely unresolved

1. Exact stale-save UX: reload saved version vs save-as-copy only.
2. Whether to persist viewport/theme per map (theme global only in P1 plan).
3. Whether/when to add normal-save SHA-256 and on what UI cost budget.
4. Whether to add content-hash deduplication later.
5. Whether a ZIP import/export option is worth a future reviewed dependency.
6. Whether PWA installation/persist prompt belongs in P1 UI or P2 settings.
7. Whether saved maps support rename in P1 (currently map name comes from root/name at save).

---

## 11. Deferred and explicitly not implemented

- IndexedDB implementation
- Save/Open controls
- Upload/Download package implementation
- Comprehensive UI polish
- Empty-screen tutorial slides and Previous/Next/Skip
- OntoMap integration (idea only)
- Cloud synchronization
- Native filesystem connection
- 300-node capacity expansion (separate performance project)
- SQLite, OPFS primary store, backend
- New dependencies

---

## 12. Planning delivery

This planning turn changes documentation only. It does not modify application source, does not add dependencies, does not write browser storage, and does not run native browser verification.

Review package: `fileorbit-persistence-plan-r35.zip`  
Manifest: `SHA256SUMS` inside the package  
Native browser verification: **NOT RUN**


































