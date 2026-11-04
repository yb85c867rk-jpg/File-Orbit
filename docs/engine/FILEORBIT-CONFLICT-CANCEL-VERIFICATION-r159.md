# FileOrbit external-conflict cancellation verification — r159

## Scope
Read-only verification and diagnosis. No product behavior was changed. No OntoMap access.

## Original file/session availability
- Workspace search for `ontology.orbit` (and `*conflict*` `.orbit` files) returned no file.
- No original path, bytes, or SHA-256 could be recorded.
- The original saved description is **NOT VERIFIED**. This report does not claim it contains "Conflict test B".
- The original Chrome windows/session were not accessible through a supported test interface and were not modified.

## Evidence preserved
- None of the user's file, window state, or unsaved edits were overwritten.
- The existing r158 archive is preserved: `9EEC034484E08F103F08CB8838C4D95039D6B3447B9F1F238CDC97CB46EE57D2`.
- Disposable files were not created for native reproduction because native picker interaction was unavailable.

## Automated checks
Focused:
`node --test --test-isolation=none tests/engine/exploration/file-conflict-dialog.test.mjs tests/engine/exploration/automatic-save-main.test.mjs`

Result: **13/13 PASS**.

The automated conflict harness asserts:
- conflict Cancel returns a decision without writing the original;
- repeated Cancel writes nothing;
- dirty edits remain;
- actionable save feedback remains available;
- Retry/Overwrite/Save a Copy stay distinct.

This is **simulated file-handle evidence**, not native disk acceptance. It does not hash an actual `.orbit` file or verify the description.

## Source trace

### Conflict Cancel
- `tests/harness/m5-exploration/file-conflict-dialog.js`
  - buttons and callback routing: lines 24–35, 107–112;
  - initial focus is Cancel: line 107.
- `tests/harness/m5-exploration/main.mjs`
  - `askOrbitConflict` lines 2997–3012;
  - `protectOrbitOverwrite` conflict branch lines 3063–3079;
  - Cancel returns `{ok:false, reason:'cancelled', cancelled:true}` at lines 3068/3075;
  - `saveDocument` conflict-cancel branch lines 3588–3590:
    - sets routine status `Save cancelled. The destination and current edits were preserved.`
    - returns `{ok:false, reason:'cancelled', stage:'overwrite'}`;
    - **does not call the picker**.

### Save As picker message
`Save As cancelled at <stage> stage...` is generated only at `main.mjs:3571`, after `documentAdapter.pickSave` at lines 3566–3568.

The raw `AbortError` is appended by `fail()` at lines 3551–3555; `documentAdapter` maps abort to `{reason:'cancelled'}` at `tests/harness/m5-exploration/document-adapter.js:41`.

**Source inference:** the conflict Cancel decision cannot itself produce the observed Save As-picker cancellation text. A separate Save As action (or stale/previous picker failure) must have invoked `saveDocument` without a writable handle after the conflict closed. The exact native action/order is **NOT RUN** and cannot be proven from the available evidence.

A Save a Copy picker cancellation also would not produce this exact message: it is handled inside `askOrbitConflict`/`acceptCopy` and returns a conflict cancellation, not the `saveDocument` picker path.

### Duplicate feedback
Multiple independent surfaces exist:
- conflict cancel routine status at `main.mjs:3589`;
- editor applied-unsaved message at `main.mjs:1476` and `editor-panel.js:330–336`;
- save feedback (`#save-feedback`) and shell status (`#shell-status`) in `index.html` around lines 74–82 and 464–468.

The observed duplication is consistent with more than one surface reporting the same failure. The precise duplicate rendering was not independently reproduced in the original windows.

### Dialog placement
`file-conflict-dialog.js` assigns classes `file-conflict-backdrop`, `file-conflict-dialog`, and `file-conflict-actions`, but `index.html` has no CSS selectors for those classes. In a real browser at 900×700:

- overlay and dialog: left 0, top 19.9, width 900, height 148.9;
- computed positions: `static`; no backdrop, no centering;
- buttons at y≈147.8, full-width dialog.

This confirms the upper-left/unstyled dialog.

The feedback host is fixed at `left:76px; bottom:12px` with `max-width: min(680px, calc(100vw - 24px))`; the left offset is not subtracted from the width budget, so narrower viewports can run out of room. In a 390×844 browser check the host measured left=68, right=390 (just fitting); the user’s reported outside-screen placement is retained as an observed UI failure at their viewport, not independently reproduced here.

## Check matrix
| Check | Result | Evidence |
|---|---|---|
| Original file path/hash | **NOT RUN** | no file in workspace; outside scope not inspected |
| Original saved description = B | **NOT RUN** | original unavailable |
| Native two-window reproduction | **NOT RUN** | native picker/session unavailable |
| Native disk hash after Cancel | **NOT RUN** | no disposable native run |
| Automated conflict Cancel no write | **PASS** | 13/13 focused; fake handles |
| Automated dirty/feedback preservation | **PASS** | same |
| Conflict Cancel handler does not open picker | **PASS (source)** | 3068/3075, 3588–3590 |
| Observed "Save As cancelled..." explained by Cancel | **FAIL/non sequitur** | only picker path at 3571; separate action required |
| Raw AbortError suppression | **FAIL** | `fail()` appends raw error name/message |
| Dialog centered over map | **FAIL** | browser geometry; no CSS |
| Feedback fully inside viewport | **FAIL (source/observed)** | fixed left offset + width budget |
| Duplicate feedback | **FAIL (observed/source)** | routine status + editor status + save feedback |

## Proposed smallest correction
1. Add dedicated CSS:
   - `.file-conflict-backdrop { position:fixed; inset:0 0 0 64px; z-index:70; display:grid; place-items:center; padding:16px; background:rgba(0,0,0,.55); }` for the map area, with narrow-screen inset 0.
   - `.file-conflict-dialog` width `min(620px,100%)`, max-height, overflow, padding, panel styling.
   - `.file-conflict-actions` wrapping and spacing.
2. Return a distinct conflict-cancel result (`reason:'conflict-cancelled', stage:'conflict'`) and map it directly to one applied-unsaved message. Do not call `fail`, `pickSave`, or a Save As picker on this branch.
3. Consolidate feedback ownership: editor form status or one shell/feedback toast, not both; suppress routine shell status while an actionable editor/applied-unsaved message is shown.
4. Keep raw `AbortError` diagnostics out of user-facing text. If a later Save As picker is cancelled, show `Save As cancelled. Your map and unsaved changes were preserved.` without error details.
5. Make feedback host inside the viewport: `left:68px; right:12px; max-width:none;` and `overflow-wrap:anywhere`; test narrow widths.
6. Add tests:
   - spy on `showSaveFilePicker` and assert zero calls for conflict Cancel;
   - assert one message surface, no raw `AbortError` text;
   - assert dialog centered within map-area bounds at desktop/narrow;
   - retain disk-hash/no-write assertions with a disposable native file.

## Remaining manual steps
1. Provide the original `.orbit` path or a disposable copy accessible through Chrome.
2. Open it in A and B, edit B, save B, record SHA-256.
3. Edit A without reopen; Save; verify dialog; Cancel.
4. Record A/B disk SHA-256; disk must remain B.
5. Reopen in C or parse read-only; verify technical folder description exactly `Conflict test B`.
6. Verify A still holds `Conflict test A`, dirty, Saving exited, recovery action available.
7. Instrument `window.showSaveFilePicker` count and feedback elements during the exact Cancel action before proposing/merging routing changes.

## Status
- Free-edition acceptance remains **NOT ACCEPTED / incomplete**.
- No product behavior has been modified.
