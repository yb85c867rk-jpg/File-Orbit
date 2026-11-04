# FileOrbit File-Based Documents — Transition Plan and Slice 1

Status: **r136 — .orbit exclusive; legacy extension compatibility removed; NATIVE NOT RUN**

> **Baseline note (planning):** r102/r103/r104 are historical. r105’s bounded creation-ownership/dialog-cancel correction was review-accepted with 11 relevant tests; native OS-picker/pagehide acceptance remains unverified. The working tree includes automatic Create-and-Save, editor-presentation cleanup, and creation lifecycle ownership. The destination matrix below is historical; current behavior is recorded in [FILEORBIT-ORBIT-IMPLEMENTATION-PLAN.md](FILEORBIT-ORBIT-IMPLEMENTATION-PLAN.md).

## Orbit workspaces — Slice 1–5 accepted; Slice 6 partial; r125 automatic persistence

See [FILEORBIT-ORBIT-IMPLEMENTATION-PLAN.md](FILEORBIT-ORBIT-IMPLEMENTATION-PLAN.md). Slice 1’s directory/name primitives, Slice 2’s state/enumeration controller, Slice 3’s file-baseline/conflict primitives, and Slice 4’s left-rail Orbit list/protected Open plus Slice 5’s Create-in-Orbit, Create Orbit, and Add to Orbit are implemented. Slice 6 source/server and browser-layout checks passed, but native picker/filesystem acceptance is blocked in the headless test browser and remains NOT RUN. r122 removes the primary rail Save/Open Orbit actions in favor of Settings Save changes; r123 replaces the preliminary Open File choice with one integrated folder/list browser; r125 adds queued automatic persistence after successful reparent/Undo/Redo and theme-only Settings; user-reported PC testing passed but is not independent verification. Rename/delete, recursive folders, watching, persisted handles, manifests/indexes, and synchronization remain deferred.

## Affected modules

- `src/engine/hypertree/persistence/backup.js` — unchanged container format; `safeDocumentFilename()` produces `.orbit` and prevents duplicate `.orbit` suffixes.
- `tests/harness/m5-exploration/document-adapter.js` — feature-detected writable-handle and download-fallback adapter.
- `tests/harness/m5-exploration/main.mjs` — document state, Open File/Save/Save As routing, candidate Open, dirty baseline, editor form save routing, legacy local-map access.
- `tests/harness/m5-exploration/index.html` — Open File, Save As, “Previous local maps”, Import/Export Backup labels, help text.
- Codec/container, IndexedDB repository, candidate installer, prompts, editors, history, viewers and P3 lifecycle mechanics are reused unchanged.

## Document state contract

`activeDocument`: `{ active, name, handle, mode: 'writable'|'download'|'none', savedRevision, origin }`.

- Open validates content and installs through the existing candidate boundary; the installed revision becomes clean.
- `mapDirty()` compares `dataRevision` with the document’s successfully written revision when a file document is active.
- Direct Save captures the revision before async encoding/writing and marks only that revision clean after `close()` succeeds.
- Later edits remain dirty.
- A download fallback is a handoff: status is “Download started…”, the old destination is retained, and no clean revision is advanced.
- Save As changes the active destination only after a successful write/close.
- IndexedDB Save remains for legacy/created local maps in this slice and is not a document-file save.

## Adapter contract

- Writable supported only when `showOpenFilePicker` and `showSaveFilePicker` functions exist.
- `pickOpen` handles cancellation, read permission denial and file read errors.
- `pickSave` handles cancellation and read/write permission denial.
- `write` awaits `createWritable`, `write`, and `close`; close failure is a failure and aborts/cleans the writable.
- `download` creates a temporary anchor/object URL, labels the result `handoff`, and cleans URL/anchor idempotently.
- No user-agent checks.

## Compatibility/migration

- New output filename: `<sanitized name>.orbit`.
- Accept only `.orbit`; `.map`/`.fileorbit` are rejected before installation. Selection still requires content magic/container validation.
- Existing binary magic/version/manifest/attachment layout/hashes unchanged.
- Unrelated `.orbit` fails `bad-magic` (“This is not a FileOrbit backup.”).
- Existing IndexedDB records remain intact and are reachable through “Previous local maps”; they can be exported with Save As.
- No automatic deletion/migration.

## Recovery checkpoint implementation plan

