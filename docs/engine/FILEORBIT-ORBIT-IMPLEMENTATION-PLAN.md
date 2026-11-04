# FileOrbit Orbit Workspaces — Implementation Plan

Status: **SLICE 1–5 ACCEPTED; SLICE 6 NATIVE ACCEPTANCE PARTIAL/BLOCKED; r123 INTEGRATED OPEN MAP BROWSER; r124 FOCUS CORRECTION; r125 AUTOMATIC PERSISTENCE + THEME-ONLY SETTINGS; r126 AUTOMATIC PERSISTENCE CORRECTIONS; r127 OPEN LIFECYCLE CORRECTION; r128 CONNECTED ORBIT MENU; r129 CREATE MAP SIMPLIFICATION + SIDEBAR TOOLTIPS; r130 SAVE-LOCATION WORDING; r131 COPY MAP + SIDEBAR SIMPLIFICATION; r132 COPY ENCODING STALE OWNERSHIP; r133 SIDEBAR ICON + STATUS ORDER; r134 OPEN ORBIT NAMING + ICON; r135 ENGLISH USER MESSAGES; r136 .ORBIT-ONLY DOCUMENTS + HELP; r137 HELP SAME-ROW/COORDINATION CORRECTION; r138 APPROVED VARIATION 06 BRANDING; r139 FEEDBACK PRESENTATION; r140 FEEDBACK CORRECTIONS; r141 STARTUP + SCOPE CORRECTIONS; r142 NONVISUAL ROUTINE FEEDBACK; r143 ROUTINE-PATH CORRECTIONS; r144 SEARCH-RESULT FOLDER HIGHLIGHTING; r145 SEARCH RESET CORRECTIONS; r146 SEARCH HIGHLIGHT COLOR + LOCAL READ-ONLY EMBED; r147 REVIEW CORRECTIONS; r148 FREE-EDITION STABILITY AUDIT; r149 DESKTOP DATA-SAFETY AUDIT; r150 PDF PREVIEW CORRECTION; r151 NATIVE DESKTOP ACCEPTANCE; r152 GRAPH-LABEL IMPROVEMENTS; r153 GRAPH-LABEL DEFECT CORRECTIONS; r154 SELECTED-ORDER + LEADER-CLEANUP CORRECTIONS; r155 SELECTED-LEADER OPACITY LIFECYCLE; r156 FOLDER-CONTEXT LABEL PRIORITY; r157 VIEWPORT-AWARE LABEL ELIGIBILITY; r158 VIEWPORT-EDGE GLYPH ELIGIBILITY; r160 CONFLICT MODAL + CONSOLIDATED CANCELLATION FEEDBACK; r161 REPEATED-CANCELLATION FEEDBACK OWNERSHIP; r162 APPROVED OPENING WORKFLOW; r163 OPEN ORBIT SUBMENU; r164 SUBMENU TYPOGRAPHY + CENTERED AUTO-DISMISS NOTICES; r165 SINGLE-OWNER CANCELLATION NOTICE; r166 CONFLICT WORDING + PICKER LABELS; r167 NARROW TOOLBAR OVERFLOW; r168 TOUCH TOOLTIPS + LANDSCAPE DETAILS; r169 FRIENDLY ENCODING FAILURE; USER-REPORTED PC PASS (NOT INDEPENDENT); NO COMPLETE CROSS-PLATFORM CLAIM.**

This document remains the Orbit plan. Slice 1’s directory adapter/name policy, Slice 2’s state controller, Slice 3’s baseline/conflict primitives, Slice 4’s left-navigation protected writable Open/save path, and Slice 5’s Create-in-Orbit/Create-Orbit/Add-to-Orbit paths are implemented. Orbit rename/delete, recursion, watching, persistent handles, manifests, and synchronization remain deferred. Slice 6 native acceptance is partial/blocked.

## 1. Actual working-tree baseline

The workspace has no `.git` metadata, so there is no commit baseline to cite. The baseline below is derived from files, tests, evidence, and preserved archives actually present.

- **r102** is the historical archive identified by the task premise as the earlier reviewed baseline.
- The working tree is ahead of r102. `review/` contains later historical archives:
  - `fileorbit-editor-save-r103.zip`
  - `fileorbit-create-ownership-r104.zip`
  - `fileorbit-dialog-cancel-r105.zip`
- The current source contains those later changes, including:
  - Create Map destination selection and automatic save (`pickCreationDestination`, `installCreatedMap`, `saveDocument`);
  - creation lifecycle ownership (`creationOwner`, `creationOwnerCurrent`, `committedOwner`, `committedMatches`);
  - the corrected dialog-cancel lifecycle regression and completion markers;
  - editor presentation cleanup.
- **r105 bounded correction was subsequently review-accepted.** The reviewer reran **11 relevant tests successfully**. This acceptance covers the corrected creation-ownership/dialog-cancel test slice; it does not establish native OS-picker or pagehide acceptance, which remains unverified.
- r102/r103/r104 notes are historical. r105 is the accepted latest preserved archive. Orbit planning was reviewed through r108; **Slice 1 primitives are now implemented**, while Orbit itself remains unavailable. Later slices remain planned.
- Current full `tests/engine`: **1083 tests, 1082 passed, 1 skipped, 0 failed** after the r124 focus correction. Focused Orbit and compatibility evidence is recorded separately.

### Slice 1 implementation status

Implemented and isolated:

- `src/engine/hypertree/orbit/names.js` — pure directory/map filename policy, NFKC/case keys, traversal/reserved/separator rejection, conservative collision lookup.
- `tests/harness/m5-exploration/orbit-directory-adapter.js` — directory-picker capability, permission query/request, child-directory creation preflight, top-level `.map` metadata enumeration with truncation/stale checks, isolated map-file create/write helpers.
- `tests/engine/exploration/orbit-names.test.mjs`
- `tests/engine/exploration/orbit-directory-adapter.test.mjs`

### Slice 2 implementation status

Implemented and isolated:

- `tests/harness/m5-exploration/orbit-state.js` — `createOrbitStateController` with closed/opening/listing/ready/blocked phase, active handle/name, session/request identities, metadata entries, permission, last refresh, truncation/errors, stale-safe open/refresh, close/destroy, and handle-based `matchEntry`.
- `tests/engine/exploration/orbit-state.test.mjs` — state/enumeration tests using the real r110 adapter and deferred synthetic handles.

Not implemented or connected:

- no `main.mjs` import or Orbit UI;
- no Orbit list/navigation or document routing;
- no activeDocument/recovery/editor/viewer/schema changes;
- no create:true, createWritable, deletion, or other filesystem mutation in the state controller;
- no persistent handles, index, manifest, watching, recursion, or real filesystem operations;
- At Slice 2 review time Orbit remained unavailable; Slice 4 supersedes this with read-only navigation and protected writable Open.
- native filesystem checks are NOT RUN.


### Slice 3 implementation status

Implemented and isolated:

- `tests/harness/m5-exploration/orbit-file-baseline.js` — opened-content/confirmed-write baseline provenance, frozen metadata, size-limited actual-file reads, ownership-bound preflight, scoped overwrite approval, stale-result rejection.
- `tests/harness/m5-exploration/file-conflict-dialog.js` — decision-only accessible conflict dialog (Overwrite/Save a Copy/Cancel).
- `tests/engine/exploration/orbit-file-baseline.test.mjs`
- `tests/engine/exploration/file-conflict-dialog.test.mjs`

Not integrated:

- no `main.mjs` hook, no Orbit writable Open/Create/Save, no document routing or savedRevision/recovery mutation;
- no file writes in baseline/dialog modules; tests use synthetic handles and bytes only;
- At Slice 3 review time Orbit was not integrated; Slice 4 now connects the reviewed primitives.
- native filesystem verification is NOT RUN.

- `docs/engine/FILEORBIT-FILE-DOCUMENTS.md` is a historical transition document. Its destination matrix still says Create Map leaves no handle, which is superseded by the current working tree. The Orbit plan records current behavior rather than silently preserving the stale statement.

### Slice 4 implementation status

Implemented and connected:

- `tests/harness/m5-exploration/index.html` — left-rail Orbit section, Open/Refresh/Close controls, name, status, empty/list containers, list/action CSS, narrow-screen scrolling and fullscreen containment through the existing app shell.
- `tests/harness/m5-exploration/orbit-panel.js` — snapshot-only panel renderer; no filesystem/state mutation.
- `tests/harness/m5-exploration/main.mjs` — real adapter/state wiring; Orbit Open/Refresh/Close; listed-map Open through shared decode/install; ownership tokens; opened baseline bind/verify; save protection; actual-destination confirmed baseline.
- `tests/harness/m5-exploration/file-conflict-dialog.js` — optional Save a Copy callback so the native picker is invoked from the user click.
- `tests/engine/exploration/orbit-panel.test.mjs`
- `tests/engine/exploration/orbit-main.test.mjs`

Production call flow:

1. Orbit action/Open invokes `orbitState.openDirectory()`; the adapter calls `showDirectoryPicker` synchronously from the click.
2. State enumerates top-level `.map` entries; panel renders the snapshot and current-entry match.
3. Selecting an entry reads the exact `File`, creates an opened-content baseline from those bytes, then calls `importBackupFile` with `{origin:'orbit', handle, mode:'writable', documentIdentity, openedBaseline, orbitToken}`.
4. Shared `decodeBackup` validates content; dirty decisions reuse `unsavedMapPrompt`/editor selection; `installCreatedMap` installs authoritative tree/metadata/detached attachments and commits `activeDocument`.
5. Commit binds the baseline to the committed handle/document/session/operation; post-install verification may mark changed/unknown but never replaces the opened digest.
6. `saveDocument` uses `preflightOverwrite` before encode and again immediately before write; conflict decisions create scoped approvals; Save a Copy invokes `showSaveFilePicker` from the dialog's click callback.
7. After write/close, `createConfirmedWriteBaseline` reads the actual destination and publishes only while the save/document owner is current; baseline failure keeps the successful save and marks the baseline unknown/observed.

Deferred:

- Orbit Create Map, Create Orbit, Add to Orbit, rename/delete, recursive folders, watching, persisted handles, manifests/indexes, sync;
- native filesystem acceptance (NOT RUN).

### Slice 4 r117 correction — late ownership and Save a Copy identity

Two reproduced r116 integration defects were corrected without enabling Slice 5:

- **Late Orbit Open replacing a newer standalone document.** `openOrbitEntry` now claims a shared document-ownership token before its first asynchronous read and captures session/dataset/request ownership. Standalone Open, saved-map Open, backup/fallback Open, Create Map, Orbit Open, import, and destroy invalidate outgoing ownership. `openOrbitEntry` rechecks ownership after `getFile`, baseline preparation, and before entering `importBackupFile`; import requests carry the ownership token and reject obsolete commits/failures. Obsolete requests clear only their own pending registry/prompt and do not publish status. `orbit-r1-ownership.test.mjs` covers standalone Open replacement, a newer Create Map prompt, and destroy through actual main-entry controls with a completion marker/watchdog.
- **Save a Copy bypassing disabled overwrite protection.** `resolveCopyDestination` compares the picker result with the original destination using exact identity and `isSameEntry`. Exact original, same-entry distinct handle, and identity-comparison failure are rejected as non-distinct/unproven; an unverifiable original is never written through Save a Copy. A verifiable changed original still requires a normal explicit Overwrite and content revalidation. Genuinely distinct destinations continue through confirmed-write baseline adoption. `orbit-r2-save-copy.test.mjs` covers all four identity cases, zero original writes, unchanged destination/savedRevision/dirty edits/attachments, explicit Overwrite, and a successful distinct copy.

Watchdogs bound both new main-entry scenarios; process exit alone is not used as completion proof.

### Slice 5 implementation status

Implemented:

- Create Map with active Orbit: claims creation/document/Orbit ownership, validates title/candidate/collision, encodes the candidate snapshot before destination creation, installs the candidate, revalidates ownership/collision, creates the .map entry through the directory adapter, writes/closes through the shared document writer, adopts only after close, establishes confirmed-write baseline, and refreshes the list/current marker.
- No per-map Save picker for active-Orbit creation.
- Title-only maps contain exactly one root and zero attachments; populated creation retains exact PDF/YAML attachment bytes.
- Collision policy: no overwrite, no automatic suffix, existing zero-byte files are collisions, case-equivalent names collide, incomplete/truncated scans block creation, and final adapter preflight is repeated before entry creation.
- No active Orbit: explicit Create Orbit / Open Orbit / Save standalone / Cancel choice. Create Orbit names and creates a child directory inside a user-selected parent; Open Orbit selects an existing directory; picker cancellation/denial preserves the current map and choice.
- Add to Orbit: accessible action in the Orbit panel; copies the authoritative committed tree and exact attachment bytes into the active Orbit without adopting the copy or changing the source handle, tree, baseline, dirty state, savedRevision, history, or recovery. Add collisions are explicit; no picker; no automatic open.
- Created Orbit maps use the same protected Save path; membership uses handles/isSameEntry, and Settings marks an Orbit-origin document outside the active Orbit.
- Orbit switch/refresh/close/open controls are blocked while an Orbit destination write is in flight; ownership checks also reject forced stale lifecycle completion.

Automated evidence:
- Focused Orbit + compatibility suites: 147/147 passed.
- Relevant creation/Save/editor/recovery/navigation regressions: 96/96 passed.
- Full engine suite: 1082 tests, 1081 passed, 1 skipped, 0 failed.
- Native File System Access acceptance: NOT RUN.

