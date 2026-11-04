# FileOrbit conflict-dialog and cancellation-feedback fixes — r160

## Baseline
- Product baseline: r158 `9EEC034484E08F103F08CB8838C4D95039D6B3447B9F1F238CDC97CB46EE57D2`.
- Diagnostic evidence: r159 `A00A663798ACFCEAC189AABE4836FC2CD8DE48AF0013E5F95AEF24C71897E359`.
- No OntoMap access. No deployment, publishing, or paid/enterprise work.

## Implemented fixes

### Conflict modal
- Added a styled modal card and backdrop for `file-conflict-backdrop` / `file-conflict-dialog` / `file-conflict-actions`.
- The card is positioned from the current `#graph-viewport` rectangle, not from a fixed viewport inset. This accounts for the navigation rail and Details panel.
- A `ResizeObserver` on the map viewport plus a window resize listener repositions the card when panels change or the window resizes.
- Width is capped by both map and viewport space; height is capped to the map/viewport with internal scrolling.
- Action buttons wrap at narrow widths.
- The backdrop covers the viewport and blocks pointer access; a capture-phase key handler blocks background keyboard interaction, with focus trapping and `focusin` recovery.
- Hidden state is guarded with `.file-conflict-backdrop[hidden] { display: none !important; }`.
- Initial Cancel focus, Tab/Shift+Tab trapping, Escape cancellation, and focus restoration remain intact.

### Cancellation feedback
- Conflict Cancel now returns a distinct `conflict-cancelled` result and does not open a save picker or write.
- Save a Copy retains its explicit picker flow; Save As picker cancellation is separate.
- Applied editor changes show exactly one message in the editor panel:
  `Changes remain in this map but have not been saved.`
- The editor Save button becomes `Retry Save`; a `Save As` recovery action is exposed in the same panel; `Close` remains available.
- Automatic-save fallback uses the same message in the single `#save-feedback` surface with Retry/Save As.
- Raw `AbortError`, exception names, stack traces, and browser error text are no longer appended to user-facing save messages. `lastDocumentFailure` retains diagnostics.
- Obsolete automatic-save feedback is cleared when an editor applied-save failure takes ownership of the message surface.

## Root-cause status
The reported sequential Save As text is **not proven** to originate from conflict Cancel. Source tracing shows that Cancel returns a conflict-cancelled decision and never reaches the save-picker path. The exact native action sequence that produced the observed picker message was not reproduced and remains **NOT RUN**; stale feedback and a separate sequential Save As are both consistent with the evidence. This task removes the known raw-error and duplicate-feedback routes without claiming a proven native root cause.

## Identity
| Artifact | r160 SHA-256 |
|---|---|
| file-conflict-dialog.js | `7CAA9799856D743C5EE16B223D672EF08F3B32F7D2E429E125AA916120231516` |
| index.html | `1E9D10C6257687C9D56D01713699CCF02912CD171900DB8082585F7303C4ED10` |
| main.mjs | `412F0F8B9B89DB6A02B0D40054D8ED07E5E8E32E63B5A3E256268A24E051CDDE` |
| editor-panel.js | `466FD9E1336381908371A8C5A64DD2841ECF4060A0F0B2161ECD191BFFD03B77` |
| main-harness-init-runner.mjs | `7A6D4FB6D5ACD59888C2E767A1F1124D5D158E0FD1E30F2AE2A64665FE2418F3` |

## Source trace
- Conflict decision: `tests/harness/m5-exploration/main.mjs:3015–3030`.
- Conflict Cancel results: `main.mjs:3085`, `3092`.
- Save conflict branch: `main.mjs:3607–3609`.
- Picker cancellation: `main.mjs:3589`; diagnostics retained in `fail()` at `main.mjs:3571`.
- Editor applied-unsaved: `main.mjs:1491`, `editor-panel.js:342–353`.
- Editor Save As recovery: `editor-panel.js:139–144, 558–566`; `main.mjs:1369`.
- Modal: `file-conflict-dialog.js`; styles `index.html:322–333`.

## Browser geometry evidence
Real browser, current build:
- Desktop 1200×800, Details expanded, rail collapsed: map 835×722, modal inside map (`insideMap=true`).
- Rail expanded: map 695×722; modal moved and remained inside.
- Details collapsed: map 867×722; modal moved and remained inside.
- Narrow 390×700: map 326×520; modal left=80, fully inside; all three actions visible and wrapped inside the card.
- Initial focus: Cancel. Tab moved focus to Overwrite.
- After Cancel: overlay `hidden=true`, computed `display:none`; no overlay remains.

Screenshots:
- `evidence/native-r121/r160-dialog-desktop.png`
- `evidence/native-r121/r160-dialog-narrow.png`
- Geometry: `evidence/native-r121/r160-dialog-geometry.json`

## Tests
Full serial result: p1b-main 69/69; remaining 1,068 tests = 1,067 pass, 1 skip, 0 fail; both exit 0. Aggregate **1,137 tests, 1,136 pass, 1 skip, 0 fail**. The persistent skip is the existing fake IndexedDB concurrency limitation.

Focused command:
`node --test --test-isolation=none tests/engine/exploration/orbit-main.test.mjs tests/engine/exploration/automatic-save-main.test.mjs tests/engine/exploration/file-conflict-dialog.test.mjs`

Result: **14/14 PASS**.

Focused assertions now include:
- conflict Cancel opens zero save pickers;
- conflict overlay is hidden and editor exits Saving;
- editor retains dirty value;
- editor status is exactly the consolidated message;
- `#save-feedback` stays hidden for editor cancellation;
- no AbortError/showSaveFilePicker text in editor status;
- Save As recovery button exists and picker cancellation leaves the message clean;
- automatic conflict Cancel shows the same consolidated message in the single fallback surface.

## Native checks
- The user's original `ontology.orbit` is not in the workspace; its path/hash and stored description remain unverified.
- Native two-window disposable reproduction and disk-hash comparison were **NOT RUN**.
- No native file was overwritten for testing.
- Free-edition acceptance remains **INCOMPLETE**.

## PASS / FAIL / NOT RUN
**PASS**
- Styled centered conflict modal over actual map bounds.
- Dynamic reposition on rail/Details/window changes.
- Narrow containment and button wrapping.
- Background pointer/key blocking, initial Cancel focus, Tab trap, Escape, focus restore.
- Hidden overlay remains hidden.
- Conflict Cancel no write/no picker.
- One editor cancellation message; one automatic fallback surface.
- Retry Save and Save As actions.
- Raw exception text removed from user-facing messages.
- Existing overwrite protection and explicit overwrite confirmation.

**FAIL**
- None observed in focused automated or browser geometry checks.

**NOT RUN**
- Native two-window disposable test (A/B/C) and disk hash comparison.
- Original saved description verification.
- Actual Android/iOS device check.
- Independent native Save/Open after this change.

## Remaining native acceptance steps
1. Copy a disposable `.orbit` file; record SHA-256.
2. Open it in two native FileOrbit windows; edit technical description in B to `Conflict test B`; save; record hash.
3. In A, without reopening, edit to `Conflict test A`; save; confirm conflict.
4. Click Cancel; record hash; it must equal B’s hash.
5. Reopen in C or parse independently; confirm technical folder description exactly `Conflict test B`.
6. Confirm A still has `Conflict test A`, dirty, Saving exited, one message, Retry Save and Save As available.
7. Do not use the user's original `ontology.orbit`.
