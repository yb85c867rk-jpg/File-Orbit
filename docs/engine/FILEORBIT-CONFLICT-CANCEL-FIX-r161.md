# FileOrbit repeated-cancellation feedback completion — r161

## Baseline
- r160 archive: `900939E86F1367461ACD8119F3AC786A7C6151295B4D672F2FBF6B0B19FEAEF6`.
- r159 diagnostic archive: `A00A663798ACFCEAC189AABE4836FC2CD8DE48AF0013E5F95AEF24C71897E359`.
- No OntoMap access. No deployment or paid/enterprise work.

## Confirmed defect
After an applied editor save failed against an externally modified destination, the first conflict Cancel showed the consolidated message. A subsequent Retry Save and second conflict Cancel still set both `error.textContent` and `status.textContent` in `retryAppliedPersistence()`, producing:
- `Changes applied to this map, but could not be saved in this document.`
- `Changes applied to this map, but could not be saved in this browser.`

## Fix
- Added one shared `renderAppliedUnsavedFeedback()` path in `editor-panel.js`.
- Initial applied-save failure, retry failure, retry cancellation, `Save a Copy` failure, and `showSaveError()` for an applied editor operation all use it.
- The path:
  - sets `appliedPending = true`;
  - sets `controller.saveFailed(UNSAVED_MESSAGE)`;
  - clears `#editor-error`;
  - writes exactly `Changes remain in this map but have not been saved.` to `#editor-status`;
  - keeps `Retry Save`, `Save As`, and `Close` available;
  - calls `syncFormControls()`.
- Retry failure now clears obsolete automatic-save feedback in `main.mjs` before returning applied-unsaved.
- `saveAppliedEditorAs()` still calls `showSaveError()`, but that method now routes through the same editor-owned path while applied, so it cannot add a second message.

## Validation
Extends the existing Orbit integration scenario after the second conflict Cancel and adds a third cycle:
- zero save-picker calls on both repeated cancels;
- zero destination writes;
- exactly one exact unsaved message;
- `#editor-error` empty;
- `#save-feedback` hidden;
- no duplicate shell wording or raw AbortError;
- editor retains applied value and dirty state;
- Saving exits;
- Retry Save, Save As, and Close remain usable.

Also adds the same ownership assertions after a non-cancellation deferred retry storage failure.

## Browser evidence
Centered modal and narrow layout are unchanged from r160:
- `evidence/native-r121/r160-dialog-desktop.png`
- `evidence/native-r121/r160-dialog-narrow.png`
- `evidence/native-r121/r160-dialog-geometry.json`

## Tests
Focused Orbit + automatic-save + conflict-dialog: **14/14 PASS**.

Full serial result: p1b-main **69/69**; remaining **1,068** tests = **1,067 pass, 1 skip, 0 fail**; both exit 0. Aggregate **1,137 tests, 1,136 pass, 1 skip, 0 fail**. The existing fake IndexedDB concurrency skip remains.

## Identity
| Artifact | r161 SHA-256 |
|---|---|
| editor-panel.js | `E85B9124E28A618C26FDE44D914CD46464F1D527540D8B5194B2C44357F7B6A6` |
| main.mjs | `59BAFC89B3FBBDE93F5D6A2FA5CFA01914417F6E5B59045248DFE58D247FA991` |
| main-harness-init-runner.mjs | `BDD28188600916862BB229A97B259C3914E635F23B787866F965AC47F64C4A92` |

## Native
- User original `ontology.orbit` unavailable.
- Native two-window A/B/C disk hash and `"Conflict test B"` verification remain **NOT RUN**.
- Free-edition acceptance remains **INCOMPLETE**.

## PASS / FAIL / NOT RUN
**PASS**
- One shared applied-unsaved feedback path.
- Repeated conflict cancel has no picker/write and one message.
- `editor-error` stays empty, fallback feedback hidden.
- Applied value/dirty/destination identity preserved.
- Retry Save / Save As / Close remain available.
- Saving exits after cancellation/failure.
- Save As cancellation and deferred storage failure follow the same ownership rule.
- Centered modal and overwrite protection unchanged.

**FAIL**
- None observed in focused automated checks.

**NOT RUN**
- Native disposable two-window A/B/C test and disk hashes.
- Stored description `"Conflict test B"` verification.
- Actual Android/iOS device check.
- Independent native Save/Open after this change.
