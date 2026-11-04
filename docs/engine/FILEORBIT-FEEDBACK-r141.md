# Feedback and startup corrections — r141

## R1 — production-shaped startup

- Restored `FULLSCREEN_ENTER_GLYPH` and `FULLSCREEN_EXIT_GLYPH` before `createFullscreenController` construction.
- The shared main-entry DOM now contains the production `button#fullscreen-action > svg > path#fullscreen-glyph` structure with initial `Enter fullscreen` label/tooltip.
- Startup therefore exercises the real fullscreen glyph reference instead of optional chaining over a missing element.
- Fullscreen enter/exit assertions cover glyph `d`, accessible label, and tooltip.
- The optional development-only `#fit` binding is guarded so production-shaped HTML initializes without an exception; no control was removed or callback bypassed.

## R2 — unrelated progress feedback

- `setShellStatus()` now refuses **progress** publication while actionable feedback is visible.
- `beginShellFeedback()` returns a scope only when progress actually owns presentation. Download continues normally, but warning feedback is not erased.
- R2 reproduction now holds the warning through Download start, completion, cancellation, and expiry.
- Normal Download with no critical feedback remains: `Preparing download…` progress → routine handoff with 4-second expiry.
- Genuine `Download failed: …` remains actionable.
- Automatic-save Retry/Save As behavior remains.

## Scope validation

- Removed the duplicated ownership comparison.
- Scope matching now checks operation, ownership, session, and dataset explicitly.
- Legitimate document/session install transitions renew the owning scope deliberately via `renewShellFeedbackScope()` at save/open/import/download completion.
- Obsolete scope resolution fails after replacement and cannot clear replacement-session feedback.

## Verification

- P1B main-entry: 69/69.
- Focused startup/fullscreen/feedback/Download/Open/automatic Save/navigation/Copy/layout: 90/90 passed.
- Full engine: 1103 tests, 1102 passed, 1 skipped, 0 failed.
- Browser startup: no runtime exceptions; production glyph present; hidden document box 0x0.
- Exact archive focused: 17/17 passed.
- Browser native fullscreen toggle: NOT RUN (headless fullscreen unsupported); automated main-entry enter/exit glyph test passed.
- Native checks: NOT RUN.
