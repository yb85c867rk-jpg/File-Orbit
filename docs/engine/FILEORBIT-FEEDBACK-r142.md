# Routine feedback presentation — r142

## Policy

Routine success, completion, refresh, and cancellation notices are **nonvisual**. They remain in the existing polite live region for assistive technology but are not rendered as a graph box.

- The feedback host is **not** hidden by CSS.
- Actionable, progress, and save-feedback controls remain visible.
- Routine status uses structured `data-feedback-kind="routine"` styling: absolute, clipped, no border, padding, or layout space.
- The prior requirement for a visible four-second routine notification is superseded. Routine text may still be cleared internally by its timer, but it has no visual presentation at any point.

Routine examples covered: Opened, Created, Saved, Copied, Download handoff, fullscreen entered/exited, folder selection/refresh, picker cancellation, and other successful completion messages.

Visible feedback is retained for:
- save/write failures;
- Automatic Save paused/blocked and its Retry/Save As controls;
- permission and external-change conflicts;
- recovery durability warnings;
- necessary progress and cancellation controls;
- invalid drag/drop guidance.

## Resolution and ownership

- Owned progress resolves only its matching scope, then publishes a routine completion.
- Routine completion leaves no visible box or reserved space.
- Unrelated routine notices cannot replace actionable feedback.
- Operation scopes check operation, document ownership, session, and dataset. Legitimate install transitions renew the scope deliberately.
- Obsolete scopes cannot clear replacement-session feedback.
- Nonvisual announcements stay in `#shell-status` (`role="status"`, `aria-live="polite"`); hidden actionable controls are not focusable and no focus is stolen.

## Preserved

Settings remains Theme-only; header remains logo-only; permanent document information remains hidden at 0x0. `.orbit` handling, Create/Open/Save/Copy/Download, automatic Save, editor Retry, recovery, branding, sidebar/help, Orbit listing, and tooltip rules are unchanged.

## Verification

- Focused feedback/Open/automatic Save/Copy/Download/fullscreen/layout: 90/90.
- P1B main-entry: 69/69.
- Full engine: 1103 tests, 1102 passed, 1 skipped, 0 failed.
- Browser: routine status is 0-width/clipped while actionable feedback remains normal; host has 0x0 space; startup glyph and fullscreen controller work.
- Exact archive focused: 17/17.
- Native checks: NOT RUN.
