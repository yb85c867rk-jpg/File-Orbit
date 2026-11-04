# FileOrbit automatic persistence corrections — r126

Status: corrected. R1 and R2 reviewer reproductions are fixed. Focused regression: **106/106 passed**; R1/R2 marked scenarios: **4/4 passed**; full engine: **1087 tests, 1086 passed, 1 skipped, 0 failed**. Theme-only Settings and integrated Open browser are unchanged.

## R1 — temporary editor blocking discarded pending work

Cause: the pending automatic request was removed before eligibility was checked. An open editor was treated like obsolescence.

Correction:

- Pending committed work is retained when the blocker is temporary: editor open, persistence busy, replacement guard, backup install/pending state, or an in-flight save.
- Obsolete ownership/destination/session requests are still discarded.
- Editor Cancel/Close and other guard release resume through lifecycle sync plus one microtask. No polling or automatic retry loop.
- The request revision is rebound to the live `dataRevision` immediately before persistence starts, so encoded content is not labelled with an obsolete revision.
- The cancelled draft is not applied; draft text cannot enter the saved tree.
- Explicit editor Save remains a normal serialized manual save; pending automatic work cannot later overwrite the applied draft.
- Dirty state clears only after the later confirmed close.

Actual-main scenario:

1. Deferred automatic Undo close starts.
2. Committed Redo while close is pending.
3. Editor draft opens; draft text is entered but not submitted.
4. Earlier close releases; later save remains blocked by the open editor.
5. Editor Cancel; pending work resumes.
6. Decoded output contains Redo parent/structure and exact `drag-bytes`; dirty becomes false only after the resumed close; draft text is absent; saved revision equals live revision.
7. A second scenario submits the editor form instead; the submitted name and exact attachment bytes win, with no overlapping writers.

Evidence markers: `AUTO_EDITOR_R1_COMPLETE` / `AUTO_EDITOR_R1_WATCHDOG`.

## R2 — conflict Cancel removed actionable feedback

Cause: Retry cleared the failure before attempting persistence; cancellation blocked automatic work without restoring feedback.

Correction:

- Retry/Save As no longer clear failure before success.
- An explicit conflict Cancel keeps `automaticSaveBlocked` and keeps concise feedback with usable Retry/Save As bound to the exact live document/session/destination.
- Feedback and action disabled state are reconciled when failure clears.
- Further mutations while paused do not clear feedback, write automatically, or open a dialog loop.
- A later explicit Retry can resolve the conflict with Overwrite/Save a Copy.
- Replacement installation invalidates automatic feedback and disables old actions.

Actual-main scenario:

1. External conflict stops automatic save.
2. Retry opens the conflict dialog.
3. Cancel twice; no writes and no automatic dialog loop; feedback remains visible and usable.
4. A structural mutation while paused does not clear it or write.
5. Later Retry + Overwrite resolves; feedback hides and dirty clears.
6. Actual Open/Import replacement clears feedback and disables old Retry/Save As.

Evidence markers: `AUTO_CONFLICT_R2_COMPLETE` / `AUTO_CONFLICT_R2_WATCHDOG`.

## Unchanged

- Theme-only Settings.
- Integrated Open browser.
- Queue serialization, coalescing, ownership/destination validation, and explicit failure blocking.
- Primary Save As, Orbit controls, recovery, legacy records, Fit internals, diagnostics.

## Evidence

- `evidence/native-r121/autosave-r1-r2-r126.txt`
- `evidence/native-r121/r127-open-settle.json`
- `evidence/native-r121/autosave-regression-r127.txt`
- `evidence/native-r121/autosave-full-r127.txt`
- This document's r126 results are superseded by r127's final exact-file verification.

## Boundaries

Synthetic main-entry tests are not native filesystem evidence. Native picker/write/keyboard checks are NOT RUN. No IndexedDB reset, original document modification, dependency install, commit, push, deploy, or OntoMap/MORAN-DCP changes.