Deferred: rename/delete, recursion, watching, persisted handles, manifests/indexes, sync, native platform acceptance.

### Slice 5 r120 correction — Open Orbit choice ownership

The remaining Open Orbit continuation race is corrected:

- `openOrbitForCreation` preserves the immutable originating choice workflow, captured session, and dataset across the entire Open Orbit path.
- `openOrbit` accepts a deferred-status mode so shared completion cannot publish workflow-owned feedback before the caller validates ownership.
- The ownership token intentionally claimed by `openOrbit` is returned explicitly and validated against the current ownership; current replacement-session identities are not substituted into the obsolete request.
- The captured session/dataset are validated before status publication and before scheduling Create Map; the scheduled continuation uses that same owner.
- Stale completion closes the choice without opening Create Map, changing replacement feedback, restoring stale focus, or touching newer dialogs.
- Valid Open Orbit, picker cancellation, and permission denial behavior remains; ordinary Orbit selection still does not replace the current document.

Actual-main regression covers deferred Open Orbit picker + session replacement, asserting no Create Map dialog and unchanged replacement handle/tree/attachment state/dirty/baseline/feedback/locks. A second scenario invalidates after selection but before the scheduled continuation using the same captured owner. Completion markers and bounded watchdogs are used.

### Slice 5 r119 correction — Save ownership and Create Orbit lifecycle

Two reproduced r118 defects were corrected:

- **R1 obsolete Save side effects.** saveDocument now rejects initiation after destroy, supports expected ownership/session/dataset for asynchronous callers, rechecks ownership after recovery reservation and after both ordinary/preencoded encoding, and again immediately before download/write. Preencoded Orbit creation passes its captured owner and rechecks creation ownership before invoking saveDocument. Actual-main tests defer ordinary encoding followed by session replacement and destroy, defer the preencoded creation boundary, and exercise download fallback after ownership invalidation. They assert zero new createWritable/write/download operations and unchanged destination/tree/attachment/lock/dirty/baseline/feedback state.
- **R2 Create Orbit lifecycle.** The choice workflow now carries an immutable request/lifecycle identity; parent picker, directory creation, adoption, and scheduled Create Map continuation recheck it. Destroy invalidates/closes the choice and prevents late creation/adoption/focus/status. Directory creation already started may leave an honestly documented directory; no automatic deletion. Actual-main tests cover deferred picker + destroy, delayed directory completion after session replacement, deferred picker + newer workflow, superseded scheduled standalone continuation, and valid choice flows.

Slice 5 was subsequently review-accepted. Slice 6 native acceptance is partial/blocked.

### Editor-cleanup status, recorded separately

The earlier editor-presentation requirement is already represented in the current tree:

- `tests/harness/m5-exploration/editor-panel.js` no longer renders the obsolete IndexedDB/attachment notices from the earlier form implementation.
- `tests/harness/m5-exploration/main.mjs` sets `detailsPanel.dataset.editorActive` from `syncDetailsToggleState`.
- `tests/harness/m5-exploration/index.html` hides `#details` and `#search-results-host` while `aside[data-editor-active="true"]`.
- `tests/engine/exploration/editor-visibility-main.test.mjs` and related static tests cover active-form presentation, search-host preservation, and dirty-prompt behavior.

Orbit planning must preserve this: Orbit UI must not add IndexedDB notices to editor forms, and Orbit list search must not be mixed with graph-node Search.

## 2. Source inventory and reusable boundaries

### Create Map

| Actual path | Symbols | Orbit relevance |
|---|---|---|
| `src/engine/hypertree/exploration/create-map.js` | `prepareCreateMapCandidate`, `normalizeRelativePath`, `CREATE_MAP_CLASSIFY_CONCURRENCY` | Candidate tree, title validation, file/folder paths, classification, attachment registry population, node/byte limits. |
| `tests/harness/m5-exploration/create-map-dialog.js` | `createCreateMapDialog`, `updateName`, `submitCreation`, `close` | Title-only and populated preview; submit/cancel lifecycle; stale-outcome suppression. |
| `tests/harness/m5-exploration/main.mjs` | `startCreateMap`, `prepareCreateMapSelection`, `prepareCreateMapWithToken`, `prepareCreateMapDrop`, `installCreatedMap`, `pickCreationDestination` | Existing creation ownership, replacement decision, candidate installation, creation save. |
| `src/engine/hypertree/exploration/reparent-action.js` | `installCandidateEnvironment` | Shared frame/session/prepare/commit/candidate boundary. Do not create a second installer for Orbit. |

Creation currently supports a valid title alone as one structural root and populated files/folders; `installCreatedMap` acquires a destination and performs the shared save path. Orbit must reuse this, adding a destination mode rather than a parallel installer.

### Open, Save, Save As, Download

| Actual path | Symbols | Orbit relevance |
|---|---|---|
| `tests/harness/m5-exploration/document-adapter.js` | `createDocumentAdapter`, `writableSupported`, `pickOpen`, `pickSave`, `write`, `download` | File handle capability, permissions, write/close, download handoff. Does not implement directory handles. |
| `tests/harness/m5-exploration/main.mjs` | `openDocument`, `importBackupFile`, `saveCurrentDocument`, `saveDocument`, `downloadBackup`, `chooseBackupFile`, `saveActiveMap` | Shared Open/candidate, destination-aware Save, encoding, close-before-adoption, fallback download. |
| `src/engine/hypertree/persistence/backup.js` | `encodeBackup`, `decodeBackup`, `safeDocumentFilename`, `BACKUP_MAGIC`, `BACKUP_VERSION`, `BACKUP_SCHEMA_VERSION`, limits | Existing `.map` container, integrity validation, attachment bytes, filename normalization. |
| `tests/harness/m5-exploration/index.html` | `data-action="open-document"`, `data-action="save-map"`, `data-action="save-document-as"`, `data-action="download"`, `#fit` | Existing action surfaces. |
| `tests/harness/m5-exploration/backup-resources.js` | `createDownloadResourceManager` | Idempotent download cleanup; retain. |

`saveDocument` already captures a revision, validates its exact save owner, encodes, writes, awaits close, and only then adopts `activeDocument`. Orbit must call this same path with a directory-derived file handle, not duplicate encoding or adoption.

### Writable handles, permissions, fallback

`document-adapter.js` establishes the current contract:

- `writableSupported()` requires both `showOpenFilePicker` and `showSaveFilePicker`.
- `pickOpen`/`pickSave` call the picker and then query/request permission for the required mode.
- `write` awaits `createWritable`, `write`, and `close`; errors abort/close defensively.
- `download` is explicitly a handoff, not a confirmed save.
- Cancellation and permission denial are typed failures.

Orbit needs a separate directory capability adapter. It should not make `document-adapter.js` pretend a directory is a file or weaken the existing fallback contract.

### Document identity and dirty baseline

| Actual path | Symbols | Current meaning |
|---|---|---|
| `tests/harness/m5-exploration/main.mjs` | `activeDocument`, `resetActiveDocument`, `mapDirty`, `dataRevision`, `activeMap.savedRevision`, `saveDocument` | `activeDocument` is `{ active, name, handle, mode, savedRevision, origin }`; `mapDirty()` compares the current revision to the captured saved revision. |
| `tests/harness/m5-exploration/main.mjs` | `activeDocument.origin` | Existing origins include file/recovery; Orbit may add an explicit origin without changing the dirty rule. |

The Orbit contract must distinguish:

- **active Orbit** — selected directory capability and list;
- **active document** — the file handle/name/saved revision;
- **editing session** — `dataRevision`, tree/model, attachment registry, history, editor controller, persistence session.

These are separate. Switching an Orbit must not mutate a document or editor merely because a directory picker was opened.

### Editor operations and Retry

| Actual path | Symbols | Orbit relevance |
|---|---|---|
| `tests/harness/m5-exploration/editor-panel.js` | `createEditorPanel`, `submit`, `retryAppliedPersistence`, `requestCancel`, `openAction` | Atomic form apply, pending attachment reservation, applied-operation ownership, Retry/Close. |
| `tests/harness/m5-exploration/main.mjs` | `createEditor`, `saveEditorAction`, `appliedOperationOwner`, `appliedOperationOwns`, `retryAppliedEditorPersistence`, `editorAppliedOperation` | Applies edit, schedules recovery, invokes shared document Save, preserves applied edit when persistence fails. |

Orbit Save integration must not bypass applied-operation ownership. A form Save inside an Orbit uses the same destination-aware Save and the same Retry behavior.

### Lifecycle invalidation and stale-completion guards

| Actual path | Symbols | Orbit relevance |
|---|---|---|
| `tests/harness/m5-exploration/main.mjs` | `documentOperation`, `documentSaveOwner`, `documentSaveInFlight`, `invalidateDocumentSave`, `owns` inside `saveDocument` | Save completion must still own the exact operation/session/dataset and must not publish into a replacement. |
| `tests/harness/m5-exploration/main.mjs` | `creationOwner`, `creationOwnerCurrent`, `committedOwner`, `committedMatches`, `staleCreation` in `installCreatedMap` | Template for any directory-picker or post-install await. Orbit directory selection needs the same immutable-owner pattern. |
| `tests/harness/m5-exploration/main.mjs` | `destroy`, `pagehide`, `replacementGuard`, `conflictGuard`, `backupOwnerActive`, recovery request identity functions | Destroy/picker/replacement cancel must invalidate pending Orbit enumeration and create operations. |
| `src/engine/hypertree/exploration/reparent-action.js` | `installCandidateEnvironment` | Candidate install must remain shared; Orbit additions must not introduce a second candidate commit path. |

The r104/r105 lifecycle work is the baseline pattern: capture an immutable owner before an async picker/await, revalidate it after the await, and never substitute current globals into an obsolete request.

### Recovery

| Actual path | Symbols | Orbit relevance |
|---|---|---|
| `src/engine/hypertree/persistence/recovery-scheduler.js` | `createRecoveryScheduler`, `beginWorkspace`, `checkpointNow`, `beginDocumentSave`, `retireDocumentSave`, `abandonDocumentSave`, `invalidate`, `flush` | Separate recovery facility; Orbit must not become its storage or make recovery depend on an Orbit. |
| `tests/harness/m5-exploration/main.mjs` | `scheduleRecoveryCheckpoint`, `establishRecoveryWorkspace`, `startRecoveryDiscovery`, `requestIsActive`, `preInstallOwned`, `postInstallOwned`, `recoverRecoveryCandidate`, `discardRecoveryCandidate` | Startup discovery, claim/install/adopt, source preservation, destruction/cancellation. |
| `src/engine/hypertree/persistence/recovery-repository.js` | `createRecoveryRepository` | Workspace/checkpoint/claim/tombstone storage; unchanged. |
| `src/engine/hypertree/persistence/recovery-schema.js` | `validateRecoveryWorkspace`, `validateRecoveryCheckpoint`, `validateRecoveryAttachmentRef`, `validateRecoveryAttachmentRecord` | Recovery validation; unchanged. |

Recovery remains unsaved, handle-free work. Saving recovered work into an Orbit must be an explicit destination choice through the normal save path. Recovery discovery must not require an active Orbit.

### Attachment encoding, materialization, and viewer ownership

| Actual path | Symbols | Orbit relevance |
|---|---|---|
| `src/engine/hypertree/persistence/backup.js` | `encodeBackup`, `decodeBackup` | Existing manifest, attachment ranges, SHA-256 verification, limits. Decode materializes detached `Blob`s rather than slices of the opened file. |
| `src/engine/hypertree/editor/attachments.js` | `createAttachmentRegistry`, `stage`, `commit`, `retain`, `releaseRetention`, `clear`; `sweepAttachmentOwnership` | Pending/applied attachment ownership. |
| `src/engine/hypertree/persistence/runtime.js` | `createRestoredAttachmentRegistry`, `reconstructSavedMapRuntime`, `loadSavedMapRuntime` | Restores saved maps with fresh attachment IDs. |
| `src/engine/hypertree/editor/attachment-viewer.js` | `createAttachmentViewer` | Viewer ownership and PDF/YAML rendering. |
| `tests/harness/m5-exploration/main.mjs` | `openAttachmentViewer`, `sweepAttachments` | Viewer/lifecycle wiring. |

Orbit must not decode every map to populate its list. Only an explicit Open validates content and materializes attachment bytes.

### Navigation, Settings, Details/editor, Search

| Actual path | Symbols/IDs | Orbit relevance |
|---|---|---|
| `tests/harness/m5-exploration/index.html` | `#app-header`, `#brand`, `#nav-rail`, `#nav-rail-toggle`, `#settings-panel`, `#document-name`, `#save-state`, `#open-map`, `#fit`, `#storage-help`, `#graph-action-toolbar`, `#search-panel`, `#details-panel`, `#details-content`, `#editor-host`, `#search-results-host` | Header remains brand-only; Orbit list belongs in the left rail, not the header; graph Search stays separate. |
| `tests/harness/m5-exploration/main.mjs` | `setRailExpanded`, `setSettingsOpen`, `syncPersistenceControls`, `syncDetailsToggleState`, `editorLifecycleActive`, `createSearchResultsView` | Existing layout/state behavior to preserve. |
| `tests/harness/m5-exploration/editor-panel.js` | `createEditorPanel` | Form focus/draft/IME ownership. |
| `tests/harness/m5-exploration/search-results.js`, `src/engine/hypertree/exploration/search.js` | `createSearchResultsView`, graph search model | Do not reuse for Orbit list search. |

