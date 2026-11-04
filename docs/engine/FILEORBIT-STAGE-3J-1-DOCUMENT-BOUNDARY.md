# FileOrbit Stage 3J-1 — current-document state boundary extraction

## Baseline

Preserved exact baseline:
`.stage3j-baseline/fileorbit-stage3j-lifecycle-correction-D445.BASELINE.zip`
SHA-256: `D445CBE17AA69B2F0A93F638DB383D5F866B9A8DD281D9AD5AE7212FD643E669`

Fresh extraction: `.stage3jpc/candidate`.

## Ownership map

Moved to `src/app/pc/document-ownership.js` and consumed by `tests/harness/m5-exploration/main.mjs`:

- `activeDocument` — active flag, name, writable handle, mode, origin, document identity, external-content baseline, saved revision.
- `activeMap` — repository mapId, generation, savedRevision.
- dirty calculation for the non-writable/library case (`documentIsDirty`).
- reset/adopt/clear/set operations.

Stayed in main as existing services/state:

- authoritative `tree` and `attachmentRegistry` (single existing owner);
- `dataRevision` counter (all edits still increment main’s counter);
- editor history and attachment services;
- picker, writable-handle writes, encoding/backup, conflict UI, retry, recovery;
- graph/model/navigation/UI;
- replacement/save operation guards.

Main no longer declares independent `activeDocument` / `activeMap` variables. It imports stable objects and explicit mutation operations; object identity remains stable across document switches.

## Main integration points

- Import added at the top of `tests/harness/m5-exploration/main.mjs`.
- `resetActiveDocument()` calls `resetDocumentOwnership()`.
- Open/save adoption calls `adoptActiveDocument()`.
- Repository map adoption calls `setActiveMap()`.
- Null map resets call `clearActiveMap()`.
- `mapDirty()` delegates library-case revision comparison to `documentIsDirty()`.
- Existing UI, Open/Save/Save As, conflict, retry and recovery code remains in main.

## Behavior preserved

- Orbit File/Orbit Folder open flows.
- Unsaved Save/Discard/Cancel.
- Writable handle save and Save As destination adoption.
- External-content baselines and conflict.
- Cancellation/retry/failed save.
- Editor/Undo/Redo.
- Attachment ownership.
- Stale/replacement guards.
- Free 300 limit.
- Rendering path unchanged; LOD substitution not implemented.

## Tests

- New ownership contract: 1/1 PASS.
- `p1b-main` actual main integration: 69/69 PASS.
- Complete free regression: **1,283 tests, 1,282 pass, 1 skip, 0 fail**, exit 0.
  - Remaining: 1,214 tests, 1,213 pass, 1 skip.
- First serial remainder attempt exposed one flaky Copy Map destination-collision failure; isolated Copy Map passed and a clean full remainder rerun passed 1,213 with 0 fail.
- Skip: existing FakeIndexedDB overlapping-readwrite; native IndexedDB concurrency NOT RUN.

## Browser evidence

Ordinary PC application shell loaded locally in Edge:

- title FileOrbit;
- `hasMap:false`, editor closed, no errors;
- screenshot `ordinary-app-shell.png`.

This is shell/browser routing evidence only. No native picker or disk-save acceptance was performed. Stage 3J-1 does not add LOD controls.

## Limitations

- LOD runtime substitution is Stage 3J-2, not implemented.
- Native OS picker/disk acceptance NOT RUN.
- Full Orbit File/Folder, unsaved, Save As, conflict/retry controls were validated by existing main integration tests, not by a new native browser scenario.
- No paid activation.

## PASS / FAIL / NOT RUN

**PASS**
- Stable extracted ownership objects.
- Main consumes module; no duplicate activeDocument/activeMap locals.
- Dirty/reset/adopt/clear/set behavior.
- p1b-main and full free regression.
**FAIL**
- None in final clean run.
**NOT RUN**
- LOD substitution (Stage 3J-2).
- Native picker/disk acceptance.
- Browser ordinary-app Open/Save control scenario.
