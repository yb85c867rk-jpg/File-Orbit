# FileOrbit Recovery Checkpoint Implementation Plan

Status: **SLICE 3 STARTUP RECOVERY IMPLEMENTED WITH r90/R91 OWNERSHIP CORRECTIONS; NATIVE ACCEPTANCE NOT RUN; FEATURE NOT DECLARED COMPLETE**

Slice 1 adds storage primitives; Slice 2 adds production checkpoint scheduling and confirmed-Save retirement; Slice 3 adds startup candidate discovery, Later/Discard/Recover, claim-bound child forks, existing candidate-pipeline installation, child adoption, and source supersession after a durable child checkpoint. Native browser acceptance and cross-device/multi-tab behavior remain pending. Existing IndexedDB maps remain the legacy **Previous local maps** library and are not migrated or deleted.

## 1. Scope and non-goals

### Product contract

- `.map` files are the primary user-managed documents; legacy `.fileorbit` remains readable.
- Only a confirmed writable write + close advances a document’s saved revision.
- A fallback download is an unconfirmed handoff.
- IndexedDB recovery stores **checkpoints**, not saved documents.
- Recovery never overwrites a user document, never marks a document saved, never clears dirty state, and never satisfies Save and continue.
- Existing `Previous local maps` records remain accessible and unchanged.

### Non-goals for the first implementation

- No automatic recovery of a file handle or its permissions.
- No cloud, cross-device, or permanent-storage claim.
- No DOM/controller/object-URL/undo-stack persistence.
- No silent migration, deletion, or rewriting of legacy map records.
- No capacity increase or hidden unlimited recovery budget.

## Evidence boundary

The reviewed r80/r81 native observations cover the tested PC browser workflow: PDF addition, repeated document Save, Save As confirmation, and PDF viewing. They do **not** establish mobile, other-browser, cross-origin, or recovery behavior. This plan is source-grounded. Slice 1 storage primitives are implemented; scheduling, startup recovery, and native verification remain pending. Native checks listed later remain required.

## 2. Inspected source inventory