### Legacy Previous local maps and derived formats

| Actual path | Symbols | Orbit relevance |
|---|---|---|
| `tests/harness/m5-exploration/saved-maps-dialog.js` | `createSavedMapsDialog` | IndexedDB library UI; keep distinct from Orbit. |
| `tests/harness/m5-exploration/main.mjs` | `refreshSavedMaps`, `showSavedMapsLibrary`, `requestOpenSavedMaps`, `openSavedMap` | Existing Previous local maps flow; no deletion/migration. |
| `src/engine/hypertree/persistence/repository.js` | `save`, `load`, `list`, `remove`, `usage`, `combinedUsage`, recovery method bindings | Legacy/recovery IndexedDB store; not the Orbit authoritative store. |
| `src/engine/hypertree/persistence/schema.js` | `DB_NAME`, `DB_VERSION`, stores, `APPLICATION_LIBRARY_HARD_CAP_BYTES`, recovery stores | Keep the existing recovery/capacity schema unchanged. |

## 3. Orbit contract

### 3.1 Terms

- **Orbit** — a user-selected filesystem directory, authorized for read/write, used to organize top-level `.map` documents. An Orbit is not an IndexedDB library and not a source-folder import.
- **Active Orbit** — the current directory handle, display name, permission state, and enumerated map list. One active Orbit at a time in the first release.
- **Active document** — the open `.map` and its writable handle, filename, saved revision, and dirty state.
- **Editing session** — tree/model, attachment registry, history, editor state, dataset token, persistence session, and recovery workspace.
- **Orbit entry** — one top-level `.map` file discovered by enumeration. An entry is metadata until opened; opening validates content.

### 3.2 Identity

- **Orbit identity** is the authorized directory handle plus an in-memory `orbitSessionId`. The display name is a label, not identity. An external folder rename may change the label; the handle remains the same while active.
- **Map identity** is the file handle (compared with `FileSystemHandle.isSameEntry` where available), not the filename. The active document’s filename is a display label.
- **No filename-derived identity:** current-map indication and Save ownership must never be based solely on a matching filename.
- **First-release persistence boundary:** `.map` has no stable document UUID today, and this plan does not add one. Across a page reload or a lost handle, a map’s identity is re-established by opening the file; there is no claim of persistent document identity independent of filename across sessions.
- **Optional future identity:** if persistent cross-session document identity is later required, add an optional manifest field (for example a document ID) with a compatibility/version review. It is not part of the first slice and does not require an Orbit metadata file.

### 3.3 Minimal on-disk contract

- An Orbit is an ordinary directory. There is **no manifest, index file, hidden directory, or Orbit database**.
- The directory contents are the map library. Only top-level files whose names end in `.map` (case-insensitive) are candidates.
- No initialization files or markers are written by Open Orbit.
- Create Orbit writes only the explicitly named child directory selected by the user.
- Map titles, tree structure, metadata, and attachments remain inside each `.map`; no duplicate `.map` metadata is stored in the Orbit.
- IndexedDB remains only for Previous local maps and recovery. It is not authoritative for Orbit contents.

Justification: a duplicate index would introduce reconciliation, stale-list, and deletion-consistency problems without adding a necessary capability. The filesystem already provides the authoritative set.

### 3.4 State model

```
orbitState = {
  sessionId,              // in-memory monotonic identity
  handle,                 // FileSystemDirectoryHandle
  name,                   // handle.name; display only
  permission,             // 'granted' | 'prompt' | 'denied' | 'unknown'
  phase,                  // 'closed' | 'opening' | 'listing' | 'ready' | 'blocked'
  entries: [],            // OrbitEntry[]
  enumerationToken,
  lastRefreshedAt,
  error                   // local, sanitized message
}

orbitEntry = {
  key,                    // handle-backed entry key, not filename identity
  name,                   // filename with .map for display
  stem,                   // display label without extension
  handle,                 // FileSystemFileHandle
  size,
  lastModified,
  validation              // 'unverified' | 'invalid' | 'opened'
}
```

`activeDocument` remains the existing document state. Add only `fileBaseline` (Section 7.3) and an origin/membership distinction if needed; do not move document ownership into `orbitState`. A writable Orbit document must not be marked overwrite-capable until its `fileBaseline` contract is established.

### 3.5 Slice 2 state controller contract

Implemented in `tests/harness/m5-exploration/orbit-state.js` as an isolated factory:

```
createOrbitStateController({ adapter, now })
  openDirectory()      // picker + permission + adoption + initial listing
  refresh()            // bounded metadata refresh for the active handle
  matchEntry(fileHandle) // exact/isSameEntry membership, no filename matching
  close()              // clear Orbit state; invalidate pending work
  destroy()            // idempotent cleanup; later results publish nothing
  snapshot()           // frozen/isolated state copy
```

`openDirectory()` captures its request token before invoking the adapter. The adapter invokes the directory picker synchronously; the current handle/entries remain visible while `phase` is `opening`. Cancellation or permission denial restores the settled phase and preserves the previous Orbit. Starting a newer directory-selection request invalidates the outgoing enumeration and membership list token while retaining the active handle and last committed entries. If the retained Orbit never completed its first listing, cancelling/denying the newer request leaves a non-stuck `blocked` state with an explicit `listing-incomplete` error and a usable Refresh retry; it does not resurrect the invalidated request.

Adoption occurs after picker and permission success, before initial enumeration. A subsequent initial-enumeration failure leaves the selected handle/name active but `phase = blocked`, entries empty, and a bounded error; it does not restore the previous Orbit. Refresh failures preserve the last successful list and mark it stale; permission failure moves to `blocked`.

`refresh()` starts a new list request and invalidates older refresh completions. It never decodes `.map` content or reads attachment bytes. Successful entries are sorted by lastModified descending, then deterministic case-insensitive filename order with an original-index tie-breaker. Empty success replaces the list; truncation metadata is retained honestly.

Public success/failure results expose only cloned/frozen metadata (`entries`, `truncation`, `state`, matched entry). Browser handle objects retain their native identity and are never deep-cloned or frozen. Internal truncation/error/entry objects are never returned directly, including from `openDirectory()`/`refresh()`, not only `snapshot()`.

`matchEntry()` uses exact handle identity or `entry.handle.isSameEntry(fileHandle)` only. Filenames never establish membership. Comparisons capture the current Orbit session and list request; a change rejects the result as stale. Comparison errors return failure without changing or discarding the list.

`close()` clears only Orbit state and invalidates picker, enumeration, and membership work; `destroy()` adds idempotent permanent cleanup. Neither touches documents, files, IndexedDB, or recovery. Native calls already in progress may finish externally and are ignored.

## 4. Directory capability adapter

Proposed new pure/browser adapter: `tests/harness/m5-exploration/orbit-directory-adapter.js`.

Proposed pure name policy: `src/engine/hypertree/orbit/names.js` (or an equivalent small source module), with tests. Reuse `safeDocumentFilename` from `backup.js` for `.map` filenames where it preserves the existing contract; do not fork the container format.

### 4.1 Capability

```
supported = typeof window.showDirectoryPicker === 'function'
```

Orbit is available only when directory selection is exposed. File-only writable support is not enough for an Orbit.

### 4.2 Operations

```
createOrbitDirectoryAdapter({ window, BrowserURL? })
  supported
  pickDirectory({ mode: 'readwrite' })
  createChildDirectory(parent, name)
  queryWritePermission(handle)
  requestWritePermission(handle)
  enumerateTopLevelMaps(handle, { token, isCurrent, maxEntries })
  getFileMetadata(entry)
  createMapFile(handle, filename)       // no known overwrite
  readFile(entry)
  writeFile(fileHandle, blob)           // createWritable/write/close
  fileStamp(handle)                     // actual size/lastModified; SHA-256 when write-proven
```

### 4.3 Permission lifecycle

- Call `showDirectoryPicker({ mode: 'readwrite' })` only from a user-activated click.
- After selection, `queryPermission({ mode: 'readwrite' })`; if not granted, call `requestPermission({ mode: 'readwrite' })` in the same user-action path.
- Permission denial leaves the current Orbit/document/session unchanged and shows a local error.
- Do not request permission on page load. A restored/remembered handle is not part of the first release.
- If permission is revoked while active, operations fail explicitly, the Orbit is marked blocked/stale, the active document remains live, and Refresh/Reconnect requires a user gesture.
- Directory picker cancellation is a no-op, not an Orbit close.

### 4.4 Enumeration

- Iterate `directoryHandle.values()` once per refresh.
- Include only `kind === 'file'` and names matching `/\.map$/i`.
- Ignore subdirectories entirely (top-level only).
- Obtain metadata with `getFile()`/`File.size`/`File.lastModified`; do **not** read `arrayBuffer`, decode the manifest, or load attachments.
- Bound work: stop at a defined maximum (proposal: 1000 matching entries or 5 seconds, whichever first).
- Once the result limit is filled, perform only bounded lookahead: stop immediately on the next matching `.map`; stop after the bounded unrelated-entry lookahead/time budget and report truncation rather than scanning the whole directory. An exactly-full directory ends naturally and is not falsely marked truncated.
- Report truncation explicitly, including whether it was established by a matching lookahead, a lookahead/time bound, or elapsed time. Never claim a complete list after truncation.
- Close the directory iterator on early termination where `return()` is supported. Time checks are cooperative and cannot cancel an already-pending native iterator/getFile call.
- Sort by `lastModified` descending, then case-insensitive name for stability.
- Ignore results after the Orbit session/token changes or after destroy.
- A `.map` file with invalid content is still listed until opened; opening reports `bad-magic`/validation failure and does not delete or rename it.
- Unrelated non-`.map` files are not listed. `.fileorbit` remains standalone Open File, not an Orbit entry.
- Case-insensitive create preflight scans incrementally without accumulating all names; it is bounded (proposal: 1000 entries/500 ms plus one completion lookahead), checks caller ownership, and fails `preflight-incomplete` if it cannot finish. An incomplete/stale preflight performs no `create:true` operation and is never interpreted as name availability.

## 5. User flows

### 5.1 First launch without an Orbit

Empty state and navigation offer:

- **Create Orbit**;
- **Open Orbit**;
- **Open File** (standalone).

No workspace creation is forced. Create Map is available but asks for a destination choice if no Orbit exists. The Orbit panel shows “No Orbit selected” with Create/Open actions.

### 5.2 Create Map inside an Orbit

Orbit creation is a first-write path. It is enabled only after Slice 3’s baseline/external-conflict protection exists; no Orbit creation UI ships before that prerequisite.

1. Active Orbit is ready, writable, and its file-baseline/conflict support is available.
2. Validate the title and prepare the title-only or populated candidate through `prepareCreateMapCandidate`.
3. Do all feasible non-writing preparation before creating a destination entry:
   - validate the map title and filename;
   - prepare the candidate tree and attachments;
   - encode the candidate snapshot with the existing encoder where reusable;
   - preflight collision by case-insensitive name among top-level entries and via `getFileHandle(name)` **without** `create`.
4. If a file already exists (including a zero-byte file): show an explicit collision dialog. Do not overwrite, truncate, or delete automatically. Offer Open Existing, choose another title, or an explicitly confirmed conflict path; no automatic suffix.
5. If preflight succeeds, install the candidate through the shared candidate installer and establish the recovery baseline according to the creation lifecycle. Installation happens before destination-entry creation so a candidate/install failure cannot leave an empty Orbit file.
6. Create the destination entry with `getFileHandle(name, { create: true })`.
7. If the handle now corresponds to a file that was created concurrently or is not the expected new entry, do not write. The newly installed map remains live and unsaved; show the collision/retry path. There is no atomic exclusive-create primitive.
8. Write the already prepared snapshot and await close through the shared write/close path.
9. Only after close succeeds adopt the Orbit file as `activeDocument`, mark the captured revision clean, obtain the post-save file baseline from the actual file, and refresh the list.
10. If installation committed but destination creation, write, or close fails: retain the live new map unsaved, do not adopt a destination, and expose Retry/Save As. Do not claim creation/save success or rollback.
11. A failed attempt may leave an empty or partial `<title>.map`. It is reported honestly; see 5.2.1.

The browser has no portable atomic exclusive-create or compare-and-write primitive. Preflight and zero-size checks are best-effort against races; if another writer creates or changes the file after the check, FileOrbit cannot guarantee non-overwrite. This limitation must be stated in UI/help and acceptance evidence. The app must never claim a filesystem transaction or rollback.

#### 5.2.1 Incomplete and empty files

`getFileHandle(name, { create: true })` can create an empty entry before the write succeeds. The first release deliberately does **not** automatically delete or overwrite such an entry.

