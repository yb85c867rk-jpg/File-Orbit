# FileOrbit Create Map Preparation Ownership

Status: **FIXED in real-dialog deferred tests — native browser verification NOT RUN**

## Root cause

`beginPrepare()` used a shared counter. `choose()` only released it when its `selectionSeq` was still current, so a superseded operation leaked ownership and left Create Map disabled. Other paths released unconditionally and could let an older operation alter state after a newer one or after close/reopen.

## Correction

Preparation ownership is now explicit and session-aware:

- `beginPrepare()` returns a token `{ seq, session, pending }`.
- Only `activePrepare` owns current busy state.
- `ownsPrepare(token)` requires the same token, current session, and open dialog.
- Superseded tokens cannot publish previews, status, errors, or button changes.
- `endPrepare(token)` only clears the owning token; stale tokens are ignored.
- `close()`/`destroy()` abandon the active token and increment `sessionSeq`.
- `show()` starts a new session with no active preparation.

Applied to:

- file picker
- folder picker
- file/directory drops
- map-name updates
- IME completion (composition triggers the same token path)
- cancel/destroy
- close/reopen

`syncButtonState()` remains the single state authority. Create Map enables only when the latest active preparation has finished with a valid preview. Obsolete candidates cannot be submitted.

## Executable deferred real-dialog tests

Using one real `createCreateMapDialog()` instance and controlled promises:

- Picker A pending → item drop B completes → B preview enabled; A finishes later → B remains current; submit installs B once.
- Reverse completion → A finishes while B pending; Create remains disabled and A cannot overwrite B.
- Directory drop A → B in both completion orders; obsolete A success/rejection cannot replace B status or preview.
- Concurrent name updates → only latest name preview wins; invalid latest name blocks creation.
- Close/reopen → session 1 completion cannot alter session 2 busy state, preview, status, buttons, or submission.
- Cancel/destroy → late completion performs no UI update and never submits.
- Existing actual-entry lifecycle (first create, reopen, Back, re-enter confirmation, double submit prevention, disabled click semantics).

## Verification

- Full `tests/engine`: **704/704 pass**.
- Exploration: **173/173 pass**.
- Real-dialog deferred tests: **7/7 pass**.
- Syntax checks: pass.
- Native browser verification: **NOT RUN**.

## Limitations

- Native browser async file/drop behavior not executed.
- Candidate registry cleanup for superseded operations remains owned by the existing shared main preparation/cancellation path; the real-dialog tests verify no obsolete dialog submission/state, while actual-entry tests continue to cover the integrated create/replace path.
- No UI redesign, limits, storage, import/export, Embed, dependencies, commits, pushes, or deployment.