| Area | Actual source / symbols | Reusable evidence |
|---|---|---|
| Database identity and limits | [schema.js](../../src/engine/hypertree/persistence/schema.js#L4-L19): `DB_NAME`, `DB_VERSION`, stores, `SCHEMA_VERSION`, attachment/node limits | Existing schema/limit vocabulary and `PersistenceError` |
| Upgrade/open lifecycle | [idb.js](../../src/engine/hypertree/persistence/idb.js#L36-L117): `createSchema`, `openPersistenceDatabase`, blocked/versionchange handling | Additive upgrade and connection closing already centralized |
| Atomic repository writes | [repository.js](../../src/engine/hypertree/persistence/repository.js#L184-L341): `save`, one maps/documents/attachments/meta transaction, generation and usage reconciliation | Reuse transaction/error/ownership patterns; do not reuse map record identity for recovery |
| Recovery storage slice | [recovery-repository.js](../../src/engine/hypertree/persistence/recovery-repository.js#L1-L666), [recovery-codec.js](../../src/engine/hypertree/persistence/recovery-codec.js#L1-L202), [recovery-schema.js](../../src/engine/hypertree/persistence/recovery-schema.js#L1-L108) | Implemented Slice 1 control/tombstone, checkpoint/reservation/claim/supersession, detached snapshot, accounting |
| Production scheduler | [recovery-scheduler.js](../../src/engine/hypertree/persistence/recovery-scheduler.js#L1-L368), [main.mjs](../../tests/harness/m5-exploration/main.mjs#L178-L230) | Implemented r87 debounced ownership/serialization and main mutation/Save wiring |
| Legacy load/list/delete | [repository.js](../../src/engine/hypertree/persistence/repository.js#L343-L545): `load`, `list`, `remove` | Preserve unchanged for Previous local maps |
| Usage/repair | [repository.js](../../src/engine/hypertree/persistence/repository.js#L547-L593): `repairUsage`, `usage`; [schema.js](../../src/engine/hypertree/persistence/schema.js#L16-L19): hard cap/reserve/meta keys | Extend accounting with recovery usage, without changing the 512 MiB policy |
| Snapshot/canonical tree | [codec.js](../../src/engine/hypertree/persistence/codec.js#L62-L195): `buildSaveSnapshot`; [codec.js](../../src/engine/hypertree/persistence/codec.js#L197-L233): refs/owned snapshot | Reuse canonical node copying, attachment metadata validation, limits, mapping |
| Restored runtime | [runtime.js](../../src/engine/hypertree/persistence/runtime.js#L39-L95): `reconstructSavedMapRuntime` | Reuse layout/model/registry reconstruction; adapt input type for checkpoints |
| Attachment ownership | [attachments.js](../../src/engine/hypertree/editor/attachments.js#L4-L145): registry `adopt`, `commit`, `release`, `clear`; L146-L162 `sweepAttachmentOwnership` | Reuse attachment IDs/metadata and ownership sweep; checkpoint storage needs separate byte ownership |
| Container detachment | [backup.js](../../src/engine/hypertree/persistence/backup.js#L248-L257) (r80) | Decoded attachments already own detached bytes; checkpoint snapshot must likewise materialize before async write |
| Document state/dirty | [main.mjs](../../tests/harness/m5-exploration/main.mjs#L144-L145), [main.mjs](../../tests/harness/m5-exploration/main.mjs#L1543-L1548) | `activeDocument`, `activeMap`, `dataRevision`, `mapDirty`; recovery must not mutate these except through install |
| Candidate installation | [reparent-action.js](../../src/engine/hypertree/exploration/reparent-action.js#L43-L101): `installCandidateEnvironment`; [main.mjs](../../tests/harness/m5-exploration/main.mjs#L2277-L2360): `installCreatedMap` | Recovery install must use the same candidate/frame/commit/recovery boundary |
| Mutation commits | [main.mjs](../../tests/harness/m5-exploration/main.mjs#L550-L586) history, L602-L630 reparent, L940-L963 editor apply, L2470-L2510 delete | Checkpoint scheduling belongs immediately after authoritative commits, not drafts |
| Editor applied ownership | [main.mjs](../../tests/harness/m5-exploration/main.mjs#L160), L910-L940/L1010-L1017; [editor-panel.js](../../tests/harness/m5-exploration/editor-panel.js#L277-L290) Retry | Checkpoint is independent of Retry ownership; never consumes/clears it |
| Document Save lifecycle | [main.mjs](../../tests/harness/m5-exploration/main.mjs#L2119-L2197): `saveDocument`; staged diagnostics and ownership | Successful close is the only point at which a checkpoint may be retired |
| Import/Open/local install | [main.mjs](../../tests/harness/m5-exploration/main.mjs#L2199-L2265), L1877-L1960, L2277-L2360 | Identity transition and candidate install rules reused for recovery |
| Startup/empty/destroy | [main.mjs](../../tests/harness/m5-exploration/main.mjs#L2372-L2423) | Recovery lookup runs after startup empty state; destroy invalidates recovery work |
| Existing repository tests | [persistence.test.mjs](../../tests/engine/persistence/persistence.test.mjs#L91-L720), [p2-lifecycle.test.mjs](../../tests/engine/persistence/p2-lifecycle.test.mjs#L1-L130) | Reuse fixtures for atomicity, quota, stale generation, blocked/versionchange |
| Existing document/lifecycle tests | [p1b-main.test.mjs](../../tests/engine/exploration/p1b-main.test.mjs#L179-L251) | Reuse actual Save/Open/retry/stale/destroy patterns |
| PDF/codec coverage | [backup.test.mjs](../../tests/engine/persistence/backup.test.mjs#L22-L173) | Preserve exact attachment bytes and source detachment regressions |

### Reusable mechanisms

- `PersistenceError`/`normalizeIdbError` and transaction wrappers.
- `buildSaveSnapshot` canonical tree + attachment mapping and existing limits.
- `reconstructSavedMapRuntime` layout/model/registry reconstruction.
- `installCandidateEnvironment` and the existing commit/recovery candidate boundary.
- `sweepAttachmentOwnership` and attachment metadata validation.
- Existing `beforeunload` unsaved warning and pagehide/destroy cleanup; these are **not** recovery guarantees.

### Required new components

- Recovery schema stores and additive DB upgrade.
- Recovery snapshot builder/materializer with explicit byte ownership.
- Recovery repository API and atomic accounting.
- Commit scheduler/ownership in the main harness/app integration.
- Recovery startup prompt and candidate-install adapter.
- Claim/lease handling for multiple tabs.

## 3. Recovery data model

### Proposed stores

```text
DB_VERSION = 2                         (additive; existing v1 stores untouched)
STORE_RECOVERY_WORKSPACES = 'recoveryWorkspaces'
  keyPath: 'workspaceId'
  index: 'by_state_updatedAt' on ['state', 'updatedAt']

STORE_RECOVERY_CHECKPOINTS = 'recoveryCheckpoints'
  keyPath: ['workspaceId', 'checkpointGeneration']
  index: 'by_workspace' on 'workspaceId'

STORE_RECOVERY_ATTACHMENTS = 'recoveryAttachments'
  keyPath: ['workspaceId', 'checkpointGeneration', 'attachmentId']
  index: 'by_workspace_generation' on ['workspaceId', 'checkpointGeneration']

META_RECOVERY_USAGE = 'recoveryUsage'
RECOVERY_SCHEMA_VERSION = 1
```

The separate control store is required. Checkpoint rows alone are insufficient after deletion/discard because a delayed writer could recreate them. `recoveryWorkspaces` remains as a small tombstone/control record even when all checkpoint content is gone. Workspace IDs are never reused.

`SCHEMA_VERSION` stays 1 for legacy map/document records. Recovery has its own version and completeness markers.

### Workspace control record

```js
{
  recoverySchemaVersion: 1,
  workspaceId: 'ws_<random>',
  workspaceToken: 'wst_<random>',       // durable identity of this workspace instance
  state: 'active' | 'superseded' | 'discarded',
  createdAt, updatedAt: 'ISO',

  nextSequence: 8,                      // durable source for checkpoint + save ordering
  controlVersion: 14,                   // optimistic fence; every decision bumps this
  activeCheckpointGeneration: 6 | null,
  retiredThroughSequence: 5,            // highest save sequence retired durably
  lastSaveStarted: null | { saveId, sequence, startedAt },
  lastSaveCompleted: null | { saveId, sequence, completedAt },

  forkedFrom: null | {
    workspaceId, checkpointId, checkpointGeneration, workspaceToken
  },
  claim: null | {
    claimId, claimedAt, expiresAt
  },
  supersededBy: null | { workspaceId, checkpointGeneration | null },
  discardedAt: null
}
```

### Checkpoint record

```js
{
  recoverySchemaVersion: 1,
  workspaceId,
  workspaceToken,
  checkpointId: 'chk_<random>',
  checkpointGeneration: 6,              // allocated from nextSequence at commit
  capturedRevision: 12,                 // runtime diagnostic only; never cross-session identity
  documentName: 'plan.map' | null,
  origin: 'new' | 'open-file' | 'import-backup' |
          'previous-local' | 'recovery' | 'save-as' | 'unknown',
  sourceMapId: 'map_…' | null,
  tree: { /* canonical persisted tree */ },
  nodeCount: 17,
  attachmentRefs: [
    { attachmentId, originalName, sizeBytes, mime, classification, sha256 }
  ],
  attachmentCount: 2,
  attachmentBytes: 12345,
  state: 'complete',
  createdAt, updatedAt: 'ISO'
}
```

Recovery attachments:

```js
{
  workspaceId, checkpointGeneration, attachmentId,
  blob, originalName, sizeBytes, mime, classification, sha256
}
```

A checkpoint record is published only in the same transaction that writes all referenced attachment rows and updates usage. `state:'complete'` is a defensive marker; no partial complete record is exposed.

### Durable ordering and version model

No recovery decision compares runtime `dataRevision` from different sessions. Runtime revision is recorded for diagnostics only.

All ordering is scoped by `workspaceId + workspaceToken`:

- `nextSequence` allocates both `checkpointGeneration` and `documentSaveSequence` values. It never resets.
- `controlVersion` is an optimistic concurrency fence. A checkpoint writer captures it before snapshotting; its commit transaction must match it exactly.
- `activeCheckpointGeneration` identifies the latest complete checkpoint content.
- `retiredThroughSequence` is the durable watermark of recovery content covered by a confirmed document save.
- `state` and the retained control row are the tombstone preventing recreation after discard.
- `forkedFrom` records the exact source checkpoint generation used by a recovery fork.
- `supersededBy` records that a forked workspace has a durable replacement.

A checkpoint or source from another `workspaceId` or `workspaceToken` is never compared numerically with the current workspace. Runtime revisions from unrelated sessions never participate in retirement.

### Identity rules (revised for recovery forks)

| Transition | Workspace/checkpoint behavior |
|---|---|
| Create Map | New workspace; **baseline checkpoint immediately after successful authoritative commit** (decided) |
| Open File | New workspace; clean baseline needs no checkpoint until first committed edit |
| Import Backup | New workspace; **baseline checkpoint immediately after successful install** (decided) |
| Previous local maps | New workspace; source record ID is metadata only; record untouched |
| Save As | Same workspace; update document name metadata; no new workspace |
| Replacement with another map | Old workspace becomes inactive but its checkpoint remains; incoming map gets a new workspace |
| Recover checkpoint | **Fork a new workspace** with `forkedFrom` referencing the source checkpoint generation. Do not reuse the source workspace for editing |
| Explicit discard | Set source/workspace `state:'discarded'`, delete checkpoint/attachment rows, retain control tombstone |
| Source supersession | After the child workspace has a durable checkpoint or confirmed file Save, mark source `supersededBy`; source rows may then be removed |

No file handle, permission state, DOM, controller, object URL, undo/redo history, or filename-only identity is persisted.

### Attachment ownership and capacity

- Each workspace plus checkpoint generation owns its attachment rows.
- A new checkpoint writes a new generation, then deletes older generations for that workspace in the same transaction. Unchanged attachment IDs are reused where metadata matches; changed bytes are rewritten.
- No global content-addressed dedupe across workspaces in the initial version. Duplicate bytes across forked/independent workspaces are counted.
- Per-file and per-workspace limits remain `MAX_ATTACHMENT_BYTES`, `MAX_SAVED_ATTACHMENT_BYTES`, and `MAX_SAVED_MAP_ATTACHMENT_BYTES`; node limit remains `EDITOR_MAX_NODES`.
- Recovery attachment bytes count against the existing 512 MiB hard cap together with legacy library bytes. The value is not increased.
- The 16 MiB quota reserve remains unchanged.

## 4. Combined capacity enforcement (review finding R1)

Legacy records may remain readable and unchanged in shape, but **their write path must participate in combined capacity enforcement**. Preserving legacy records does not prohibit extending their capacity checks.

### Shared capacity transaction invariant

Both legacy `repository.save()` and every recovery checkpoint write/retire/discard transaction must enforce:

```text
sum(all legacy attachment rows, including orphan rows)
+ sum(all recovery attachment rows, including relevant orphan rows)
<= APPLICATION_LIBRARY_HARD_CAP_BYTES
```

The decision uses actual attachment rows, not `META_LIBRARY_USAGE` or `META_RECOVERY_USAGE` counters. Counters are caches that are reconciled from rows.

### Legacy save transaction scope

The legacy save transaction must be expanded from:

```text
maps, mapDocuments, mapAttachments, meta
```

to also include, in the same readwrite transaction:

```text
recoveryAttachments, recoveryWorkspaces, recoveryCheckpoints
```

It reads all legacy and recovery attachment rows, computes actual totals, subtracts the replaced map’s old rows, adds proposed rows, checks the shared cap, writes map/document/rows/meta, and updates both usage counters before commit.

### Recovery write transaction scope

Every recovery checkpoint/discard/retire transaction includes:

```text
recoveryWorkspaces, recoveryCheckpoints, recoveryAttachments,
mapAttachments, meta
```

It reads actual legacy and recovery rows, computes the same combined total, applies replacement/removal of the target workspace generation, enforces the cap, and updates both counters before commit.

### Serialization

Both transaction scopes overlap on `meta` and attachment stores and are readwrite, so IndexedDB serializes competing legacy/recovery writes for the same database. The second writer must re-read rows and usage inside its own transaction; it cannot rely on a total read before the first writer committed.

### Counters and reconciliation

- Actual rows are authoritative.
- Missing, stale, or corrupt counters are repaired to actual values in the same transaction.
- Corrupt attachment rows cause explicit rejection (`usage-corrupt`/`invalid-attachment-record`), not silent exclusion.
- Orphan rows are counted. If they exceed the cap, writes fail until repaired or explicitly removed by an authorized cleanup; recovery is never silently deleted to make space.
- `repairUsage()` covers both legacy and recovery domains: recomputes all rows, rewrites both counts, reconciles legacy map summaries and recovery checkpoint summaries, and never deletes user/recovery content.
- Aborted transactions leave rows, checkpoint records and both counters unchanged.

## 5. Checkpoint lifecycle and durable retirement (review finding R2)

### Trigger points

Call `scheduleRecoveryCheckpoint(reason)` only after a successful authoritative commit:

- editor form command application;
- Add Data/Add Folder/Edit Folder/Edit Data/Rename;
- reparent;
- delete;
- Undo/Redo replay;
- Create Map/Import baseline (decided: immediate after successful install);
- recovery fork after successful install (baseline checkpoint for the child; source remains until child is durable).

Uncommitted drafts, hover/selection/camera changes, pickers and in-flight file writes do not schedule checkpoints.

### Capture

1. Capture owner token containing `{workspaceId, workspaceToken, session, datasetToken, expectedControlVersion, capturedRevision}`.
2. Acquire the shared snapshot/mapping coordinator so file Save and checkpoint capture cannot allocate conflicting persistent attachment IDs.
3. Build canonical tree with `buildSaveSnapshot({ mapId:null, expectedGeneration:null, ... })`.
4. Materialize every referenced attachment into a detached Blob/bytes immediately and hash it. Do not retain a source File-backed slice.
5. Validate node/per-file/per-workspace limits before writing.
6. Serialize one checkpoint writer; coalesce to the latest dirty revision while a write is pending.

### Checkpoint commit transaction

Inside one readwrite transaction covering the recovery stores, legacy attachment rows and meta:

1. Read `recoveryWorkspaces` control by `workspaceId`.
2. Require `workspaceToken` match, `state === 'active'`, and `controlVersion === expectedControlVersion`. Otherwise reject `recovery-stale-owner` with no writes.
3. Allocate `checkpointGeneration = nextSequence++`.
4. Read actual legacy/recovery attachment rows; compute combined capacity with old checkpoint rows replaced.
5. Write checkpoint row, attachment rows, delete older generations for the workspace, update `activeCheckpointGeneration`, `controlVersion++`, and both usage counters.
6. Commit.

A stale writer cannot create a checkpoint after a newer save/discard because `controlVersion` changed. A retry after a control conflict must re-capture the current authoritative state only if the document is still dirty; it must not replay the old payload.

### Document-save reservation and retirement

At the start of a document Save, after any required Save picker has been obtained (so user activation is preserved) and before encoding:

```text
beginRecoverySave(workspaceId, workspaceToken)
  -> { saveId, saveSequence, controlVersion }
```

The repository transaction:

- creates/loads the workspace control row (best effort; failure must not block document Save);
- allocates `saveSequence = nextSequence++`;
- increments `controlVersion` to fence checkpoint writes captured before this save;
- records `lastSaveStarted` for diagnostics;
- returns the sequence.

After confirmed write + close only:

```text
retireRecoveryThrough(workspaceId, workspaceToken, saveId, saveSequence)
```

The transaction:

- verifies same workspace/token and that `saveSequence <= nextSequence`;
- deletes complete checkpoint generations `<= saveSequence`;
- preserves generations `> saveSequence` (later edits);
- sets `retiredThroughSequence = max(current, saveSequence)`;
- sets `lastSaveCompleted`, increments `controlVersion`;
- updates both usage counters;
- never touches legacy records.

A failed Save, picker cancellation, fallback download, or failed close does not retire anything. A later recovery checkpoint is not blocked by the unused sequence gap. Recovery retirement failure is reported as recovery maintenance failure only; it must not turn a successful file write/close into a document Save failure.

### Concrete sequences

**1. Checkpoint at runtime revision 12 → restart/recover → Save without another edit**

- Source W1 has checkpoint generation 5, capturedRevision 12.
- Restart resets runtime revision; recovery forks W2 with `forkedFrom` generation 5.
- W2 Save reserves sequence `6`, encodes current tree, closes successfully, retires W2 generations `<=6` (none), no numeric comparison to source revision 12.
- W2 then marks W1 `supersededBy = {W2, null}` because the confirmed document Save covers the source snapshot. W1 stays until supersession cleanup succeeds.

**2. Save snapshot R → later edit → Save R completes**

- W begins Save, reserves sequence 10, controlVersion 20.
- Later edit schedules a checkpoint with expected controlVersion 20; it commits generation 11, bumps controlVersion to 21.
- Save R completes and retires `<=10`; generation 11 remains recoverable and dirty later edits remain.

**3. Checkpoint captured before Save → retirement → old writer completes**

- Checkpoint writer captured controlVersion 3.
- Save begins: controlVersion becomes 4, saveSequence 9.
- Save completes: generations `<=9` retired.
- Old writer attempts commit with expected version 3 → `recovery-stale-owner`, writes nothing. It may re-capture only if the current map is still dirty.

**4. Explicit discard → delayed old writer attempts recreation**

- Workspace W5 control `state:'active'`, version 7, checkpoint generation 4.
- User discards: transaction sets `state:'discarded', discardedAt`, increments version to 8, deletes checkpoint/attachment rows, keeps the control tombstone.
- Delayed writer with expected version 7 is rejected; it cannot recreate the checkpoint. Recovery UI excludes `state:'discarded'`.

### Replacement/destroy

- Replacement changes active workspace; cancel the old workspace debounce/owner.
- Destroy cancels the scheduler; it does not wait for IndexedDB during pagehide.
- Committed checkpoints remain; stale completion cannot publish or clear a newer workspace.
- Do not rely on asynchronous checkpoint work completing during beforeunload/pagehide. Existing unsaved warnings remain.

## 6. Multi-tab and recovery ownership (review finding R3)

### Chosen policy: independent workspace per recovered editing session

Recovery does **not** reuse the source workspace for editing. It forks a new workspace. This avoids shared mutable checkpoint writes and makes long-lived writer leases unnecessary.

### Source claim

- Claim protects only the act of installing one source checkpoint as a fork. The proposed installation lease is 2 minutes; it is not renewed and is never an ongoing editing lock.
- `claimRecoverySource(sourceWorkspaceId, sourceGeneration)` atomically writes a claimId/expiry to the source control row if no unexpired claim exists and the source is active.
- The claim is released after installation succeeds or fails. It is not a long-term editing lock.
- A slow installation may outlive the claim. Before commit/install, the tab revalidates source workspace/token/generation/claim. If the claim expired and was stolen, the fork still must not write the source; it can continue only with its already-created child workspace, or report a stale recovery attempt.
- A backgrounded tab after expiry owns its child workspace and never writes the source. Its checkpoint writes target the child control only.

### Two tabs recovering the same source generation

1. Tab A claims source generation 5 and forks W2.
2. Tab B's claim attempt fails while A's claim is unexpired: “Recovery is in use by another FileOrbit tab.”
3. If A's claim expires before installation and B claims, B may fork W3. Both forks are independent unsaved maps. Neither writes W1.
4. The source remains the only durable recovery copy until a child checkpoint or confirmed Save is secure.
5. Once W2 (or W3) has a complete checkpoint or a confirmed file Save, it marks W1 `supersededBy`. The source rows may then be removed in a separate cleanup transaction; a crash before cleanup leaves source intact.

Recovery installation failure or durable-handoff failure releases the claim and leaves source checkpoint/rows unchanged.

### Source preservation and cleanup

- Do not delete the source before a child checkpoint/confirmed Save commits.
- `supersededBy` is written only after the child is durable.
- Source deletion retains the `recoveryWorkspaces` control tombstone (`state:'superseded'`, `supersededBy`, timestamps).
- If source cleanup fails, it remains visible as superseded but is not offered as a fresh recovery candidate.
- Explicit discard by the claimer sets `state:'discarded'` and deletes content; another tab that already forked has its own independent workspace and is unaffected by source deletion.

## 7. Recovery UX

Only query recovery after startup reaches empty state and the recovery repository opens successfully.

```text
Recover unsaved work?
FileOrbit found recovery data for “<name>” from <time>.
It is not a saved document.

[Recover work] [Discard recovery] [Later]
```

- **Recover work**: fork/install as an unsaved map with no file handle; source remains until the child is durable.
- **Discard recovery**: claim/verify source, mark tombstone, remove checkpoint/attachments/usage after confirmation.
- **Later**: close the prompt for this tab; keep the checkpoint.
- Multiple complete candidates: list the latest active candidates with name/time/size; selection is explicit.
- No candidate: no notification.
- Corrupt/incomplete checkpoint: “Recovery data is incomplete and cannot be opened”, with Discard; never install partial state.
- Checkpoint failure during editing: no persistent editor/storage warning; details live in Help/Recovery status. A confirmed file Save remains successful even if recovery maintenance fails.

Wording constraints remain: no Saved/cloud/permanent/cross-device/handle-restoration claims; fallback download remains unconfirmed.

## 8. Legacy data, upgrade, and browser boundaries

### Upgrade and deployment effect

- `DB_VERSION` 1 → 2.
- On `onupgradeneeded`, create only missing recovery stores/indexes; never delete or rewrite `maps`, `mapDocuments`, `mapAttachments`, `settings`, or `meta`.
- Existing records use `SCHEMA_VERSION = 1` and remain loadable.
- No automatic migration of legacy maps to recovery.
- Upgrade can be triggered by the existing production database-open path even if Slice 1 adds no recovery UI/scheduler. “No recovery UI/scheduler” does **not** mean “no production schema effect.”
- Blocked upgrade/versionchange: recovery is disabled; document file Open/Save remains independent; never delete the DB to resolve blockage.
- Rollback: no down-migration. A v2 database cannot be opened by a v1-only client. Deploy v2-capable clients with/ before upgrade; rollback requires a compatible reader, never deletion.
- Repair/usage code must understand both domains even when recovery has no checkpoints.

### Legacy preservation

- Previous local maps list/load/delete behavior unchanged.
- Legacy write capacity checks are extended to combined usage (R1), but record shapes, IDs, and display remain unchanged.
- Recovery discard/retirement never deletes legacy values.

### Origin/profile boundary

Recovery is browser-profile and origin scoped. A different port/origin (for example `:8099` vs `:8100`) does not share recovery or IndexedDB. No cloud, cross-device, permanent-storage, or file-permission recovery is promised.

## 9. Decisions, tradeoffs, and unresolved questions

### Resolved

- One active complete checkpoint content per workspace; generation rows for fencing/cleanup.
- One shared DB with additive schema v2; separate control/checkpoint/attachment stores and usage meta.
- Random `workspaceId` + durable `workspaceToken`; `checkpointGeneration`/`saveSequence` from one durable monotonic per-workspace sequence.
- `controlVersion` optimistic fence plus tombstones for discard/supersession.
- Combined capacity enforced atomically in both legacy and recovery write paths using actual rows.
- Runtime revision is diagnostic only across sessions.
- Recovery forks a new workspace; source checkpoint is claimed only for install, then superseded after child durability. No long-running lease.
- Create Map and Import Backup baseline checkpoints are created immediately after successful commit (not first edit).
- Conservative retention: no automatic age/count pruning in the initial implementation; only explicit discard and established save/supersession retirement.
- No handle persistence, no auto-overwrite, no beforeunload dependency.

### Deferred, not prerequisites for Slice 1

- Worker offload for hashing/IDB.
- Cross-workspace content-addressed dedupe.
- Automatic pruning beyond capacity-driven failure.
- Multiple-candidate bulk management UI.

### Genuinely unresolved

- Exact content fingerprint/ancestry policy, if any, beyond generation+save watermark (current design deliberately does not infer ancestry from runtime revision).
- Whether source cleanup after supersession should be immediate or delayed to a maintenance/startup pass.
- Whether second recovery of a still-active but already-forked source should be blocked or offered as an independent fork.
- Cross-tab detection of a file document concurrently edited outside FileOrbit (document adapter remains last-writer).
- UI for multiple active recovery candidates beyond a simple list.

## 10. Implementation slices

### Slice 1 — Storage layer, combined accounting, and durable fencing (IMPLEMENTED r84; r85/r86 CORRECTIONS)

**Scope**

- `schema.js`: `DB_VERSION=2`, new recovery stores/constants, tombstones/control validation helpers.
- `idb.js`: additive v2 upgrade; preserve blocked/versionchange.
- new `recovery-codec.js`: `buildRecoverySnapshot`, materialized attachment ownership, `ownRecoverySnapshot`.
  - extended legacy save() transaction scope and combined-cap checks;
  - exposed createRecoveryWorkspace, loadRecoveryWorkspace, saveRecoveryCheckpoint, loadRecoveryCheckpoint, listRecoveryCandidates, eginRecoverySave, bandonRecoverySave, 
etireRecoveryThrough, claimRecoverySource, 
eleaseRecoveryClaim, supersedeRecoverySource, discardRecoveryWorkspace, combinedUsage, and repair of both usage domains;
  - extend legacy `save()` transaction scope and combined-cap check;
  - `createRecoveryWorkspace`, `loadRecoveryWorkspace`;
  - `saveRecoveryCheckpoint` with expected controlVersion;
  - `beginRecoverySave`, `retireRecoveryThrough`;
  - `discardRecoveryWorkspace`, `claimRecoverySource`, `releaseRecoveryClaim`, `supersedeRecoverySource`;
  - `listRecoveryCandidates`, `loadRecoveryCheckpoint`, `combinedUsage`, `repairUsage` both domains.
- `index.js` exports.
- `tests/engine/persistence/recovery.test.mjs`, upgrade-preservation tests.

**Invariants**

- Legacy/v1 records remain readable and unchanged.
- Combined cap enforced from actual rows in both write paths.
- Checkpoint + attachments + both usage counters atomic.
- controlVersion/tombstone fences delayed writers.
- No scheduler/UI/main changes.
- Schema upgrade is non-destructive and occurs through existing production open path.

**Acceptance**

- Boundary tests: legacy+recovery at cap; recovery rejected at cap; legacy rejected at cap; concurrent writes cannot both pass; abort preserves rows/counters; repair both; stale controlVersion and tombstone rejection; exact checkpoint bytes; v1→v2 legacy preservation.

**Completion criteria — met in r84; strengthened in r85**

Recovery repository, exact-byte round trip, detached source, tombstone/stale fencing, save-reservation validation, source-generation protection, combined accounting, repair, and genuine v1-to-v2 preservation tests pass. No recovery UI or checkpoint scheduling exists. The schema upgrade and legacy combined-capacity check are production-active storage effects; the cross-tab concurrency test is skipped because FakeIndexedDB stages overlapping readwrite transactions, and native IndexedDB concurrency remains NOT RUN.


**r85 review corrections**

- **R1 payload authority:** saveRecoveryCheckpoint now owns and validates the proposed snapshot before opening a transaction. Node count, unique attachment count, per-file/workspace totals, tree references, attachmentRefs, payload sizes, metadata, and SHA-256 are derived/verified from detached bytes; caller-declared totals/counts/node counts are compared rather than trusted. Caller mutation during asynchronous preparation cannot change the admitted snapshot. The atomic existing-row combined-cap check remains.
- **R2 discard authorization:** discardRecoveryWorkspace now requires either an exact, unexpired source claim bound to the expected checkpoint ID/generation, or an explicit owner control version. It atomically verifies workspace/token, active generation, checkpoint identity, claim identity/expiry, and expected values before deleting anything. Older/replaced/expired claims cannot delete newer source content, and no unguarded discard path bypasses the source-generation fence.
- **R3 complete checkpoint reads:** loadRecoveryCheckpoint requires active-generation identity, exact attachmentRef/row correspondence, counts, totals, metadata, sizes, and hashes; it rejects incomplete/corrupt checkpoints without deleting rows. Hashes are computed outside the transaction after a coherent read. supersedeRecoverySource preflights complete source and child checkpoints, then revalidates decisive identities/generations atomically before marking the source superseded. An incomplete child cannot supersede a valid source.
- **R4 genuine upgrade fixture:** the upgrade test now creates a raw v1 database with only the original stores/indexes, seeds original-format map/document/attachment/settings/meta records, asserts recovery stores are absent, opens through the production v2 path, asserts additive stores/indexes, preserves legacy tree/IDs/metadata/bytes/settings, and reopens for list/load. It no longer uses the v2 schema creator to manufacture a v1 fixture.

The r85 focused regressions cover understated/overstated totals, mismatched payloads, duplicate/missing attachment IDs, caller mutation during preparation, stale/expired/replaced claims versus advanced source, missing/extra rows, same-size hash corruption, metadata/count/total mismatches, invalid generation relationships, incomplete-child supersession, and exact-byte success. Native IndexedDB upgrade/quota/multi-tab remains NOT RUN.

**r86 identity corrections**

- **R1 fork identity:** createRecoveryWorkspace validates, inside the same readwrite transaction that creates the child, exact agreement among forkedFrom workspaceId/token, current source workspace ID/token, forkedFrom checkpoint ID/generation, active source generation, source checkpoint record workspace ID/token/ID/generation, claim ID, claim checkpoint ID/generation, active source state, and claim expiry. A wrong-but-valid source token or an old-generation claim is rejected before any child/control write; the stored forkedFrom record is built from the validated captured identity only.
- **R2 checkpoint identity:** a shared checkpointIdentityError helper now checks checkpoint.workspaceId and checkpoint.workspaceToken against the containing workspace control, plus expected workspace/token/checkpoint ID/generation. loadRecoveryCheckpoint, claimSource, candidate eligibility, discard, and supersede all use the same rule. Corrupt identity is rejected or excluded from candidates without rewrite/deletion. Supersession requires consistent source and child identities in addition to complete payloads.

The r86 focused regressions cover wrong valid-format source token, generation-1 claim for generation 2, mismatched claim checkpoint ID, expired claim, valid exact fork, child/workspace token and workspaceId mismatch, wrong generation, valid load/candidate behavior, inconsistent child and source identities for supersession, and invariant preservation (no child, state/checkpoint/bytes/claim/controlVersion/usage unchanged). Controlled fake-store corruption is used only to create identity mismatches that a keyPath API cannot naturally express.


### Slice 2 — Production checkpoint scheduler and save retirement (IMPLEMENTED r87)

- New recovery controller/scheduler, shared snapshot/mapping coordinator.
- Main commit hooks for editor/reparent/delete/undo/redo and Create/Import baselines.
- `beginRecoverySave`/`retireRecoveryThrough` around existing document Save lifecycle.
- Debounce/coalescing, one writer, stale session/dataset checks, destroy/replacement cancellation.
- Tests: dirty/saved untouched, later edits retained, captured-before-save writer fenced, no checkpoint on drafts.

**r87 implementation status**

- Added recovery-scheduler.js: random workspace ownership, 600 ms debounce, one serialized writer, latest-state coalescing, temporary attachment retention/release, stale-owner recovery, and bounded diagnostics.
ecovery-scheduler.js: random workspace ownership, 600 ms debounce, one serialized writer, latest-state coalescing, temporary attachment retention/release, stale-owner recovery, and bounded diagnostics.
- Production main wiring schedules after successful editor Add/Edit Folder/Data, legacy rename/metadata, reparent, Delete, and Undo/Redo; Create Map and Import Backup establish a new workspace and commit an immediate baseline. Drafts, navigation, selection, details, camera/resize, failed/no-op commits, and clean Open/Previous-local-map baselines do not schedule checkpoints.
- Workspace lifecycle: Save As retains the workspace; successful Open/File/Import/Create replacement invalidates outgoing scheduler ownership and starts a new workspace; destroy invalidates the scheduler while leaving committed recovery rows intact.
- Document Save reserves a durable recovery save after destination acquisition and before encoding, bound to the document Save operation/session/dataset. Only successful owned write+close retires; picker cancellation, encoding/write/close failure, permission failure, and fallback download abandon the reservation and preserve/restore a checkpoint for dirty state. Retirement failure is reported as recovery maintenance failure and does not change a successful file-Save result.
- Actual main-entry tests with __M5_LEGACY_PERSISTENCE_HARNESS__ = false cover Create baseline, exact attachment bytes, draft/navigation non-scheduling, Add data, reparent, Delete, Undo/Redo, debounce/coalescing, Save retirement, Save As workspace retention, and fallback preservation. Scheduler unit tests cover Save-ordering cases A-E, including delayed pre-Save fencers and later checkpoints. Native IndexedDB remains NOT RUN; native concurrency is not claimed.


**r88 lifecycle/retention corrections**

- Save retirement now reconciles a later committed dirty revision after retirement/abandonment without reusing an obsolete request identity. Pending debounce, preparing, and already-committed later checkpoints remain recoverable; a pre-Save delayed writer remains fenced.
- Scheduler operations capture immutable owner/lifecycle identities before every await. Workspace creation, control reads, reservation, retirement, abandonment, checkpoint success/failure, and cleanup do not mutate or report into a replacement workspace. invalidate() invalidates pending workspace creation.
- Main document Save rechecks the original save owner after recovery retirement and before destination adoption, savedRevision, or Saved publication. A delayed A completion cannot adopt its destination or report into B.
- Attachment retention is now leased/counted: each scheduler request receives an independent idempotent lease, sweeps honor isRetained, coalescing/failure/invalidation release only their own lease, and final release permits normal reclamation with correct byte accounting.


### Slice 3 — Startup recovery fork, claim, install, UX (IMPLEMENTED r89)

- Recovery prompt (Recover/Discard/Later), candidate list.
- Claim source generation; fork child workspace; install through shared candidate boundary.
- Child baseline checkpoint; source supersession after child checkpoint or confirmed Save.
- Tests: two tabs, expiry, install failure, draw/label/hit failure, corrupt checkpoint, PDF viewer, fallback handoff.


**r89 implementation status**

- Startup discovery runs once after a stable empty state and only shows a dialog when eligible candidates exist. Starting Create/Open/import cancels pending discovery. Later/Escape close without changing rows; no navigation-time reopening.
- The text-only dialog lists exact candidates with name, timestamp, folder/file counts; Later is initially focused, focus is trapped/restored, and Discard warning states it removes only the selected recovery copy.
- Recover claims the exact selected source checkpoint (generation/ID), loads and revalidates complete tree/metadata/hashes/detached bytes, creates an independent child with exact forkedFrom identity, reconstructs the runtime registry, and installs through the existing installCandidateEnvironment frame/layout/draw/label/hit pipeline.
- Recovered work is installed dirty with no writable handle and stable IDs/bytes. The scheduler adopts the forked child via the minimal doptWorkspace API; later edits/Undo/Redo/confirmed Save checkpoint that child.
- A complete child checkpoint is secured before exact-generation source supersession. Installation/checkpoint/supersession failures preserve the source copy and release the installation claim; successful graph installation is not rolled back. Discard targets only the selected exact candidate and refreshes on stale/claimed changes.
- Actual main-entry tests cover empty startup, dialog, Later/Escape, single/multiple selection, discard isolation, claimed discard, recover exact content, PDF viewer, dirty/no-handle recovery, scheduler child adoption, later edit checkpoint, confirmed Save, fallback preservation, failed draw/label/hit, failed child checkpoint, destroy, and workflow interruption. Native behavior remains NOT RUN.

**r90 cancellation/ownership corrections**

- Recover and Discard use explicit request objects capturing operation ID, initial session/dataset, candidate identity, claim, runtime, child workspace, and post-install committed session/dataset/runtime. Checks use captured identities after every await.
- cancelStartupRecovery now cancels the active Recover/Discard request, not only discovery/dialog state. Create, Open File, Previous local maps, Import Backup, and destroy invalidate outgoing recovery before starting incoming work.
- Recover cancellations before graph commit dispose only the request runtime and release only its claim; after commit the live work is not rolled back, but adoption/supersession/status/dialog publication is skipped. A late adoption is invalidated only if it still owns the exact child workspace.
- Discard checks ownership after claim and immediately before the destructive call. Cancellation before destructiveStarted preserves source and releases the claim. Once the repository discard transaction has started, cancellation does not claim rollback; the deletion may complete and is documented/tested.
- Successful installation captures committed session/dataset/runtime; scheduler adoption, child checkpoint, supersession, claim release, status, and dialog close require exact post-install ownership.


**r90 cancellation/ownership corrections**

- Recover/Discard now use explicit request objects capturing request ID, initial session/dataset, candidate identity, claim, runtime, child workspace, installed state, committed session/dataset, and destructive-start boundary.
- cancelStartupRecovery cancels the active request, not only discovery/dialog state. Create, Open File, Previous local maps, Import Backup, and destroy invalidate outgoing recovery before incoming work.
- Every await is followed by captured-identity ownership checks. Pre-commit cancellation disposes only the request runtime and releases only its claim; post-commit cancellation never rolls back live work but skips adoption/supersession/status/dialog publication. Child scheduler ownership is invalidated only if it matches the exact cancelled child.
- Discard rechecks ownership after claim and immediately before the destructive call. Cancellation before destructiveStarted preserves source and releases the claim. Once the repository discard transaction has started, cancellation does not claim rollback; the operation may complete.
- Discovery/refresh publications are lifecycle-guarded. Duplicate Recover/Discard controls are disabled while busy.


**r91 stale-adoption ownership correction**
- r91a test-only correction: stale-adoption regression now captures detached authoritative tree via a narrow test hook and asserts existence plus exact deep equality; removed superseded duplicate branch. Production semantics unchanged. Korean native checklist: [FILEORBIT-RECOVERY-NATIVE-CHECKLIST-KO.md](FILEORBIT-RECOVERY-NATIVE-CHECKLIST-KO.md).


- doptWorkspace now validates the incoming source session/dataset, caller authorization, lifecycle, and current owner before any mutation. It loads the durable workspace before invalidating, then revalidates lifecycle/owner/source/authorization/token/state before replacing ownership.
- Rejected stale adoption preserves the existing owner identity, queued work, retention leases, pending Save state, and diagnostics. It never invalidates the current owner first.
- Main recovery calls adoption only after an immediate post-install ownership recheck; adoption is bound to captured committed session/dataset/runtime/child and optional uthorized predicate. Post-await checks remain.
- Stale cleanup invalidates only an owner actually adopted by that request, still held at the exact same identity and exact child ID/token; replacement owners are never invalidated.
- Actual main regression establishes B’s valid workspace while A is paused before adoption, verifies B’s owner/control/diagnostics/tree/bytes/handle/dirty/status are unchanged, then performs a real B edit and checkpoints it into B’s original workspace.


### Slice 4 — Native acceptance/hardening

- PC/Android/iPhone profile/origin, crash/restart, quota pressure, large attachments, multi-tab races, no auto-overwrite/no false Saved.
- Native results separate; not inferred from mocks.

## 11. Required test matrix

| Area | Case | Layer |
|---|---|---|
| Round trip | exact tree/IDs/metadata/attachment bytes/digests | Repository |
| Combined cap | legacy+recovery exactly at cap | Repository |
| Combined cap | recovery write rejected over cap; prior checkpoint intact | Repository |
| Combined cap | legacy write rejected over cap | Repository |
| Concurrency | competing legacy/recovery writes cannot both pass obsolete totals | Repository with two connections |
| Atomicity | quota/transaction abort preserves rows/counters/prior checkpoint | Repository fault injection |
| Repair | legacy and recovery counters/corrupt summaries repaired; orphan rows counted | Repository |
| Legacy upgrade | v1 maps list/load/delete unchanged after v2 | Upgrade tests |
| Stale fence | checkpoint writer old controlVersion rejected after save/discard | Repository |
| Tombstone | explicit discard then delayed writer cannot recreate; control row remains | Repository |
| Sequence examples | rev12 restart/recover save; save R + later gen; pre-save writer; discard race | Repository |
| Save retirement | saveSequence retires <=, keeps >; later edit checkpoint remains | Main integration |
| Dirty truth | checkpoint success never Saved/clean/handle change | Main integration |
| Drafts | form draft does not checkpoint | Main integration |
| Mutations | edit/reparent/delete/undo/redo checkpoints exact | Main integration |
| Replacement/destroy | stale checkpoint completion ignored; prior checkpoint preserved | Main integration |
| Multi-tab | two claims, expiry, fork W2/W3, source preserved, supersession cleanup | Repository + main |
| Recovery install | draw/label/hit failure; corrupt checkpoint; source intact | Main integration |
| Recovery document | no handle, dirty, PDF viewer, subsequent Save picker | Main integration |
| Fallback | download handoff not confirmed, save doesn’t satisfy, no dirty clear | Main integration |
| Native | crash/refresh, quota, multi-tab, Android/iPhone | Native checklist |

## 12. First-slice exact starting scope

Slice 1 is a storage-only implementation, but it **does** change the production database version constant and legacy `save()` capacity transaction. It is dark from a UI/scheduler standpoint, not schema-neutral.

Exact scope:

- `src/engine/hypertree/persistence/schema.js`
- `src/engine/hypertree/persistence/idb.js`
- new `src/engine/hypertree/persistence/recovery-codec.js`
- `src/engine/hypertree/persistence/repository.js` (including combined legacy save checks and repair)
- `src/engine/hypertree/persistence/index.js`
- new `tests/engine/persistence/recovery.test.mjs`
- extend `tests/engine/persistence/p2-upgrade.test.mjs` and relevant legacy save tests

No `main.mjs`, scheduler, recovery prompt, startup recovery install, document Save routing, legacy record shapes, or source records change in Slice 1.

Slice 1 completion evidence covers non-destructive v1→v2 open, exact checkpoint round trip, detached source bytes, atomic combined accounting from both write paths, stale controlVersion/tombstone fencing, exact save reservations, newer-source generation protection, repair of both domains, and no legacy record alteration. The fake IndexedDB cross-tab concurrency case is skipped and native IndexedDB concurrency remains NOT RUN.

## 13. Review checklist

- [ ] Legacy and recovery writes both enforce combined actual-row capacity atomically.
- [ ] Transaction store scopes overlap/serialize competing writes.
- [ ] Tombstones/control rows prevent delayed recreation after discard/retire.
- [ ] Runtime revisions are never compared across sessions/workspaces.
- [ ] Save retirement uses durable saveSequence, keeps later generations.
- [ ] Recovery forks a new workspace; claim is install-only, not ongoing ownership.
- [ ] Source checkpoint preserved until child checkpoint/confirmed Save.
- [ ] No automatic age/count pruning in initial version.
- [ ] Combined capacity failure preserves complete checkpoints.
- [ ] No legacy migration/deletion.
- [ ] No beforeunload dependency.
- [ ] Slice 1 schema effect is documented and tested.
- [ ] Native checks not inferred from mocks.