- **Candidate preparation/installation failure before destination creation:** no destination entry is created because the plan installs before creating the file. If a failure occurs after installation but before creation, the live map remains unsaved and no new file is created.
- **Cancellation/destroy after destination creation but before write:** an empty `<title>.map` may remain. FileOrbit cannot prove ownership from zero size and cannot clean it up safely after destroy. The file is left in place and is visible as an invalid/empty map on Refresh.
- **Write/close failure:** the file may be empty, partial, or browser-dependent. Keep the live map unsaved, do not advance `savedRevision`, do not adopt the handle, and do not claim rollback. Show the filename and a retry/Save As path.
- **Retry after failure:** a normal retry encounters the existing entry as a collision. It does not bypass collision policy. The collision dialog may offer an explicitly confirmed “Retry into this unchanged empty file” only if the current file still has size 0 and its metadata is unchanged from the failed attempt; zero size is still **not proof of ownership**. If the file is non-empty or has changed, it becomes an ordinary conflict.
- **Existing zero-byte file not created by this attempt:** treat it as a collision like any other file. Never infer ownership, delete it, or overwrite it automatically. The user may choose another title, open it (which will fail validation if empty), or explicitly overwrite after a clear warning.
- **Automatic cleanup:** not enabled in the first release because no atomic ownership/concurrency guarantee is available. Cleanup may be added only with a proof that the exact entry is still app-owned and unchanged; until then, leave the file and explain it honestly.
- **User recovery choices:** choose another title/filename, retry into an explicitly confirmed empty file, save a copy elsewhere, or remove the empty file themselves in the OS. FileOrbit must not present any of these as automatic rollback.

### 5.3 Create Map without an Orbit

Use the existing candidate path, but present a destination choice:

- **Create Orbit**;
- **Open Orbit**;
- **Save standalone** (existing Save picker / `.map` fallback);
- **Cancel**.

This supersedes the earlier blanket rule that every Create Map must show a Save picker. The choice is explicit; Cancel preserves the draft and current Orbit/document. If writable file APIs are unavailable, standalone remains a download handoff and is not reported as a confirmed save.

### 5.4 Open a map from the Orbit list

1. User activates an entry.
2. Read the file and validate with `decodeBackup` (magic, version, schema, hashes, sizes, attachments) before installation. Compute the SHA-256 digest of the exact file bytes that are decoded.
3. Apply existing editor/dirty-document replacement decisions.
4. Install through `importBackupFile`/the shared candidate pipeline with the exact file handle and writable mode.
5. Restore exact attachment bytes and fresh attachment IDs.
6. Mark the opened revision clean only after installation; current Orbit entry becomes current using handle identity.
7. Bind the opened-bytes digest, initial observed metadata, open request token, file handle, committed document identity, and committed session/dataset to the active map.
8. After installation, read the actual file and verify it still matches the opened digest. A match establishes a `known` opened-content baseline; a mismatch marks `changed` and gates overwrite while the live map remains based on the opened bytes. A failed verification marks `observed`/unknown and gates overwrite.
9. A stale post-install verification result is discarded if the open request/handle/document/session was replaced; it cannot alter the replacement. Do not adopt a fresh post-install digest as the baseline for the older in-memory map.
10. On validation failure, leave the current document/session unchanged and mark the entry invalid for the session; do not delete it.
11. On cancellation or dirty-decision Cancel, leave current Orbit/document/session unchanged.

### 5.5 Open an external document and Add to Orbit

- Standalone Open File remains unchanged, including legacy `.fileorbit` read-only behavior.
- Once a document is open, **Add to Orbit** is available if an active writable Orbit exists.
- Add to Orbit creates a new file from the current encoded map snapshot:
  - source file/folder is never renamed, moved, or modified;
  - destination filename is explicit; collision is explicit and never silently overwritten;
  - the copy is written and closed before reporting success;
  - the copied document does **not** become the active document by default; the source active document/destination/dirty state remains unchanged;
  - refresh the Orbit list after confirmed success.
- If the source has unsaved edits, say “Copies the current map, including unsaved changes”; the original remains dirty. The copy is a separate document.
- No automatic Add to Orbit on open, no automatic source-folder synchronization, no linked external attachments.

### 5.6 Save As and Download

- Ordinary Save uses the established writable handle; no picker per edit.
- Save As uses the existing picker. The active destination changes only after confirmed write and close.
- If Save As chooses an existing file, this is an explicit user-selected overwrite path. The app must read the current destination metadata before writing, surface an explicit overwrite confirmation (in addition to any browser confirmation), and never silently replace a file. A new file has no prior baseline; collision/preflight still applies.
- If Save As chooses a location outside the active Orbit, the active Orbit remains unchanged and the document is labeled “Outside this Orbit.”
- If Save As chooses a top-level file in the active Orbit, refresh the list after success; current indication uses handle identity.
- After a successful Save As, establish the baseline from the actual destination file, using the same operation/document-bound post-save rules as ordinary Save. If that baseline read fails, the Save As remains successful but its baseline is unknown and the next overwrite is gated.
- Download (`downloadBackup`) produces a separate `.map` copy, does not change destination or clean state, and reports a handoff, not a confirmed save.
- The Orbit list is refreshed from actual directory contents; no optimistic row is inserted before confirmed filesystem state is observed.

### 5.7 Switch or close Orbit

- Opening a directory picker does not invalidate the current Orbit, document, editor, or draft.
- Picker cancellation leaves all state unchanged.
- Switching active Orbit is non-destructive to the active document and editing session; it does not close or rewrite the document. If an editor/draft is active, preserve it and focus.
- Opening a map from the new Orbit invokes the normal dirty-editor/dirty-document decision before any replacement.
- If a Save or pending editor operation is active, block the switch with a clear message rather than interleaving saves.
- Close Orbit clears only the active directory/list; the active document and its handle remain usable, labeled “Outside this Orbit.”
- Do not invalidate recovery or the document merely because a directory was selected.

### 5.8 Recovery

- Startup recovery remains independent of Orbit and uses the existing scheduler/repository.
- Recovered work is unsaved and has no inherited file handle.
- Saving recovered work into an Orbit is explicit: choose Orbit destination, choose/replace only through normal policy, then write/close and adopt.
- Recovery discovery must work with no Orbit open.
- No recovery data migration into Orbit; no Orbit index of recovery records.

## 6. Orbit map list UI

### 6.1 Placement

Add an **Orbit section** to the existing left navigation, after the primary actions (preserve the existing primary order: Create Map, Open File, Save, Save As, Settings).

Proposed markup IDs:

- `#orbit-section`
- `#orbit-action` (collapsed icon/tooltip; expands rail)
- `#orbit-name`
- `#orbit-list`
- `#orbit-refresh`
- `#orbit-create` (optional shortcut; existing Create Map remains)
- `#orbit-empty`
- `#orbit-status`

The header remains only `#brand`/FileOrbit. No Orbit name, status, or list in the header.

When the rail is collapsed, show an Orbit icon; its tooltip/aria label includes the active Orbit name or “No Orbit.” When expanded, show the name, Refresh, and list. On phone, the existing left overlay expansion applies; the Orbit list scrolls within the rail, with bounded width and no horizontal overflow.

### 6.2 Rows

- Filename stem as the compact label; full filename in title/tooltip.
- Modified time and size where available.
- Current-map marker when `entry.handle.isSameEntry(activeDocument.handle)`.
- Dirty marker on the current row when `mapDirty()`.
- Invalid-for-session marker after an open validation failure.
- Row activation opens the map; refresh is a separate explicit action.
- No Orbit-list search field in the first release. Graph Search remains for graph-node search only.

### 6.3 States

- No Orbit: Create Orbit / Open Orbit.
- Opening/listing: progress text in the Orbit panel; global shell status only for errors.
- Empty Orbit: “This Orbit has no .map documents.”
- Truncated list: explicit “Showing first N; refresh after narrowing the folder.”
- Permission blocked: stale list plus Reconnect; do not silently clear the list.
- Unrelated/invalid `.map`: listed; opening reports the validation error; never deleted.
- No filesystem watching: after external changes the user must Refresh.

## 7. Filesystem, permission, and concurrency rules

### 7.1 Name safety

