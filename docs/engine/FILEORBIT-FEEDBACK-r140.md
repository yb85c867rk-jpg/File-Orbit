# Feedback corrections — r140

## R1 — routine notifications no longer overwrite critical feedback

`setRoutineStatus()` no longer supplies unconditional `force`. Feedback publication now uses operation scopes:

- `beginShellFeedback(message)` creates an operation token bound to document ownership.
- `setShellStatus()` stores the scope for progress feedback.
- A routine completion can replace progress only when it passes `resolves` with the matching operation scope.
- Unrelated routine Cancel/Copy/fullscreen/completion notices cannot replace actionable recovery/conflict feedback.
- Once an owned scope resolves, future unrelated routine notices are allowed again; the system does not globally suppress feedback.
- Critical feedback is cleared only by its owning successful resolution or legitimate lifecycle replacement.

## R2 — toolbar Download handoff

- `downloadBackup()` publishes `Preparing download…` as explicit progress with a scope.
- Successful browser handoff publishes `Download prepared. Browser download handoff started; saving the file is not guaranteed.` as a routine notification with the configured ~4 second expiry.
- The handoff resolves only the download operation's progress.
- Download preparation failures remain actionable/persistent with `Download failed: …`.
- Cancellation resolves the owning download progress to the routine cancellation notice.
- A second download click while busy no longer overwrites the active preparation progress with a guard error.

## Preserved

Permanent document information remains hidden with zero layout; Settings remains Theme-only; automatic Save conflict Retry/Save As behavior, `.orbit` handling, Open/Create/Copy/Download, editor, recovery, branding, sidebar/help, and tooltip behavior are unchanged.

## Verification

- P1B main-entry: 69/69 passed.
- Focused feedback/automatic Save/Open/navigation/Copy/Recovery: 91/91 passed.
- Full engine: 1103 tests, 1102 passed, 1 skipped, 0 failed.
- P1B main-entry: 69/69 passed.
- Native checks: NOT RUN.

Feedback timers remain token/ownership/session/dataset guarded; obsolete callbacks are cleared on replacement/destroy. No text matching is used.