**SLICE 3 STARTUP RECOVERY IMPLEMENTED WITH r90/r91 CANCELLATION AND OWNERSHIP CORRECTIONS; NATIVE ACCEPTANCE NOT RUN; FEATURE NOT DECLARED COMPLETE**

The revised conversion design and implemented storage slice are in [FILEORBIT-RECOVERY-IMPLEMENTATION-PLAN.md](FILEORBIT-RECOVERY-IMPLEMENTATION-PLAN.md). It resolves:

- combined 512 MiB capacity enforced atomically from actual rows in both legacy-map and recovery writes;
- durable per-workspace sequence/controlVersion/tombstone ordering so runtime revisions are never compared across sessions;
- recovery as a new forked workspace with an installation-only source claim, preserving the source until the child is durable;
- no automatic age/count pruning; only explicit discard, established save retirement, and safe source supersession.

DB_VERSION is now 2. The additive upgrade can trigger through the existing production database-open path even though no recovery UI or scheduler is added. Slice 1 is therefore storage-active but user-interface dark. Legacy Previous local maps records remain unchanged and accessible; legacy write capacity now includes recovery bytes.


## Recovery policy (storage implemented, UX pending)
Recovery storage and production scheduling are implemented: additive v2 stores, validated detached checkpoints, combined accounting, workspace control/tombstone fencing, exact save reservations, claims, discard, source supersession, a serialized 600 ms scheduler, main mutation hooks, Create/Import baselines, workspace replacement ownership, and confirmed document-Save retirement. Later dirty revisions survive confirmed Save retirement, scheduler operations are lifecycle-bound so stale A completions cannot mutate replacement B, and attachment retention uses independent counted leases. Checkpoint failures are isolated from graph/document/history state; retirement failure is reported separately from a successful file Save. Startup recovery discovery, Later/Discard/Recover, exact claim-bound child forks, installation through the shared candidate pipeline, child workspace adoption, and durable-child source supersession are now implemented. Create/Open/Previous-local-maps/Import and destroy cancel outgoing Recover/Discard using explicit request identity; scheduler adoption validates incoming lifecycle/owner/source/authorization before mutation and revalidates after durable load, so stale completions cannot invalidate a replacement owner or publish into it. Native recovery acceptance remains **NOT RUN**. Native browser recovery behavior remains **NOT RUN**.

## Implemented slice

- `.orbit` output; `.map`/`.fileorbit` rejected.
- File Open through writable picker or file input, candidate installation, clean baseline.
- Save to existing writable handle; Save As to new destination.
- Download fallback with honest handoff status.
- Document dirty baseline and editor-form Save routing for writable documents.
- “Previous local maps” access to IndexedDB records.
- Help text explains document Save, browser fallback, separate recovery data, .orbit files, and no original-folder mutation.