- Directory name: NFKC normalize; reject empty, `.`/`..`, `/`, `\`, control characters, Windows reserved device names, trailing dot/space, and overlong names. Do not silently accept a path separator.
- Map filename: derive from title through `safeDocumentFilename`; normalize extension to lowercase `.map`; reject unsafe residue/reserved names; show the resulting filename before creation.
- Case handling: compare names case-insensitively for collision policy; on case-sensitive filesystems, conservatively treat case variants as collisions.
- No subdirectories, separators, or traversal in one Orbit map name.
- Title changes do not rename files automatically. The manifest title can differ from the filename; no implicit rename/move.

### 7.2 Permission rules

- Directory selection and `requestPermission` require user activation.
- Query first; request only when needed.
- Cancellation/denial never mutates active Orbit/document/session.
- Revoked permission blocks writes and Refresh, not the live document.
- No persisted directory handle in the first release; reauthorization is required after reload. Optional remembered handles are a later convenience, never authority.

### 7.3 File baseline and external-change protection

Every first enabled Orbit overwrite path requires a file baseline before it can write. This is a prerequisite for opening Orbit documents with writable handles, not a later hardening step.

```
fileBaseline = {
  state: 'known' | 'observed' | 'changed' | 'unknown',
  provenance: 'opened-content' | 'confirmed-write' | null,
  sha256,                     // digest of the authoritative opened/written bytes
  size,                       // observed file metadata associated with the digest
  lastModified,
  capturedAt,
  documentHandle,             // exact active document handle
  documentIdentity,
  savedRevision,
  openRequestToken,           // opened-content binding
  source: 'opened-bytes' | 'post-close-file'
}
```

There are two valid forms of write provenance:

1. **`opened-content`** — the digest of the exact file bytes successfully decoded and installed as the live map. This is valid without FileOrbit having previously written the document.
2. **`confirmed-write`** — the digest of the exact encoded bytes FileOrbit wrote, confirmed against an actual-file read after close.

`known` requires the digest and its provenance association to be verified. `observed` means only size/lastModified were obtained; it is not write provenance. `changed` means a post-install or post-close actual-file read differs from the authoritative opened/written bytes. `unknown` means no reliable baseline exists.

An arbitrary fresh `getFile()` observation is never itself proof that the live map represents those bytes. It may confirm a digest already associated with the exact open/save operation; it may not replace the authoritative digest.

#### 7.3.1 Establishing the baseline

**Opened-content baseline**

- Read the actual file before decode; compute the SHA-256 digest of the exact bytes that are decoded and installed as the active map.
- Bind that digest, the observed file size/lastModified, the exact opening request token, file handle, committed document identity, and committed session/dataset to the open operation.
- After installation, read the actual file again and compare its digest and metadata with the bound opened-content digest. Only a match establishes a `known` `opened-content` baseline.
- A post-install read that differs means the file changed between the initial read/decode and verification. Mark `changed`, show the external-change condition, and gate overwrite. Do **not** adopt the newer digest as the baseline for the older in-memory map; the live map remains based on the opened bytes.
- A post-install read failure yields `observed` or `unknown`; it does not make the live map reflect a newer file. The next overwrite requires explicit revalidation/conflict.
- A stale post-install read must be discarded if the open request, handle, document/session, or committed map has been replaced. It cannot alter a replacement document.
- Do not establish overwrite eligibility solely from a fresh `getFile()` read after installation. The fresh read is verification of the opened digest, not a new source of truth.
- An unchanged ordinary Open that verifies successfully yields a `known` `opened-content` baseline, so the first protected Save does not require an unnecessary conflict prompt.

**Confirmed-write baseline**

- On successful Save, after `createWritable`/`write`/`close` succeeds, read the **actual destination file** with `getFile()` and record its current size/lastModified.
- Compute a SHA-256 digest of the exact encoded bytes written and a SHA-256 digest of the actual file read after close. Only a match establishes a `known` `confirmed-write` baseline.
- The post-save read is bound to the exact save operation and document: `documentSaveOwner`/`documentOperation`, active handle, document identity, and the `savedRevision` that was just written. After the asynchronous read, verify that ownership and document identity are unchanged. A stale read must not overwrite a newer document’s baseline, change its status, or adopt a handle.
- If the actual-file digest differs from the written digest, the file changed between close and the read. Record `changed`/unknown and require revalidation before another overwrite. Do not claim the file equals the written snapshot.
- Do not use encoded metadata as the filesystem stamp. Encoded metadata can describe the snapshot, but only the actual file read supplies the filesystem baseline.

#### 7.3.2 Post-save baseline failure

- Write and close success is a completed write. A subsequent baseline-read failure must **not** be reported as a failed write, must not roll back `savedRevision`, and must not mark the document dirty.
- Mark `fileBaseline.state = 'unknown'` (or `observed` when only metadata was obtained) and report “Saved; file baseline unavailable/not write-proven. Revalidation is required before the next overwrite.”
- The next Save must not write silently. It must perform an explicit revalidation/conflict decision:
  - read the current file metadata/content;
  - show what FileOrbit can and cannot verify;
  - offer an explicitly confirmed overwrite, Save a Copy, or Cancel.
- A baseline-unknown or metadata-only document remains saved/usable; only overwrite permission is gated.

#### 7.3.3 Pre-write external-change detection

Before opening `createWritable` for an existing Orbit document:

- if `getFile()` fails NotFound: report moved/deleted; do not adopt; offer Save As/Create in Orbit.
- if baseline is `unknown`, `observed`, or `changed`: require explicit revalidation/conflict decision; never silent overwrite.
- if size/lastModified differ from a known baseline: show an explicit conflict dialog immediately:
  - Overwrite this file (explicit user choice);
  - Save a Copy;
  - Cancel.
- if size/lastModified match, read the actual file content and compare its SHA-256 with the known baseline hash before writing. If the digest differs or cannot be computed, show the same explicit conflict dialog; do not silently overwrite.
- size/lastModified alone never authorizes a silent overwrite. It is a fast precheck; the content comparison is the stronger gate for a `known` baseline.
- never silently overwrite an externally modified map.
- Revalidate the save operation/document ownership after the metadata/content read and immediately before the write. A newer Save/document must not use an old baseline or destination.

#### 7.3.4 Strength of comparison and remaining races

- **Size/lastModified** is the low-cost precheck. It can miss same-size edits, timestamp granularity, timestamp preservation, and some external writers. It is not complete conflict detection and cannot by itself prove that the file equals FileOrbit’s written snapshot.
- **SHA-256 of the actual file** compared with the authoritative digest for the applicable provenance (`opened-content` bytes or `confirmed-write` bytes) is required for a `known` Orbit overwrite baseline and is rechecked before overwrite. It provides content-level provenance at the read moment. It is stronger but still not atomic and can be expensive for large `.map` files.
- There is an unavoidable race between the initial Open read/decode and post-install verification, and between close, baseline reading, and an external modification. A file read after install may already be a different state from the bytes installed; a change after the read is not detected until the next revalidation. The live map remains based on the exact opened bytes; a newer observation is never allowed to redefine it silently.
- No atomic compare-and-write or filesystem transaction is claimed. A concurrent external write after the last check may still be overwritten; this is an honest limitation, not a successful conflict-detection result.

#### 7.3.5 Slice 3 primitive API

Implemented in `tests/harness/m5-exploration/orbit-file-baseline.js`:

- `createOpenedContentBaseline` / `verifyOpenedContentBaseline` — owned digest of exact decoded bytes; post-install verification refuses to adopt a newer digest; known/changed/observed/unknown transitions.
- `createConfirmedWriteBaseline` — hashes exact written bytes, reads actual destination after close, compares digest; actual file metadata only; read/hash failure returns verification failure with unknown/observed baseline.
- `bindBaseline` — binds digest to eventual committed handle/document/revision/session/operation without changing digest.
- `preflightOverwrite` — missing, conflict, scope/handle/identity/operation checks, metadata+digest checks, size limits before content reads, stale checks after awaits.
- `createOverwriteApproval` — requires a 64-hex content digest; approval bound to captured conflict observation/destination/operation; material changes make it stale. Missing/unverifiable digest returns explicit `unverifiable` with Save a Copy/Cancel only.
- A forged/empty-digest approval cannot authorize; a newly readable file produces a fresh conflict requiring a new decision.
- Every deferred read/hash rejection revalidates ownership; stale results contain no baseline, conflict, approval, or actionable failure.
- Conflict dialog supports `allowOverwrite:false` for unverifiable conflicts, leaving Save a Copy/Cancel.

Implemented in `tests/harness/m5-exploration/file-conflict-dialog.js`:

- decision-only `show()` returning `overwrite | copy | cancel`;
- accessible name/description, text-only basename, initial Cancel focus, Escape/Tab containment, focus restoration;
- one terminal result, duplicate-click safety, newer-request supersession, idempotent destroy;
- no writes, destination adoption, dirty-state change, or recovery action.

These primitives are not wired to `main.mjs`; writable Orbit paths remain disabled.

### 7.4 Concurrency tokens

- `orbitSessionId` / `orbitEnumerationToken`: stale enumeration results cannot populate a newer Orbit.
- `documentOperation` / `documentSaveOwner`: existing Save ownership remains authoritative.
- `creationOwner` / `committedOwner`: creation picker/install completion must match the exact operation.
- `fileBaseline` reads carry the exact save operation, document handle/identity, and saved revision; a stale baseline result is discarded and cannot clear a newer baseline or status.
- Orbit switch invalidates enumeration but must not cancel an already-started external write or claim it can be undone.
- List refresh and Save may overlap only as reads; refresh must never mark a document clean or adopt a handle.
- Destroy invalidates Orbit enumeration, picker completions, baseline reads, and creation completions; stale results publish nothing.

## 8. Compatibility and fallback

Preserve:

- `.map` magic `FILEORBIT`, version/schema, manifest, attachment ranges, hashes, size limits;
- legacy `.fileorbit` reading, with the deliberate no-overwrite/read-only policy;
- existing Previous local maps records and repository schema; no deletion or migration;
- existing recovery DB v2 data/capacity and retirement behavior;
- PDF/YAML viewers and detached attachment materialization;
- Undo/Redo, stable node IDs, editor ownership;
- brand-only header and graph toolbar.

Fallback environments:

- No directory-handle support: standalone Open File and Save download remain; Orbit actions are unavailable, with an explanation that a directory-style file input does not grant ongoing write access.
- Download handoff must not be presented as a confirmed Orbit save.
- Android/iPhone/other browsers need separate native verification; do not claim directory-style Orbit writing there.
- No automatic source-folder synchronization or linked-attachment conversion.

## 9. Defaults and resolved decisions

- **Top-level only** in the first release; no recursive folders.
- **No auto-rename or suffixing** on collision. Show an explicit error and let the user change the title/name or open the existing file.
- **Title vs filename:** title is document metadata; filename is container identity for navigation. No automatic filename rename when the title changes. Save As is the explicit way to choose another filename.
- **No Orbit metadata file/index/hidden directory/database.**
- **No persisted Orbit handle** in the first release. Active Orbit is session-scoped; reload requires Open Orbit again. This avoids implying permission survives.
- **No silent external overwrite.** Explicit conflict prompt, with Save a Copy/Cancel.
- **Active document outside active Orbit** remains fully editable/saveable; the Orbit list shows no current row and the UI labels it outside the Orbit.
- **Invalid `.map`** is listed but marked invalid on failed open; not deleted or renamed.
- **Empty folder** is a valid empty Orbit.
- **Add to Orbit copy does not become active** by default; the source document/destination remain.
- **No stable persistent map document ID** in the first release; identity is handle-backed while the handle is live. This is a stated limitation, not filename identity.

## 10. Bounded implementation slices

**Implemented scope:** **Slices 1–5** — directory adapter/name policy, Orbit state/stale enumeration, file-baseline/conflict foundation, left-rail Orbit navigation/list, protected writable listed-map Open/save, Create in Orbit / Create Orbit, and Add to Orbit. Native acceptance and rename/delete/recursion/watching/persisted handles/sync remain deferred.

**Hard dependency:** Slice 3 (file baseline and external-conflict foundation) is implemented but not integrated. Writable Orbit Open/Create/Save must remain disabled until Slice 4+ wiring consumes the reviewed primitives. Slices 1–2 are read-only; no first-release slice may silently overwrite an externally modified Orbit document.

### Slice 1 — Directory capability adapter and name policy (implemented, isolated)

Implemented files:

- `tests/harness/m5-exploration/orbit-directory-adapter.js`
- `src/engine/hypertree/orbit/names.js`
- `tests/engine/exploration/orbit-directory-adapter.test.mjs`
- `tests/engine/exploration/orbit-names.test.mjs`

Reuse: `safeDocumentFilename`/format constants from `backup.js`; no document-adapter rewrite.

Entry: tests/mocks exist for directory capability, permission modes, metadata enumeration, write/close, and names.

Exit: **implemented.** Adapter has deterministic success/cancel/denied/unsupported/operation-failure results; directory capability is independent of file pickers; picker invocation is synchronous within the caller action; enumeration is top-level `.map` metadata only, bounded, truncation-reporting, stale-safe, and closes early iterators; once the limit is filled it stops at the first excess match or bounded lookahead; name policy rejects traversal/separators/reserved names and handles case collisions conservatively; case-insensitive preflight is incremental, bounded, ownership-checked, and incomplete/stale scans perform no create; zero/empty files are never treated as owned; no UI enabled.

Tests: picker cancel/denial; permission query/request once; child creation collision; top-level filter; metadata only; 10,000-entry limit-1 stop with two yields/one metadata read; exactly-full non-truncation; mixed unrelated lookahead bounds; iterator return on early exit; incomplete/stale preflight with zero mutations; write/close failure; name traversal/reserved/case collision; stale token ignored.

Failure boundaries: no Orbit UI; no document/save changes; unsupported capability quietly reports unavailable.

Deferred: handle persistence, recursive folders, watcher, Add to Orbit.

### Slice 2 — Orbit state and stale-safe enumeration (implemented, isolated)

Implemented files:

- `tests/harness/m5-exploration/orbit-state.js`
- `tests/engine/exploration/orbit-state.test.mjs` (state and enumeration coverage; no separate `orbit-enumeration.test.mjs` was needed)

Reuse: real r110 directory adapter and name policy; no document/recovery coupling.

Entry/exit: **implemented.** State machine covers closed/opening/listing/ready/blocked; request/session identities; preview-safe opening; adoption after picker+permission; initial-enumeration failure as blocked; sorted metadata; truncation; empty list; permission revocation/retry; handle-based membership with stale/comparison-failure handling; close/destroy invalidation; frozen snapshots.

Tests: switch/cancel, A/B late success/failure, A initial-enumeration pending while B picker pending, B cancellation after interrupted/committed listings, membership stale before B, refresh switch stale, out-of-order refreshes, refresh failure retention, empty folder, unrelated files/subdirectories, truncated list, permission revocation/retry, close/destroy during picker/enumeration/membership, same-name different handles, equivalent handles, public-result/snapshot isolation, idempotent cleanup, initial-enumeration failure.

Failure boundaries: no document mutation, no candidate installation, no document bytes, no filesystem writes.

Deferred: navigation list markup, create/save, UI.

### Slice 3 — File baseline and external-conflict foundation (implemented, isolated)

Implemented as isolated primitives. No Orbit document is writable yet; integration is a later slice.

Implemented files:

- `tests/harness/m5-exploration/orbit-file-baseline.js`
- `tests/harness/m5-exploration/file-conflict-dialog.js`
- `tests/engine/exploration/orbit-file-baseline.test.mjs`
- `tests/engine/exploration/file-conflict-dialog.test.mjs`

Reuse: backup package limits and hash semantics; no duplicate encoder/writable adapter/candidate installer; no main.mjs hook was required.

Entry: adapter/state from Slices 1–2; no writable Orbit UI enabled.

Exit: **implemented.** `createOpenedContentBaseline`/`verifyOpenedContentBaseline`; `createConfirmedWriteBaseline`; `bindBaseline`; `preflightOverwrite`; `createOverwriteApproval`; decision-only conflict dialog. Opened-content digest binds to committed identity; post-install verification cannot replace it; confirmed-write actual-file read after close; baseline-unknown/observed/changed gating; scope-bound approval; stale-result rejection; actual size limits before reads; frozen metadata with native handle identity preserved.

Tests: null/missing-digest approval refusal; forged approval against same-size/same-time change; fresh readable observation; stale read/hash failures without actionable results; unverifiable dialog copy/cancel; opened-content baseline without a prior FileOrbit write; post-install read matches opened digest; file changed between initial read/decode and post-install verification; live map stays on opened bytes and later Save conflicts; unchanged Open allows protected Save without unnecessary first-save conflict; stale Open baseline completion cannot alter replacement; confirmed-write actual-file baseline; post-save read failure preserves savedRevision and marks baseline unknown/observed; stale baseline read cannot overwrite newer document; post-close changed detection; size/lastModified conflict; pre-write content-digest mismatch; same-size/same-mtime limitation; metadata-only baseline gating; conflict Overwrite/Save a Copy/Cancel; deleted file; no writable Orbit UI yet.

Failure boundaries: no Orbit create/Save enabled; no atomicity or rollback claim; no automatic cleanup.

Deferred: list UI, writable open, create.

### Slice 4 — Navigation/list UI and protected writable Open (implemented)

Implemented files:

- `tests/harness/m5-exploration/index.html` (Orbit section/CSS)
- `tests/harness/m5-exploration/orbit-panel.js` (new)
- `tests/harness/m5-exploration/main.mjs` (state wiring, open path)
- `tests/engine/exploration/orbit-panel.test.mjs` (new)
- `tests/engine/exploration/orbit-main.test.mjs` (new)

Reuse: `importBackupFile`/`decodeBackup`, `unsaved-map-prompt`, `setRailExpanded`, existing Details/editor behavior, Slice 3 baseline/conflict protection.

Entry: Slice 3 exit is complete and every writable Orbit Open is gated on baseline/conflict availability.

Exit: **implemented.** Active Orbit name/list visible in the left rail; Open Orbit, Refresh, Close, and selectable top-level `.map` entries; loading/empty/blocked/failed/stale/truncated states; current-entry marker; picker cancel/denial preserves the current Orbit and map; dirty map/editor decisions reuse the shared prompt; listed Open validates package content, preserves exact tree IDs/metadata/detached attachment bytes, and installs through `importBackupFile`/`decodeBackup`/`installCreatedMap`; opened-content baseline binds to the committed handle/document/session; toolbar Save, editor Save, Retry/Save-and-continue paths share `saveDocument` overwrite protection; conflict Overwrite/Save a Copy/Cancel; unverifiable conflicts disable overwrite; Save a Copy invokes its picker from the dialog button callback; post-close confirmed-write baseline reads the actual destination; baseline read failure preserves the successful save and gates the next overwrite; protection survives Orbit close/switch.

Tests: `orbit-panel.test.mjs` and actual-main `orbit-main.test.mjs` cover list/open exact IDs/attachment bytes, empty/failed/cancel/deny/dirty-replacement Cancel, current marker, unchanged protected Save, external conflict decision, Save a Copy activation, unverifiable overwrite prevention, editor Save conflict, post-close baseline failure, and protection after Orbit close. Late state/request results remain covered by Slice 2/3 suites.

Failure boundaries: no create/Save-to-Orbit; external Open remains unchanged; no writable Orbit document may bypass baseline/conflict.

Deferred: Orbit Create Map, Create Orbit, Add to Orbit, rename/delete, recursion, watching, persistent handles, synchronization, native acceptance.

### Slice 5 — Create/Save/Add-to-Orbit and lifecycle integration (implemented)

Implemented files:

- `tests/harness/m5-exploration/main.mjs`
- `tests/harness/m5-exploration/orbit-create-choice.js` (new)
- `tests/harness/m5-exploration/orbit-state.js` (`adoptDirectory` for Create Orbit)
- `tests/harness/m5-exploration/orbit-panel.js` (Add to Orbit action)
- `tests/engine/exploration/orbit-create-add-main.test.mjs` (new)
- `tests/engine/exploration/orbit-create-choice-main.test.mjs` (new)
- `tests/engine/exploration/orbit-create-choice.test.mjs` (new)

Reuse: `prepareCreateMapCandidate`, `installCreatedMap`, `saveDocument` target, `encodeBackup`, `appliedOperationOwner`/Retry, Slice 3 baseline/conflict.

Entry: Slice 3 protection and Slice 4 protected open are complete.

Exit: **implemented.** Title-only/populated create writes `<title>.map` inside active Orbit with one write and no per-map picker; collision/case/equivalent/zero-byte destinations block without overwrite; encoded snapshot is prepared before entry creation and candidate installation precedes entry creation; confirmed close adopts the destination and actual-file baseline; failure retains installed work unsaved/recoverable; no-Orbit Create offers Create Orbit/Open Orbit/Save standalone/Cancel; Add to Orbit copies authoritative tree and exact attachment bytes without adopting the copy or changing the source document/recovery; incomplete scans and lifecycle invalidation stop creation/copy writes.

Tests: no picker per map; title-only/populated PDF attachment exact bytes and reopen; case/zero-byte collision; choice buttons and picker cancel/denial; Create Orbit parent selection and adoption; Add source handle/tree/baseline/dirty/savedRevision/history/recovery unchanged and copy collision; current-list refresh/membership; protected Save for created maps; incomplete scan behavior through adapter; r117 ownership/Save a Copy regressions. Write/close failure and forced mid-write lifecycle invalidation remain automated boundary scenarios rather than native proof.

Failure boundaries: no auto-rename/overwrite; no Orbit if permission unavailable; no claim of atomic creation; no automatic cleanup; a created-but-unconfirmed file may remain empty/partial after cancellation/write failure.

Deferred: rename/delete, recursion, watching, persisted handles, manifests/indexes, sync, multi-Orbit, native acceptance.

### Slice 6 — Native acceptance and documentation

Anticipated files:

- `docs/engine/FILEORBIT-ORBIT-IMPLEMENTATION-PLAN.md` (this document)
- `docs/engine/FILEORBIT-ORBIT-NATIVE-CHECKLIST.md` (new, Korean)
- `docs/engine/FILEORBIT-ORBIT-USAGE.md` (new, Korean)
- `docs/engine/FILEORBIT-ORBIT-NATIVE-ACCEPTANCE-r121.md` (new)
- `README.md`/existing file-document planning link
- `evidence/native-r121/...`

Entry: checked disk/server source against the r120 archive; prepared disposable native fixtures; attempted desktop Chromium. Exit: **PARTIAL** — source/server and browser layout verified; native picker/filesystem scenarios BLOCKED because only a headless Edge target was available. Android/iPhone/Firefox/Safari NOT RUN. No unverified platform claim.

Tests attempted: native directory picker/create/open/save/reopen; external-change and post-save baseline behavior; permission revoke; incomplete/empty destination exposure; narrow/fullscreen; fallback. Executed: source/server hash match, fresh-context browser initialization, desktop/narrow screenshots, rail/Details/theme, choice buttons. Native filesystem tests: BLOCKED.

Deferred: sync/recursive/multi-Orbit.

## 11. Acceptance matrix

Controlled Node/mock and native evidence must be separate.

### Automatic persistence and Settings simplification — r125

- Successful authoritative reparent/Undo/Redo request persistence through the existing shared save path. Camera pan, selection/navigation, zoom/resize, rejected/self/no-op drops, and failed history replay do not.
- Editor form Save keeps its apply-and-save path; unsubmitted drafts are not persisted.
- One document-save queue serializes manual and automatic work; automatic requests coalesce to the latest revision, and later changes stay dirty until their own confirmed close.
- Requests capture ownership/session/dataset/revision/handle/identity. Queued requests do not move to a replacement session or destination; Save a Copy retains its own confirmed baseline.
- Failure/conflict/missing destination stops automatic retry and exposes fixed feedback with bound Retry/Save As; automatic save never opens a picker or conflict dialog. Conflict Cancel does not loop.
- Settings now contains only Theme; Save changes, Previous local maps, Fit, and Storage help are removed from the visible panel. Document/save feedback is in the fixed feedback area; Fit internals, diagnostics, recovery, legacy records, primary Save As, and integrated Open remain.
- Focused mutation/history/Save/editor/recovery/Orbit suites passed 139/139; full `tests/engine` passed 1087 tests (1086 passed, 1 skipped, 0 failed).
- Details: [FILEORBIT-AUTOSAVE-r125.md](FILEORBIT-AUTOSAVE-r125.md).

### Automatic persistence corrections — r126

- R1: retained temporary-blocked automatic requests instead of discarding them; editor Cancel/Close and guard release resume through lifecycle hooks; request revision is rebound before start; cancelled drafts are never included; explicit editor Save remains serialized.
- R2: Retry/Save As keep failure feedback until success; conflict Cancel preserves blocked state and usable bound actions; later mutations cannot clear it or loop; replacement invalidates old feedback.
- R1/R2 actual-main markers and bounded watchdogs added. Focused regression 106/106; full engine 1087 (1086 passed, 1 skipped, 0 failed).
- Details: [FILEORBIT-AUTOSAVE-r126.md](FILEORBIT-AUTOSAVE-r126.md).

### Integrated Open lifecycle correction — r127

- Reproduced the reviewer's exact-r126 archive failure under load at the immediate reopen assertion.
- Cause: standalone install still had installingBackupImport true after the handle was set; the test had waited for pending import and persistence busy, but not install completion. Open correctly refused another operation.
- Test now waits for Opened status, pending/installing clear, openRequestBlockedReason null, and control availability; reopened dialog waits for Refresh readiness. No production Open changes.
- Obsolete “keeps Settings Save changes” test wording replaced with theme-only.
- Final exact files: failing suite alone 2/2, Open stress 72/72, relevant combined 106/106, full engine 1087 (1086 passed, 1 skipped, 0 failed).
- Details: [FILEORBIT-OPEN-SETTLE-r127.md](FILEORBIT-OPEN-SETTLE-r127.md).

### Connected Orbit menu — r128

- Header exit/Close FileOrbit requirement cancelled; no exit dialog, window.close, or controller.
- Connected Orbit menu between Save As and Settings, folder icon plus directory name, accessible collapsed/expanded toggle, saved-map list, current marker, Refresh/Close/Add.
- No Orbit means no menu or inert icon; integrated Open and sidebar share state.
- Editor draft/focus/selection, automatic save, Open, theme-only Settings, and destination protection preserved.
- Focused regression 141/141; full engine 1089 tests (1088 passed, 1 skipped, 0 failed).
- Details: [FILEORBIT-ORBIT-MENU-r128.md](FILEORBIT-ORBIT-MENU-r128.md).

### Create Map simplification and sidebar tooltips — r129

- Create Map opens directly with title/files/Save location; destination-choice and application-managed Create Orbit UI are cancelled.
- Existing folder is selected through native picker, becomes current-session Orbit, and is reused without repeated choosing. Standalone Save elsewhere remains.
- No folder creation by FileOrbit; no OSON/API wording in UI.
- Sidebar custom/native tooltips suppressed when expanded and restored when collapsed; graph toolbar unaffected.
- Approved variation 06 logo asset was not found; accessible text retained temporarily, no substitute.
- Focused 166/166; full engine 1090 tests (1089 passed, 1 skipped, 0 failed).
- Details: [FILEORBIT-UI-REFINEMENTS-r129.md](FILEORBIT-UI-REFINEMENTS-r129.md).

### Save-location wording correction — r130

- Create Map labels now say Choose save location / Change save location.
- Added plain-language explanation that map files may not appear in the native folder selection window.
- Added exact success/cancellation feedback while preserving draft and previous destination.
- Existing maps remain through connected Orbit and Open File; no enumeration/filter/Save/lifecycle behavior changed.
- Focused 24/24; no full rerun because wording-only.
- Details: [FILEORBIT-LOCATION-WORDING-r130.md](FILEORBIT-LOCATION-WORDING-r130.md).

### Copy Map and sidebar simplification — r131

- Graph toolbar adds Copy Map between Fullscreen and Download; sidebar Add to Orbit/Copy map here is removed.
- Copy Map picks an authorized folder without changing the connected Orbit, copies committed tree/bytes, rejects collisions, and never adopts the copy.
- Copy work is bound to document/session/dataset/operation; stale completion publishes nothing.
- Connected sidebar folder toggles its map list; Refresh list remains; Close/Disconnect is removed.
- Focused 48/48; full engine 1093 tests (1092 passed, 1 skipped, 0 failed). See [FILEORBIT-COPY-MAP-r131.md](FILEORBIT-COPY-MAP-r131.md).

### Copy Map stale-encoding ownership — r132

- Encoding rejection now checks captured ownership before publishing feedback.
- Obsolete rejections return stale and leave replacement status/documents/resources untouched.
- Added actual-main deferred encoding regressions for session replacement, destroy, stale success, and current failure.
- Focused 74/74; full engine 1097 tests (1096 passed, 1 skipped, 0 failed).
- Details: [FILEORBIT-COPY-ENCODE-STALE-r132.md](FILEORBIT-COPY-ENCODE-STALE-r132.md).

### Sidebar icon and Orbit status refinements — r133

- Orbit status moved below the map list in DOM order with its live-region semantics retained.
- Exact supplied graph and connected-Orbit PNGs copied to local assets and used through relative theme-masked icons.
- Focused 26/26; full engine 1099 tests (1098 passed, 1 skipped, 0 failed).
- Details: [FILEORBIT-SIDEBAR-ICON-STATUS-r133.md](FILEORBIT-SIDEBAR-ICON-STATUS-r133.md).

### Open Orbit naming and icon — r134

- Sidebar Open File renamed Open Orbit with matching accessible name/title/tooltip and the exact supplied local masked icon.
- Integrated dialog heading is Open Orbit Folder with its existing aria-labelledby relationship.
- Details: [FILEORBIT-OPEN-ORBIT-r134.md](FILEORBIT-OPEN-ORBIT-r134.md).

### English application messages — r135

- Translated all remaining Korean drag/drop feedback and reparent action-result messages.
- Preserved internal error objects while user-facing messages are concise English.
- Details: [FILEORBIT-ENGLISH-MESSAGES-r135.md](FILEORBIT-ENGLISH-MESSAGES-r135.md).

### .orbit-only documents and Open Orbit help — r136

- .map/.fileorbit compatibility and legacy import routing removed; all document flows, filters, enumeration, normalization, copy/download, and help use .orbit.
- Old extensions are rejected before installation; content validation remains mandatory.
- Exact disposable FileOrbit test documents were deleted with provenance hashes; historical archives preserved.
- Expanded sidebar circular ? help added with the exact .orbit explanation.
- Focused 151/151; full engine 1102 tests (1101 passed, 1 skipped, 0 failed).
- r137 corrected the help layout to sibling Open Orbit + ? buttons in one row, coordinated pointer/focus/activation, outside dismissal, and Escape suppression.
- Details: [FILEORBIT-ORBIT-EXCLUSIVE-r136.md](FILEORBIT-ORBIT-EXCLUSIVE-r136.md).

### Approved variation 06 branding — r138

- Header uses the supplied variation 06 FO connected-orbit mark from a local asset; accessible name FileOrbit.
- Local 16/32/48/64 PNG favicons and ICO; page title FileOrbit.
- Header/workspace geometry retained; dark/light/narrow inspected.
- Focused branding/header/navigation: 36/36; full engine 1102 tests (1101 passed, 1 skipped, 0 failed).
- Details: [FILEORBIT-BRANDING-r138.md](FILEORBIT-BRANDING-r138.md).

### Feedback presentation — r139

- Permanent bottom-left document information removed; hidden diagnostics preserve internal state.
- Routine notifications use explicit structured kinds and expire after about 4 seconds with ownership-safe timers.
- Actionable failures/progress and Retry/Save As controls remain persistent.
- Focused 112/112; full engine 1103 tests (1102 passed, 1 skipped, 0 failed).
- Details: [FILEORBIT-FEEDBACK-r139.md](FILEORBIT-FEEDBACK-r139.md).

### Feedback corrections — r140

- Routine publication no longer uses unconditional force; owned progress scopes control completion.
- Toolbar Download preparation is progress; handoff is routine; failures remain persistent.
- Focused 91/91; P1B 69/69; full engine 1103 tests (1102 passed, 1 skipped, 0 failed).
- Details: [FILEORBIT-FEEDBACK-r140.md](FILEORBIT-FEEDBACK-r140.md).

### Startup and scope corrections — r141

- Restored production fullscreen glyph constants and main-entry glyph structure.
- Progress no longer erases actionable feedback; scope validation checks session/dataset and renews only legitimate installs.
- Focused 90/90; P1B 69/69; full engine 1103 tests (1102 passed, 1 skipped, 0 failed).
- Details: [FILEORBIT-FEEDBACK-r141.md](FILEORBIT-FEEDBACK-r141.md).

### Nonvisual routine feedback — r142

- Routine success/cancellation notices are clipped live-region text, not graph boxes.
- Actionable failures, progress, and Retry/Save As remain visible; no feedback-host hiding.
- Focused 90/90; P1B 69/69; full engine 1103 tests (1102 passed, 1 skipped, 0 failed).
- Details: [FILEORBIT-FEEDBACK-r142.md](FILEORBIT-FEEDBACK-r142.md).

### Routine-path corrections — r143

- Listed-map Open, integrated refresh, Copy cancellation, and ordinary cancellation paths publish nonvisual routine feedback.
- Pending decisions and baseline/conflict/recovery warnings remain visible.
- Details: [FILEORBIT-FEEDBACK-r143.md](FILEORBIT-FEEDBACK-r143.md).

### Search-result folder highlighting — r144

- Authoritative search folder ancestry is highlighted red with a dashed outline and nonvisual count announcement.
- Temporary presentation only; no metadata/persistence changes.
- Embed remains disabled and documented as hosting/sharing-deferred.
- Focused 46/46; full engine 1107 tests (1106 passed, 1 skipped, 0 failed).
- Details: [FILEORBIT-SEARCH-HIGHLIGHT-r144.md](FILEORBIT-SEARCH-HIGHLIGHT-r144.md).

### Search reset corrections — r145

- Clear search and dataset replacement fully clear highlight IDs/announcements and redraw normal colors.
- Failed replacement preserves surviving map search state; Closing still preserves active search.
- Embed remains deferred/disabled.
- Focused 115/115; full engine 1107 tests (1106 passed, 1 skipped, 0 failed).
- Details: [FILEORBIT-SEARCH-RESET-r145.md](FILEORBIT-SEARCH-RESET-r145.md).

### Search highlight color + local embed — r146

- Search highlighting uses shared #E74C3C; standalone semantics/lifecycle unchanged.
- Local read-only iframe viewer, versioned synthetic snapshot, and honest Embed dialog implemented.
- External hosting/sharing remains deferred; Embed copy code disabled.
- Details: [FILEORBIT-STAGE-A-B-r146.md](FILEORBIT-STAGE-A-B-r146.md).

### Embed review corrections — r147

- UTF-8 byte enforcement, handshake timer state, exact-origin validation, nonpersistent notice removal, and dialog keyboard containment.
- Corrected local-vs-production sandbox/origin guidance.
- Details: [FILEORBIT-REVIEW-r147.md](FILEORBIT-REVIEW-r147.md).

### Free-edition stability audit — r148

- r147 is the candidate baseline; automated, browser, platform, skip, and readiness findings are recorded.
- 1118 tests, 1117 passed, 1 skipped; actual mobile/native picker/persistence evidence remains unverified.
- Details: [FILEORBIT-FREE-EDITION-AUDIT-r148.md](FILEORBIT-FREE-EDITION-AUDIT-r148.md).

### Desktop data-safety audit — r149

- 300-node committed lifecycle, disk .orbit save/reopen, browser-restart recovery, and unavailable-preview feedback.
- Native IndexedDB concurrency/abort/reopen/restart verification.
- Native pickers and actual mobile remain NOT RUN.
- Details: [FILEORBIT-DESKTOP-DATA-SAFETY-r149.md](FILEORBIT-DESKTOP-DATA-SAFETY-r149.md).

### PDF preview correction — r150

- Replaced invalid 69-byte PDF with a validated 2-page PDF; independent parser and real in-app PDF rendering/page navigation.
- Historical r149 evidence preserved; PDF claim withdrawn there.
- Native desktop picker acceptance remains NOT RUN.
- Details: [FILEORBIT-DESKTOP-DATA-SAFETY-r150.md](FILEORBIT-DESKTOP-DATA-SAFETY-r150.md).

### Friendly encoding failure — r169

- Encoding failure uses retained-changes wording only when the map/edits remain.
- Technical stage/code/exception stay in diagnostics; duplicate automatic feedback suppressed.
- Insecure LAN origin lacks WebCrypto/File System Access; no integrity weakening.
- Details: [FILEORBIT-ENCODING-FAILURE-r169.md](FILEORBIT-ENCODING-FAILURE-r169.md).

### Touch tooltips and landscape Details — r168

- Native titles removed on touch; app tooltip auto-dismisses at 1.5s and hides on menu/outside/orientation.
- Phone landscape defaults Details collapsed; manual expansion persists.
- Details: [FILEORBIT-IPHONE-TOOLTIP-DETAILS-r168.md](FILEORBIT-IPHONE-TOOLTIP-DETAILS-r168.md).

### Narrow toolbar overflow — r167

- 44px toolbar targets stay on one row; narrow overflow uses More graph actions.
- Download remains visible at 375/390; all seven fit at 430+.
- Details: [FILEORBIT-NARROW-TOOLBAR-r167.md](FILEORBIT-NARROW-TOOLBAR-r167.md).

### Conflict wording and picker labels — r166

- Confirmed external change uses newer-version wording and Replace Saved File.
- Unverifiable state retains distinct wording with replacement disabled.
- Open/Save As filter description is Orbit files (*.orbit).
- Details: [FILEORBIT-WORDING-PICKER-LABELS-r166.md](FILEORBIT-WORDING-PICKER-LABELS-r166.md).

### Single-owner cancellation notice — r165

- Automatic-save recovery cancellation is owned by save-feedback, not shell.
- One unsaved message; Retry/Save As remain after text dismissal.
- Details: [FILEORBIT-DUPLICATE-NOTICE-FIX-r165.md](FILEORBIT-DUPLICATE-NOTICE-FIX-r165.md).

### Submenu typography and bottom notices — r164

- Submenu labels are 13px under a 14px Open Orbit parent with 36px targets.
- Transient bottom notices center on the map area and auto-dismiss after 3 seconds.
- Details: [FILEORBIT-NOTICE-TYPOGRAPHY-r164.md](FILEORBIT-NOTICE-TYPOGRAPHY-r164.md).

### Open Orbit submenu — r163

- Open Orbit exposes Orbit File and Orbit Folder in expanded and collapsed states.
- No picker runs until a submenu choice is selected.
- Details: [FILEORBIT-OPEN-SUBMENU-r163.md](FILEORBIT-OPEN-SUBMENU-r163.md).

### Approved opening workflow — r162

- Open Orbit uses the native file picker directly and preserves writable access.
- Connect Folder is a secondary menu action feeding the existing sidebar list.
- Details: [FILEORBIT-OPENING-WORKFLOW-r162.md](FILEORBIT-OPENING-WORKFLOW-r162.md).

### Repeated-cancellation feedback ownership — r161

- One feedback renderer owns initial and retry applied-save failures.
- Repeated conflict Cancel shows one message, no picker/writes, and keeps Retry/Save As/Close.
- Details: [FILEORBIT-CONFLICT-CANCEL-FIX-r161.md](FILEORBIT-CONFLICT-CANCEL-FIX-r161.md).

### Conflict modal and cancellation feedback — r160

- Conflict dialog is centered on the current map bounds and reflows with panel/window changes.
- Conflict Cancel is picker-free and writes nothing.
- One unsaved message is shown; editor exposes Retry Save and Save As.
- Details: [FILEORBIT-CONFLICT-CANCEL-FIX-r160.md](FILEORBIT-CONFLICT-CANCEL-FIX-r160.md).

### Viewport-edge glyph eligibility — r158

- Pre-budget eligibility uses projected glyph bounds, including partially visible edge nodes.
- Four-edge labels display; distant off-screen nodes remain excluded.
- Details: [FILEORBIT-VIEWPORT-EDGE-ELIGIBILITY-r158.md](FILEORBIT-VIEWPORT-EDGE-ELIGIBILITY-r158.md).

### Viewport-aware label eligibility — r157

- Viewport geometry filters label candidates before the 40-label budget.
- On-screen direct children are preferred; off-screen nodes are never measured or created.
- Diagnostics separate viewport-ineligible, budget-excluded, and placement-suppressed labels.
- Details: [FILEORBIT-VIEWPORT-LABEL-ELIGIBILITY-r157.md](FILEORBIT-VIEWPORT-LABEL-ELIGIBILITY-r157.md).

### Folder-context label priority — r156

- Visible direct children of the selected/inspected folder are prioritized before unrelated branches.
- Candidate budget remains 40; standalone and local embedded use the same helper.
- Details: [FILEORBIT-FOLDER-CONTEXT-LABELS-r156.md](FILEORBIT-FOLDER-CONTEXT-LABELS-r156.md).

### Selected leader opacity lifecycle — r155

- No leader for absent/suppressed/transparent selected labels.
- Leader opacity follows owner opacity during fades; metrics include opacity.
- Details: [FILEORBIT-SELECTED-LEADER-OPACITY-r155.md](FILEORBIT-SELECTED-LEADER-OPACITY-r155.md).

### Selected ordering and leader cleanup — r154

- Corrected orderCandidates call/signature mismatch; selected labels receive a slot at tight budgets.
- clearSelectedLeaders supports real DOM collections; one synchronized leader, stale lines removed.
- Details: [FILEORBIT-GRAPH-LABEL-FIXES-r154.md](FILEORBIT-GRAPH-LABEL-FIXES-r154.md).

### Graph-label defect corrections — r153

- Forward root/selection identity through transition completion; actual root metrics.
- Retained-anchor fallback respects root and collision policy.
- Selected-label fallback now checks occupied labels and node obstacles; displaced selected labels get a visible leader.
- Details: [FILEORBIT-GRAPH-LABEL-FIXES-r153.md](FILEORBIT-GRAPH-LABEL-FIXES-r153.md).

### Graph-label improvements — r152

- Removed leading graph-label icons; file labels retain trailing type badges.
- Added measured root protection, selected-label fallback, density priority, search-result priority, and standalone hover priority.
- Three 300-node fixtures verified in dark/light and desktop/narrow emulation; embedded sample consistent.
- Details: [FILEORBIT-GRAPH-LABELS-r152.md](FILEORBIT-GRAPH-LABELS-r152.md).

### Native desktop acceptance — r151

- Headed Chrome 156 on Windows; native 299-file selection produced an actual 300-node candidate preview.
- Native Save/Open/cancel/conflict/301/restart remain NOT RUN; concise user-assisted checklist.
- Android/iOS checklist remains NOT RUN.
- Details: [FILEORBIT-NATIVE-DESKTOP-ACCEPTANCE-r151.md](FILEORBIT-NATIVE-DESKTOP-ACCEPTANCE-r151.md).

### Open browser keyboard-focus correction — r124

The r123 focus trap previously used an explicit control array whose order differed from the DOM. With populated maps, Shift+Tab from the first control targeted the last map, Tab from Close could escape, and Tab from the last map skipped the footer. Controls are now derived in actual DOM order, hidden/disabled/disconnected controls are excluded, Tab/Shift+Tab cycle across that order, and list replacement preserves a usable focus target. Populated-list, empty-list, and unsupported-directory tests were added. Relevant browser/navigation/stale-ownership suites passed 19/19; full `tests/engine` passed 1083 tests (1082 passed, 1 skipped, 0 failed). Native keyboard checks remain NOT RUN. Details: [FILEORBIT-OPEN-BROWSER-FOCUS-r124.md](FILEORBIT-OPEN-BROWSER-FOCUS-r124.md).

### Integrated Open map browser — r123

The preliminary two-choice Open File dialog is replaced by one integrated map browser:

- current Orbit folder name and top-level `.map` list in the same dialog;
- Choose folder / Change folder, Refresh, Open file elsewhere…, Close;
- folder-only selection never replaces the live map;
- listed maps use the existing protected Orbit Open path;
- standalone `.map` and legacy `.fileorbit` remain available through Open file elsewhere;
- no auto-open of the first map;
- request/session/dataset ownership guards prevent stale folder/refresh results from updating a newer dialog, publishing replacement feedback, restoring stale focus, or opening an obsolete map;
- dirty decisions close the browser and use the existing prompt; no competing modals;
- focus containment, Escape, focus restoration, text-safe names, current-map indication, loading/error/empty/truncated states, and narrow/fullscreen containment.

Focused navigation/Orbit/editor/lifecycle suites passed 237/237; full `tests/engine` passed 1082 tests (1081 passed, 1 skipped, 0 failed). User-reported PC acceptance remains user-reported, not independent. Details: [FILEORBIT-OPEN-BROWSER-r123.md](FILEORBIT-OPEN-BROWSER-r123.md).

### Navigation refinement — r122

The user’s manual feedback was incorporated without adding features:

- Removed the visible left-rail Save action; shared persistence, conflict protection, editor Save, Retry/Close, Save As, and replacement Save-and-continue remain.
- Added Settings → Save changes with dirty/busy/error availability and a dirty/error indicator; dirty feedback remains in Settings and shell feedback.
- Unified the primary Open entry point as **Open File** with **Open Orbit / Open map file / Cancel**, each native picker invoked from its own user click.
- Removed the separate primary Open Orbit rail action and the Orbit-panel Open Orbit button. Active Orbit keeps its list/Refresh/Close/Add to Orbit; Change Orbit uses unified Open.
- Standalone Open does not connect/change Orbit; connecting Orbit does not replace the live document.
- Unsupported directory access keeps standalone Open and explains the limitation.
- r117–r120 ownership/lifecycle protections were reused.

Focused navigation/Orbit/editor/lifecycle suites passed 232/232; full `tests/engine` passed 1077 tests (1076 passed, 1 skipped, 0 failed). User-reported PC acceptance is recorded separately and is not independent verification. Details: [FILEORBIT-NAVIGATION-REFINEMENT-r122.md](FILEORBIT-NAVIGATION-REFINEMENT-r122.md).

**Slice 6 native acceptance (2026-10-31): PARTIAL / BLOCKED.** Source/server verification PASS: the served index/main hashes matched disk and the r120 archive; fresh-context browser initialization and desktop/narrow/choice/rail/Details/theme screenshots were captured. Native directory/file pickers and real filesystem writes were BLOCKED because only a headless Edge target was available. All native filesystem rows are BLOCKED, mobile/Firefox/Safari rows are NOT RUN, and no Slice 6 acceptance is claimed. Details: [FILEORBIT-ORBIT-NATIVE-ACCEPTANCE-r121.md](FILEORBIT-ORBIT-NATIVE-ACCEPTANCE-r121.md); [matrix](FILEORBIT-ORBIT-NATIVE-MATRIX-r121.md); Korean checklist: [FILEORBIT-ORBIT-NATIVE-CHECKLIST.md](FILEORBIT-ORBIT-NATIVE-CHECKLIST.md); usage: [FILEORBIT-ORBIT-USAGE.md](FILEORBIT-ORBIT-USAGE.md).

**Slice 1–5 implementation evidence:** focused new suites plus existing document-adapter and backup/filename compatibility suites passed 147/147 in the implementation run (129 new Orbit tests + 18 existing compatibility tests). Native filesystem checks remain NOT RUN. Orbit list/open/protected Save/Create-in-Orbit/Create-Orbit/Add-to-Orbit were exercised through actual main-entry controls with synthetic filesystem handles; this is automated evidence, not native File System Access acceptance. Full `tests/engine`: 1087 tests, 1086 passed, 1 skipped, 0 failed.

| Case | Expected | Evidence type |
|---|---|---|
| Create Orbit picker cancel | No Orbit change; current document/editor preserved | Node/mock |
| Create Orbit permission denial | No Orbit activation; error; old state preserved | Node/mock |
| Create Orbit existing child name | Explicit collision; no overwrite; no silent adoption | Node/mock |
| Open Orbit cancel/denial | Current Orbit/document unchanged | Node/mock |
| Orbit navigation/list | Name, Refresh/Close, selectable top-level .map entries, current marker, loading/empty/blocked/failed/stale/truncated states, keyboard/focus; Change Orbit via unified Open | Node/mock |
| Integrated Open map browser | Folder + list in one dialog; Choose/Change/Refresh/Open elsewhere/Close; protected listed-map Open; no auto-open | Node/mock + browser layout |
| Automatic persistence | Reparent/Undo/Redo success only; queue/coalesce; temporary editor guard resume; failure Retry/Save As; conflict Cancel retention; replacement invalidation | Node/mock |
| Theme-only Settings | Only Theme; feedback moved outside; legacy/Fit/Open internals preserved | Node/mock + browser layout |
| Listed Orbit Open | Content-validated decode, exact tree IDs/metadata/detached attachment bytes, shared install pipeline | Node/mock |
| Orbit dirty replacement | Map/editor prompt; Cancel preserves outgoing map/draft; listed open does not clear current map | Node/mock |
| Protected Orbit Save | Preflight before encode and again before write; unchanged content proceeds; external change decision | Node/mock |
| Orbit Save a Copy | Picker invoked from conflict-dialog click callback; Cancel preserves destination/edits | Node/mock |
| Orbit post-close baseline | Actual destination digest; failure retains successful save/savedRevision and gates next overwrite | Node/mock |
| Orbit protection lifetime | Save protection survives Orbit close/switch and listed-map changes | Node/mock |
| Late listed Open ownership | Standalone Open/Create/destroy invalidate deferred Orbit Open; no late install/status/state change | Node/mock |
| Save a Copy identity | Original/same-entry/unprovable destinations rejected; zero original writes; distinct copy saves | Node/mock |
| Editor/Retry protection | Editor form Save and applied-operation Retry use the shared overwrite path | Node/mock |
| Open B while A initial listing pending | A enumeration/membership invalidated; active handle/last committed list retained; late A ignored | Node/mock |
| B cancelled after interrupted first listing | Non-stuck blocked/listing-incomplete; Refresh retries | Node/mock |
| B cancelled after committed refresh | Committed entries retained; ready/list token usable | Node/mock |
| Membership comparison before B | Stale; no fabricated match | Node/mock |
| Public result mutation | Entry/truncation/state metadata frozen/cloned; handles retain identity | Node/mock |
| Empty folder | Valid empty Orbit; empty state | Node/mock |
| Unrelated/invalid `.map` | Listed; open fails validation; no delete/rename | Node/mock |
| Title-only create in Orbit | One root, `<title>.map`, no per-map picker, one write, clean after close | Node/mock |
| Populated create in Orbit | Files/folders + exact PDF attachment bytes after reopen | Node/mock |
| Duplicate/case/zero-byte filename | Explicit collision; no overwrite; no suffix; existing zero-byte file untouched | Node/mock |
| Create Orbit/Open Orbit/standalone/Cancel | Explicit choice; picker cancel/denial preserves map; no silent directory adoption | Node/mock |
| Orbit create failure | Preparation failure leaves no entry; write failure leaves recoverable unsaved work; Retry rechecks leftover | Node/mock |
| Add to Orbit | Copies committed tree/exact attachments without adoption; source handle/tree/baseline/dirty/savedRevision/history/recovery unchanged | Node/mock |
| Created Orbit map Save | Created destination uses the same protected Save/baseline path | Node/mock |
| Orbit write lifecycle | Orbit switch/refresh/close/open controls blocked during active write; forced stale completion cannot write/adopt | Node/mock |
| Save ownership after await | Encoding/reservation invalidation and destroy start no download/write; preencoded owner gate | Node/mock |
| Create Orbit lifecycle | Deferred picker/directory completion cannot create/adopt after destroy or newer workflow; scheduled continuations guarded | Node/mock |
| Add to Orbit existing filename | Explicit collision; source untouched; no adoption | Node/mock |
| Save and reopen PDF/YAML | Exact bytes, viewer works | Node/mock + native |
| Save As to existing file | Explicit overwrite confirmation; adopt/clean only after close; actual-file baseline | Node/mock + native |
| Orbit native File System Access | Native picker/handle/save/external-change behavior | BLOCKED (headless only) |
| Refresh after external add/remove | Actual files only; no optimistic rows | Node/mock + native BLOCKED |
| Externally changed destination | Conflict prompt; no silent overwrite | Node/mock + native BLOCKED |
| Externally deleted destination | Clear missing error; Save As/recreate; no adoption | Node/mock |
| Dirty editor/map switch | Continue/Discard/Cancel; Cancel preserves | Node/mock |
| Deferred Save + Orbit switch/destroy | No stale adoption/status; old work preserved | Node/mock |
| Stale enumeration | Ignored after switch/destroy | Node/mock |
| Writable Orbit Open before protection | Not enabled; no writable handle adopted | Node/mock |
| Create/Save before protection | Not enabled; no Orbit write path available | Node/mock |
| Actual-file baseline after Save | Baseline read from destination file, bound to operation/document | Node/mock |
| Opened-content baseline | Digest of exact decoded/installed bytes; no prior FileOrbit write required | Node/mock |
| File changes before post-install verification | `changed`; live map remains opened bytes; overwrite gated | Node/mock |
| Later Save after changed Open | Pre-write digest detects conflict; no silent overwrite | Node/mock |
| Unchanged ordinary Open | `known` opened-content baseline; first protected Save has no unnecessary conflict | Node/mock |
| Stale Open baseline completion | Discarded; cannot alter replacement document/baseline | Node/mock |
| Confirmed-write baseline | Digest of written bytes matches actual file after close | Node/mock |
| Post-save baseline read failure | Save stays successful/clean; baseline unknown; next overwrite gated | Node/mock |
| Stale post-save baseline read | Discarded; cannot clear/overwrite newer baseline/status | Node/mock |
| Post-close external modification | Digest/metadata mismatch or baseline unknown; no equality claim | Node/mock |
| Metadata-only post-save baseline | `observed`, not write-proven; next overwrite requires explicit revalidation | Node/mock |
| Overwrite approval scope | Bound to exact handle/identity/operation/observation; other destination or material change rejected | Node/mock |
| Unverifiable approval | No digest => explicit unverifiable; no overwrite authorization; copy/cancel only | Node/mock |
| Fresh observation after unverifiable | Requires new conflict decision; no silent strengthening | Node/mock |
| Stale read/hash failure | Stale only; no baseline/conflict/approval/actionable failure | Node/mock |
| Conflict dialog | Accessible Overwrite/Save a Copy/Cancel; initial Cancel; Escape/Tab/focus; duplicate/stale/destroy safe | Node/mock |
| Baseline size limit | Actual destination size checked before content read/hash | Node/mock |
| Post-close read failure | Write success remains; baseline unknown/observed; no rollback claim | Node/mock |
| Size/lastModified-only limitation | Fast precheck can miss same-size/same-mtime changes; content digest required for overwrite | Node/mock |
| Candidate failure before destination | No empty Orbit file created | Node/mock |
| Cancel/destroy after create before write | Empty/partial file may remain; no automatic cleanup | Node/mock |
| Existing zero-byte file | Treated as collision, not owned; no auto delete/overwrite | Node/mock |
| Retry after empty/partial failure | Does not bypass collision; explicit confirmation only if unchanged empty | Node/mock |
| Automatic cleanup of incomplete file | Disabled absent ownership/concurrency proof; user-informed recovery | Node/mock |
| Failed write/close | Live map unsaved; no clean/adopt; retry | Node/mock |
| Recovery into Orbit | Explicit save; no inherited handle; recovery discovery independent | Node/mock |
| Fallback-only environment | Standalone Open/Download; Orbit unavailable; no confirmed save claim | Node/mock + native |
| Desktop narrow/fullscreen | Orbit list usable; no header/toolbar regression | Browser partial; native NOT RUN |
| PC Chromium | Native directory picker/write/reopen | BLOCKED (headless) |
| Firefox/Safari | Fallback behavior only; no Orbit claim | NOT RUN |
| Android Chrome | Fallback/unsupported verification | NOT RUN |
| iPhone Safari | Fallback/unsupported verification | NOT RUN |

## 12. Unresolved product decisions

Only one first-release identity decision remains genuinely open if the product requires more than session-scoped identity:

- **Persistent map document ID across reload/external filename changes.** The first release recommends handle-backed identity and no new `.map` document ID. If cross-session identity must survive without filename reliance, a later optional manifest document ID (with format compatibility review) is required. This plan does not invent it now.

Other items above are defaults, not unanswered questions: top-level only, no manifest/index, no persisted Orbit handle, no auto-suffix, no automatic rename, no recursive/watch/sync, and no source-folder migration.

## 13. Limitations

- No filesystem watching; Refresh is explicit.
- No atomic create-without-overwrite or compare-and-write guarantee; race windows are documented.
- No filesystem transaction/rollback claim.
- Size/lastModified baseline checks can miss same-size, same-timestamp, or externally preserved-timestamp changes; SHA-256 provides stronger write provenance but is still not atomic and not complete. A metadata-only baseline is not sufficient for a silent overwrite.
- SHA-256 provenance requires additional full-file reads before overwrite and after close; this is a deliberate cost for write safety on large `.map` files.
- A post-install Open verification can race with an external modification; a mismatch is detected as an external change, but a change after verification is not detected until Save revalidation. The live map remains based on the opened bytes.
- A post-save baseline read can race with an external modification; a file that differs at read time is not proof that FileOrbit’s snapshot was or was not written.
- If a write/close succeeds but baseline refresh fails, the write is still saved; baseline is unknown and the next overwrite is gated.
- Candidate preparation/installation failure is ordered before destination creation where feasible, but cancellation/destroy, destination creation, write, or close failure can leave an empty or partial `.map`; automatic cleanup is not enabled without ownership/concurrency proof.
- Orbit navigation and protected writable Open are connected; Create/Add/rename/delete/recursion/watching/persisted handles/sync remain unavailable. Native filesystem acceptance is NOT RUN.
- Orbit public results clone/freeze metadata (entries/truncation/state/matched entry); browser capability handles retain native identity and are not deep-cloned.
- If a newer Open is cancelled while the retained Orbit’s first listing is incomplete, state becomes `blocked` with `listing-incomplete` and requires explicit Refresh; it is not left stuck in `listing` or restored to the invalidated request.
- No persisted Orbit permission or handle in the first release.
- No stable cross-session document identity.
- No recursive map folders, multi-Orbit simultaneous editing, sync, or automatic migration.
- No native Android/iPhone/other-browser acceptance yet.
- The current tree is ahead of r102 and has no Git baseline. r102/r103/r104 are historical; **r105’s bounded correction was review-accepted with 11 relevant tests**, while native OS-picker/pagehide acceptance remains unverified.
- Orbit does not change IndexedDB recovery authority, legacy `.fileorbit` policy, `.map` format, or source folders.
