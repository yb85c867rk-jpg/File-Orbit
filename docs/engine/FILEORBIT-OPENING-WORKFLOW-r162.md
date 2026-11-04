# FileOrbit approved opening workflow — r162

## Baseline
- Product baseline: r161 archive `DBCE92DA7773AA4220F23456EF9DCAEC0302E03FD1650A1E0238C0D8E0C37E65`.
- No OntoMap access. No deployment, publishing, external hosting, paid/enterprise work.

## Final workflow

### Open Orbit (one file)
- `Open Orbit` invokes `documentAdapter.pickOpen()` directly.
- The native picker requests one `.orbit` file.
- Extension is validated, the file is size-checked, decoded through the existing backup/import pipeline, and only then installed.
- For real `File` objects, an opened-content baseline and `orbit:` document identity are established before validation/install. The existing document adapter and parser are reused.
- Editor Save writes to the same writable handle; Save As keeps its existing distinct destination flow.
- No folder connection is required.
- Picker cancel, denied permission, invalid content, oversized files, and unsupported extensions preserve the current map and edits.

### Connect Folder (secondary)
- `More opening options` beside Open Orbit opens a menu with one action: `Connect Folder`.
- Connect Folder invokes the existing native directory picker and existing Orbit folder state/listing.
- On success the navigation rail expands, the connected folder name is shown, and the sidebar list/Refresh are available.
- Connecting, refreshing, or cancelling the folder picker does not replace the current map or discard edits.
- Opening a standalone file does not change the connected folder; the folder list only marks a current entry when the handle actually matches.
- Folder file switching continues through the existing unsaved Save/Discard/Cancel promotion.

## Source
- Direct open: `tests/harness/m5-exploration/main.mjs` `openDocument()`.
- Secondary menu wiring: `openOrbitMore` / `openOrbitPopup` / `connectFolder()`.
- UI: `tests/harness/m5-exploration/index.html` More button, menu, Connect Folder item, and updated help text.
- Tests: `tests/engine/exploration/open-workflow-main.test.mjs` plus extended `main-harness-init-runner.mjs`.

## Identity
| Artifact | r162 SHA-256 |
|---|---|
| main.mjs | `9ED531A546F7F44C6688737670F36A4D89CA020F6A591BBAAB7B57929351C380` |
| index.html | `DB78D2FD1957E438A2910E40EC3B470DE5AE7B7CE549C1B90CB3ECFBE87F3008` |
| editor-panel.js | `E85B9124E28A618C26FDE44D914CD46464F1D527540D8B5194B2C44357F7B6A6` |
| open-workflow-main.test.mjs | `008D0554ED50B25DFDEF48DD7CB5AC833C4AFBD60E16227158562C1771476239` |
| main-harness-init-runner.mjs | `330C450BA008C8E795CB5CC119FD1098FB4B6F872E82634490F37C100E45D3A5` |

## Browser evidence
Real browser UI with picker APIs stubbed only for routing observation; this is **not native picker acceptance**.

- Desktop 1200×800: rail expanded; menu at x127–287, y178–226; Connect Folder role `menuitem`.
- Narrow 390×700: expanded rail; menu x142–302, y371–419, fully inside viewport.
- Stub route counts:
  - Open Orbit: file picker 1, folder picker 0.
  - Connect Folder: file picker remains 1, folder picker 1.
- Both cancellation paths preserved the current document.

Screenshots:
- `evidence/native-r121/r162-open-desktop.png`
- `evidence/native-r121/r162-open-narrow.png`
- Data: `evidence/native-r121/r162-open-browser.json`

## Automated workflow coverage
- Open Orbit uses file picker only; opens Standalone Beta without a folder.
- Direct-open Save writes to its original handle.
- Direct-open external modification reaches the conflict dialog; Cancel preserves identity, edits, and writes nothing.
- Connect Folder uses the folder picker only and preserves the current document.
- Folder listing and Refresh remain available.
- Folder picker Cancel preserves the document.
- File picker Cancel preserves the document.
- Invalid file preserves the current document and dirty edits.
- Folder file switching shows the unsaved prompt; Cancel preserves, Discard opens the selected file.
- Existing Save As cancellation, replacement, editor, automatic-save, and conflict protections are exercised by the regressions.

## Tests
Focused opening/Orbit/automatic/conflict: **15/15 PASS**.

Full serial result:
- p1b-main: **69/69**.
- Remaining: **1,069 tests = 1,066 pass, 3 skip, 0 fail**.
- Aggregate: **1,138 tests = 1,135 pass, 3 skip, 0 fail**.
- Both serial parts exited 0.

Skips:
- existing fake IndexedDB concurrency limitation;
- two retired integrated file-open-browser integration scenarios, replaced by `open-workflow-main.test.mjs` and the sidebar Connect Folder path (the unused standalone browser module remains unit-tested).

## PASS / FAIL / NOT RUN
**PASS**
- Open Orbit direct native-picker routing.
- No folder connection required for standalone file.
- Same-handle direct Save.
- Connect Folder secondary action and folder list/refresh.
- Folder connection/refresh/cancel non-destructive.
- Picker cancellation, invalid file, unsaved-file-switch preservation.
- Direct-open external conflict detection via opened baseline.
- Existing Save As cancellation, replacement, editor, automatic-save, conflict protections.
- Desktop/narrow menu accessibility and containment.
- 300-node, attachment limits, #E74C3C, icon/badge behavior unchanged.

**FAIL**
- None observed in automated or browser-routing checks.

**NOT RUN**
- Native desktop browser picker acceptance (real OS file/folder dialogs).
- Native two-window disk hash and `"Conflict test B"` verification.
- Actual Android/iOS device check.
- Independent native Save/Open after this change.

Free-edition acceptance remains **INCOMPLETE** pending native picker and disk/description checks.
