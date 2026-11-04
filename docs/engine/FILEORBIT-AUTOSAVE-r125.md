# FileOrbit automatic persistence and Settings simplification — r125

Status: implemented. Focused mutation/history/Save/editor/recovery/Orbit suites: **139/139 passed**. Full engine: **1087 tests, 1086 passed, 1 skipped, 0 failed**.

## Mutation-to-persistence flow

A successful authoritative structural operation calls one automatic-save request:

1. real node drag/reparent commits;
2. Undo commits;
3. Redo commits.

Rejected/self/no-op drops, failed history replay, camera pan, selection/navigation, zoom, and resize do not request persistence.

The request captures:

- operation token;
- document ownership, session, dataset;
- current writable handle and document identity;
- authoritative revision;
- the current document/tree/attachment registry through the existing save path.

It then enters the single document-save queue.

## Queue and coalescing

- One save operation is active at a time; no overlapping writers.
- Automatic requests are coalesced to the latest pending revision.
- A newer mutation while a save is pending or in flight marks another automatic request.
- After a successful close, a later dirty revision is queued again.
- `savedRevision` is the captured revision actually written; later edits remain dirty until their own confirmed close.
- Manual Settings/editor/Save As/replacement/creation saves use the same queue.
- Manual request options capture their revision, ownership, session, dataset, destination handle, and identity. A queued request cannot silently move to a newer session/destination.
- Save a Copy updates the expected destination only after its own adoption, so its confirmed baseline is retained without letting older queued editor saves move onto the copy.

The queue calls the existing `saveDocument`; it reuses the encoder, destination checks, Orbit conflict protection, confirmed-write baseline, recovery reservation/retirement, and Save a Copy rules.

## Failure/conflict/missing destination

Automatic persistence can:

- stop after write/permission/encoding/conflict/close failure;
- keep authoritative edits, attachments, history, and dirty state;
- show a fixed feedback panel with **Retry** and **Save As**;
- bind those actions to the captured live document/session/destination.

Automatic save does not open conflict dialogs. An external change returns an actionable failure; explicit **Retry** opens the existing Overwrite/Save a Copy/Cancel protection. Cancel does not start another automatic attempt.

No writable destination (including download-only mode):

- automatic save does not open a picker or download;
- feedback offers explicit **Save As**;
- Save As invokes the picker/download directly from the click;
- download handoff leaves the map dirty/unconfirmed.

## Settings simplification

Settings now contains only the existing **Dark/Light theme** control.

Removed visible items:

- Save changes;
- Previous local maps;
- Fit graph;
- Storage & backup help.

Document name and save state moved to the existing fixed feedback area, with no header clutter and no layout shift. Primary Save As, integrated Open File, Orbit list/Refresh/Close/Add, Fit internals, diagnostics, recovery behavior, and legacy records remain.

The nonfunctional Orbit folder-icon remnant was removed.

No automatic-save or Settings work is deferred beyond current limitations.

## Evidence

- `evidence/native-r121/autosave-focused-final-r125.txt`
- `evidence/native-r121/autosave-full-final2-r125.txt`
- `evidence/native-r121/browser-settings-r125.png`
- `evidence/native-r121/browser-settings-r125.json`
- `evidence/native-r121/r125-autosave.json`

Automated vs native:

- Actual-main tests use synthetic writable handles and decoded saved content.
- Browser layout evidence is headless Edge, not native picker/write acceptance.
- Native picker/write/keyboard acceptance remains NOT RUN.

## Limitations

- No independent native verification in this environment.
- Android/iPhone/Firefox/Safari NOT RUN.
- Preflight-to-write race, empty/partial leftovers, no automatic cleanup, stale Open Orbit controller selection, no persisted Orbit handle, no watching/recursion/rename/delete/sync.
- No atomic/exclusive creation, compare-and-write, rollback, or crash durability claim.
