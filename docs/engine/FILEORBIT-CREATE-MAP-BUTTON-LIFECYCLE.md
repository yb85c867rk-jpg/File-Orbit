# FileOrbit Create Map Button Lifecycle

Status: **FIXED in actual-entry tests — native browser verification NOT RUN**

## Root cause

Button state was assigned ad hoc. A previous submission could leave Back/Replace disabled, and `show()`/`renderPreview()` did not recompute confirmation buttons. Entering confirmation reused stale disabled state.

## Correction

One `syncButtonState()` derives all control availability from:

- dialog open/closed
- current stage (form vs confirmation)
- validated preview presence
- preparation depth
- name composition
- submission-in-progress

Rules:

- Create Map enabled only with a valid preview, no pending preparation/composition, form stage, not submitting.
- Back and Replace enabled only in confirmation with a valid preview and not submitting.
- Both Cancel controls remain available according to the accepted cancellation policy.
- File/folder/name controls disable during submission or preview preparation.
- No control is enabled without a current validated candidate.

Session lifecycle:

- `show()` resets submitting, preparation depth, composition, preview data, retained selection, stage, and re-syncs controls.
- `close()` resets the same state, increments `sessionSeq`, clears preview, and re-syncs.
- `submitCreation()` captures `sessionSeq`; stale completion after close/reopen cannot mutate the next session.
- Submission guards against double execution and disables Back/Replace while installation is active.
- Retryable zero-viewport failure returns to the populated form with Create Map enabled and Back/Replace disabled.
- Back only changes presentation and focus; it does not mutate the map.

## Executable evidence

Actual same dialog instance:

1. Empty startup creates the first map.
2. Reopen, disabled Replace does nothing.
3. Prepare an invalid candidate; Create Map stays disabled.
4. Prepare a valid candidate; Create Map enables.
5. Enter confirmation; Cancel/Back/Replace enabled.
6. Back restores populated form and preview.
7. Re-enter confirmation and double-click Replace; exactly one dataset commit occurs.
8. Reopen; Create/Back/Replace are disabled, Cancel enabled; Cancel preserves the map.
9. Zero-viewport failure leaves Create enabled and confirmation controls disabled; retry succeeds.

Fake DOM click now respects `disabled`, matching browser behavior for these tests.

## Verification

- Full `tests/engine`: **697/697 pass**.
- Exploration: **166/166 pass**.
- Focused dialog/CSS tests: pass.
- Syntax checks: pass.
- Native browser verification: **NOT RUN**.

## Limitations

- Native browser button behavior was not executed.
- Stale async completion is enforced by session sequencing and source assertions; no separate deferred `onCreate` unit harness was added.
- No UI redesign, storage, import/export, Embed, dependencies, commits, pushes, or deployment.