## Destination transition matrix (r69)\n\n| Action | Destination after successful commit |\n| --- | --- |\n| Open File | Selected file handle/name; clean file baseline |\n| Import Backup | No handle; restored unsaved document |\n| Create Map | No handle; new unsaved document |\n| Previous local maps | No inherited file handle; IndexedDB record |\n| Failed/cancelled Open/import | Prior document handle, revision, dirty state preserved |\n| Save As | New handle/name only after write and close succeed |\n\nSave and continue uses the same destination-aware save as toolbar/form Save for active file documents and waits for close before replacement. Download handoff keeps replacement pending and does not advance the saved revision.\n\n## Retry ownership (r70)\n\nApplied fallback saves create editorAppliedOperation before handoff return. Retry uses the shared document save for active fallback documents and the captured applied revision. Repeated handoffs keep the same owner; the edit/attachment is not recreated. Replacement/destroy invalidate through session/dataset/form ownership.\n\n## Shared user Save (r72)\n\nsaveCurrentDocument() is the single user Save API for toolbar, form, Retry, Save and continue, and Save As. Production always selects a document destination: active handle, Save picker, or .orbit download handoff. IndexedDB is not a normal user Save fallback.\n\n## Fallback picker activation (r73)\n\nchooseBackupFile() sets accept/intent and synchronously invokes the owned hidden input .click() in the initiating action before any async work. Open File uses sDocument=true; Import Backup uses false. Selection clears the input value for same-file reselect; destroy/stale guards are retained.\n\n## Save As ownership verification (r74)\n\nActual Save As control traced through saveCurrentDocument → picker → encode → createWritable/write/close → destination publication. Picker cancellation, createWritable failure, write failure, and close failure leave the prior active destination, authoritative map, attachments, and dirty state unchanged. A deferred close keeps A active until close resolves; later committed edits remain dirty against the captured saved revision. Ordinary Save then writes the newly adopted handle without reopening the picker.\n\n## Save lifecycle ownership (r75)\n\nDocument saves carry documentSaveOwner operation identity plus session/dataset/replacement token. Picker, encode, download, write/close failure, catch, and finally paths publish or clear state only while that exact owner remains current and the page is not destroyed. Lifecycle replacement/destroy invalidates the owner and increments documentOperation; a stale finally cannot clear a newer save. Deferred close keeps the destination provisional until an owned successful close.\n\n## Production replacement invalidation (r76)\n\nSuccessful candidate commits call invalidateDocumentSave() before publishing the installed tree/document, and 
esetActiveDocument() invalidates the outgoing document save for Open/Previous-local/Create/empty reset paths. Failed, cancelled, or uncommitted replacements leave A's owner/lock intact. An obsolete A completion is guarded by documentSaveOwner and cannot clear B's lock or publish into B.\n\n## First-Save destination verification (r77)\n\nImport Backup with no handle and writable APIs invokes a .map picker and adopts only after close; Previous local maps likewise invokes a .map picker for form Save while preserving the legacy IndexedDB record. Fallback Previous-local toolbar Save downloads without adopting a handle or marking clean. Fallback Save-and-continue keeps replacement pending; Cancel preserves, Discard proceeds. No production routing defect was found; test-support repository fixture hooks were added.\n\n## Fallback first-Save acceptance (r78)\n\nImport Backup and Previous local maps fallback form Save/Retry/Close are covered through actual controls with writable APIs absent: one .map download handoff, unconfirmed dirty state, valid applied owner, no revision/history/id/attachment changes on Retry, exact decoded bytes, and Close retention. Save-and-continue handoff keeps replacement pending; Cancel preserves outgoing map; Discard installs incoming once. Previous-local fixture proves stable IDs and unchanged repository record. Download counts use patched createObjectURL and owned anchor capture.\n\n## Retry preflight and replacement commit count (r79)\n\nRetry validates the exact applied owner before setting persisting or invoking saveCurrentDocument, and again after await. Stale retry rejects without picker/write/download/IDB side effects. Controlled stale form-token injection is invariant testing, not a native workflow. Fallback replacement tests now assert importCommitCount: no commit during handoff/Cancel, exactly +1 on first Discard, unchanged on queued second Discard, with incoming IDs/bytes/labels/hits. Documentation corrected: r78 did remove the preflight production guard; r79 restores it.\n\n## Source-backed attachment detachment (r80)\n\ndecodeBackup now materializes each validated attachment range into a detached Blob instead of retaining a slice backed by the opened document File. This prevents later Save/encode failures after overwriting the same .fileorbit/.map handle. Decode/encode read failures report stage, attachment id/name, error name/message without content. Unit invalidation and actual legacy-.fileorbit overwrite/add-PDF/Save-As regressions pass.\n\n## Save As permission and stage diagnostics (r81)\n\nqueryPermission is awaited; requestPermission is invoked only for a non-granted permission and never redundantly. Picker, permission-query, permission-request, encoding, createWritable, write, close, and destination adoption are tracked distinctly. Failures preserve the old destination and saved revision; status and lastDocumentFailure expose stage/error name/message without document bytes. The async query defect is confirmed; its role in the native Save-confirmed/cancelled case remains native-unverified.\n\n## Limits

- Create Map/new document toolbar Save still uses the legacy IndexedDB path; Save As creates a `.orbit` document.
- Recovery conversion and recovery UI are pending.
- No native/browser/mobile checks.

## Acceptance checks

- `.orbit` filename and duplicate-suffix normalization — unit test.
- unrelated content magic rejection for .orbit — codec test.
- adapter pick/cancel/denial/write/close/download cleanup — unit tests.
- writable Open clean baseline, form Save writes/closes, Save As writes new handle, close failure keeps dirty — integration test.
- fallback Open is clean; fallback Save reports Download started and remains dirty — integration test.
- accepted P1b/P3, editor/history/viewer, IndexedDB persistence suites.














