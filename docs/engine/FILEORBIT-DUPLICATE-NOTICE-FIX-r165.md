# FileOrbit duplicate cancellation notification fix — r165

## Baseline
- Product baseline: r164 archive `9704F96D4483ADEB4EABA088E9F6A4C8621E5F6057E98F9ECFC1154CE9F31B7D`.
- No OntoMap access. No deployment, publishing, external hosting, paid/enterprise work.

## Confirmed defect
Automatic-save external conflict → save-feedback Retry → conflict Cancel produced the unsaved message in both:
- `#shell-status`
- `#save-feedback-text`

Cause: `saveDocument()` showed the transient shell notification on conflict cancellation, while `runAutomaticSaveFeedbackAction()` then restored automatic-save feedback with the same message.

## Fix
- Added an explicit **recovery** save context for `runAutomaticSaveFeedbackAction` (`recovery: true`), distinct from internal automatic saves and from normal explicit saves.
- Recovery cancellation paths suppress the transient shell notification (`!recovery`), so the automatic save-feedback surface owns the message.
- `setAutomaticSaveFailure()` clears any existing transient shell notification before claiming ownership.
- Recovery action start resets the save-feedback message-dismissal state and timer so a new Retry/Save As cancellation gets a fresh ~3000ms message.
- The save-feedback text auto-dismisses after ~3s; Retry Save / Save As controls remain enabled and visible.
- Added a shared transient-shell clear helper that cancels the timer, clears text, hides the element, and removes pointer interception.
- Editor-owned feedback remains editor-only; no shell duplicate.
- Dirty state, edits, document identity, overwrite confirmation, and r163/r164 submenu/notice behavior preserved.

## Validation
Extended `AUTO_CONFLICT` immediately after Retry → Cancel:
- exactly one visible unsaved-message occurrence across shell, save-feedback, and editor surfaces;
- shell hidden;
- zero save-picker calls on conflict Cancel;
- zero destination writes;
- message gone after ~3 seconds;
- Retry / Save As still enabled;
- repeated conflict Cancel again shows exactly one message;
- Save As from the same recovery controls opens one picker; canceling writes nothing and restores one unsaved message;
- dirty state retained throughout.

## Tests
Focused feedback/automatic/editor/opening/conflict: **31/31 PASS**.

Full serial result:
- p1b-main: **69/69**.
- Remaining: **1,067 tests = 1,066 pass, 1 skip, 0 fail**.
- Aggregate: **1,136 tests = 1,135 pass, 1 skip, 0 fail**.
- Both serial parts exited 0.
- Only skip: existing fake IndexedDB concurrency limitation.
- The extended `AUTO_CONFLICT` scenario directly asserts one visible unsaved occurrence, no shell duplicate, zero conflict-Cancel writes/pickers, 3s text dismissal, retained controls, repeated Cancel, and Save As recovery cancellation.

## Identity
| Artifact | r165 SHA-256 |
|---|---|
| main.mjs | `FDC1A768FC94EC09C9A943C6A24BE3CCB83C0234C1F4EAB5C67A25A89FE4F279` |
| index.html | `243646B689022C4C0C9734A37A339723D828E8B6676B8AC5B20414DC973C4FFC` |
| main-harness-init-runner.mjs | `8B3FCF149F2731F0739E6CA28E6532B559EA6261EC189A6BA4538CADCF8DF0E1` |

## Browser evidence
r164 browser evidence remains current for layout/typography/notice behavior:
- `evidence/native-r121/r164-notice-desktop.png`
- `evidence/native-r121/r164-notice-dismissed.png`
- `evidence/native-r121/r164-notice-panels.png`
- `evidence/native-r121/r164-notice-narrow.png`
- `evidence/native-r121/r164-typography-notice.json`

The duplicate-owner correction is validated through the real main harness (`AUTO_CONFLICT`), not only static tests.

## PASS / FAIL / NOT RUN
**PASS**
- One visible unsaved notification for recovery conflict cancellation.
- Save-feedback owns the message; shell stays hidden.
- Message text auto-dismisses after ~3s.
- Recovery controls remain usable.
- Repeated cancellation remains one-message.
- Save As cancellation from recovery is one-message and write-free.
- Zero picker/write on conflict Cancel.
- Dirty state/edits/identity preserved.
- Editor feedback remains editor-only.
- r163 submenu and r164 centered auto-dismiss notice behavior preserved.

**FAIL**
- None observed in focused automated checks.

**NOT RUN**
- Real native OS file/folder picker acceptance.
- Native two-window disk hash and `"Conflict test B"` verification.
- Actual Android/iOS device check.
- Independent native Save/Open after this change.

Free-edition acceptance remains **INCOMPLETE** pending native picker and disk/description checks.
