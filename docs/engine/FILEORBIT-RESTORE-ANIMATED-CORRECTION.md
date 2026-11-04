# FileOrbit Restoration and Animated-Search Correction

Status: **IMPLEMENTED — Node tests pass; native browser verification NOT RUN**

## Create Map cancellation restoration

Cancellation now uses one shared frame-installation path (`performViewportResizeAction` → `session.run` → `installFrame`).

- The previous surface/overlay and navigation are torn down while creation ownership remains held.
- A fresh surface is created at the current viewport.
- `installFrame` uses the current theme and current viewport.
- Draw, labels, and hits complete before link readiness becomes true.
- Manual camera/framing is preserved; automatic framing is refit using the captured framing policy.
- Captured focus, selection, details target, query, dataset, history, and attachments are restored.
- Search results are recomputed from current committed data.
- `linkFrameReady` is set only by successful `installFrame`, never forced.
- Restoration failure hides the graph presentation, clears the frame, disables link readiness, marks ownership recovery failure, and retains the original error.
- `creationTerminalHandled` makes Cancel/Escape/error/close restoration exactly one terminal action.
- No prior map returns to the existing empty startup state.
- Theme redraw and resize are suppressed during suspension; final restoration draws current theme at current viewport.

Actual runner evidence covers unchanged-viewport cancel, Dark→Light and Light→Dark cancel with recorded canvas colors, resize during creation, repeated Cancel clicks, link readiness, search restoration, and restore draw failure.

## Normal-motion search failures

Retained the r28 successful 780 ms PDF reveal.

Added normal-motion actual-entry modes with controlled RAF timestamps:

- Intermediate draw failure: transition frame fails; no viewer, no target selection; error retained.
- Resize/navigation cancellation: transition cancels, search action settles without viewer/selection; a later valid search returns results.
- Dataset replacement during reveal: old result cannot act on the new dataset; no viewer/selection.

Shared tests additionally cover label-update and final-hit failure, stale target/revision, waiter settle-once, and recovery behavior.

## Storage decision — NOT IMPLEMENTED

IndexedDB is recorded as the selected future persistence mechanism for PC/Android/iPhone browser/PWA use, including map metadata and attachment Blobs. Cross-device synchronization remains separate. No storage code was added.

## Verification

- Full `tests/engine`: **692/692 pass**.
- Exploration: **161/161 pass**.
- Syntax checks: pass.
- Native browser verification: **NOT RUN**.

## Remaining limitations

- Normal-motion label-update and final-hit failure are covered by shared adapter/session tests, not a distinct actual-entry normal-motion subprocess.
- Resize/navigation cancellation verifies later search rendering, not later target activation.
- Final graph-label DOM absence after normal-motion success remains unasserted; installed scene/hit IDs and viewer state are asserted.
- Native browser startup/resize/fullscreen/IME/focus/viewer checks not run.
- Creation failure with an existing map still lacks a dedicated actual-entry subprocess assertion.

## Deferred

- Empty-start tutorial slides and Previous/Next/Skip controls.
- Comprehensive UI polish.
- IndexedDB persistence and cross-device sync.
