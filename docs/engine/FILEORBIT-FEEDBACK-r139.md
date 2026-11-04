# Bottom-left feedback refinement — r139

## Permanent document information removed

The permanent bottom-left document box (`ontology.orbit — outside Orbit · Saved`) is no longer visible. `#document-feedback` remains in the DOM only as `hidden`/`aria-hidden` internal diagnostics so document identity, destination, dirty state, and savedRevision updates continue to power internal state and existing diagnostics. It has zero layout size and reserves no space. Settings remains Theme-only; header remains logo-only.

## Feedback policy

Feedback is structured, not determined by English message text.

### Routine (`setRoutineStatus`)
- Explicit lifecycle messages such as opened, created, copied, browser download handoff, cancellations, deletion, local save, and replacement cancellation.
- Auto-hide after approximately 4 seconds (`ROUTINE_NOTIFICATION_MS = 4000`).
- A new routine notification replaces the previous routine timer.
- Routine lifecycle resolution uses explicit `force` metadata to replace a prior progress/actionable status for the same workflow; unrelated routine calls are suppressed while actionable/progress is visible.
- Unrelated routine notifications are suppressed while actionable/progress feedback is visible.

### Actionable / progress (`setShellStatus` default)
- Save failures, automatic-save paused/blocked feedback, permission/external-file conflicts, recovery warnings, pending decisions, Retry/Save As controls, and progress remain visible until their existing resolution or lifecycle invalidation.
- No automatic expiry.
- Routine notices cannot dismiss the separate `#save-feedback` controls. Repeated conflict Cancel leaves Retry/Save As usable and performs no writes.

### Timer ownership
- Each status has a monotonically increasing identity token.
- Expiry captures document ownership, session, and dataset; it only clears the exact current routine.
- Previous timers are cleared on replacement; obsolete callbacks cannot clear newer feedback.
- `destroy()` clears the timer/callback.
- Live regions (`role="status"`, `aria-live="polite"`) and actionable keyboard controls remain.

## Verification
- Focused feedback/automatic Save/editor Retry/Open/navigation suites: 112/112 passed.
- Full engine: 1103 tests, 1102 passed, 1 skipped, 0 failed.
- Browser: permanent box absent with zero host/document height; routine fullscreen notification appeared then auto-hid by 4.3 seconds; dark/light desktop/narrow screenshots.
- Exact archive focused: 32/32.
- Native filesystem checks: NOT RUN.

No `.orbit` handling, Create/Open/Save/Copy/Download, autosave/conflict/recovery, editor/drag/history, branding, sidebar/help, Orbit listing, or tooltip behavior changed. No database reset, user-document modification, dependency installation, commit, push, deployment, server shutdown, or unrelated change.
