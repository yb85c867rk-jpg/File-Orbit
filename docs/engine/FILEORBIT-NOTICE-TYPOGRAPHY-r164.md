# FileOrbit submenu typography and bottom notices — r164

## Baseline
- Product baseline: r163 archive `49D6F83898B1EB89901943286C1B9BD44F8FD78A26FD894955F2D3B56E687542`.
- No OntoMap access. No deployment, publishing, external hosting, paid/enterprise work.

## Submenu typography
- Scoped styles only to `#open-orbit-action .nav-label` and `#open-orbit-menu button`.
- Computed sizes in a real browser:
  - Open Orbit parent label: **14px**, regular 400, navigation font family.
  - Orbit File / Orbit Folder: **13px**, regular 400, same family.
- Both items retain a **36px high** click/touch target and 148px usable width.
- Same computed 13px applies expanded, collapsed, and 390px narrow menus.
- No other menu is restyled.
- r163 two-choice routing, keyboard behavior, and ARIA relationships preserved.

## Bottom notifications
- `#feedback-host` is repositioned from the map viewport bounds, not a fixed left offset:
  - center = map viewport center;
  - bottom = 20px above the map viewport bottom;
  - width = min(560px, map width − 32px, viewport width − 32px).
- Recalculates through a viewport ResizeObserver and window resize; works with rail/Details expanded or collapsed.
- Long text wraps; `#shell-status` is full-width and centered in the notice.
- Real-browser containment:
  - 1200×800, rail collapsed/Details expanded: map 835×722; notice 560px wide, center delta 0, 20px bottom clearance.
  - 1200×800, rail expanded/Details collapsed: map 867×722; notice center delta 0, inside.
  - 390×700: map 326×520; notice 294px wide at x80–374, y584.6–635, inside.
- Save-recovery controls remain in `#save-feedback` even after its message text dismisses.

## Auto-dismiss
- Added `TRANSIENT_NOTIFICATION_MS = 3000`.
- Transient notices use a fresh 3000ms timeout; replacing a notice clears the prior timer.
- Older timer callbacks preserve newer messages.
- Expiry clears text, sets `hidden`, removes display and pointer interception (`display:none`, `pointer-events:none`).
- Same-message updates reset the timer without rewriting/duplicate announcement.
- Save-feedback text dismisses after ~3s while Retry Save / Save As remain visible and usable.
- Editor feedback stays in the editor panel; conflict dialogs, validation errors, forms, and confirmations are not auto-dismissed.
- Dismissal changes no document identity, dirty state, edits, or recovery controls.
- Destroy clears notification and save-feedback timers and disconnects positioning observation.

## Identity
| Artifact | r164 SHA-256 |
|---|---|
| main.mjs | `54F4A6D2C3538ADC7F036CFAFDB2B5F47AE86104D1826ABD1E773934D7ED4B00` |
| index.html | `243646B689022C4C0C9734A37A339723D828E8B6676B8AC5B20414DC973C4FFC` |
| main-harness-init-runner.mjs | `C8C13C0FCCF8D7C2E2F49C0E4132C8A09CE39BD1C9D3F455FFCAA2FFFF582460` |

## Browser evidence
- `evidence/native-r121/r164-menu-expanded.png`
- `evidence/native-r121/r164-menu-collapsed.png`
- `evidence/native-r121/r164-menu-narrow.png`
- `evidence/native-r121/r164-notice-desktop.png`
- `evidence/native-r121/r164-notice-dismissed.png`
- `evidence/native-r121/r164-notice-panels.png`
- `evidence/native-r121/r164-notice-narrow.png`
- `evidence/native-r121/r164-typography-notice.json`
- `evidence/native-r121/r164-notice-panels.json`

## Tests
Focused navigation/opening/Orbit/automatic/conflict/feedback: **31/31 PASS**.

Full serial result:
- p1b-main: **69/69**.
- Remaining: **1,067 tests = 1,066 pass, 1 skip, 0 fail**.
- Aggregate: **1,136 tests = 1,135 pass, 1 skip, 0 fail**.
- Both serial parts exited 0.
- Only skip: existing fake IndexedDB concurrency limitation.

## PASS / FAIL / NOT RUN
**PASS**
- Parent 14px / submenu 13px computed sizes and regular navigation font.
- 36px targets retained in expanded/collapsed/narrow states.
- Scoped typography; other menus unaffected.
- Bottom-center notice within actual map bounds with 20px clearance.
- Panel and viewport resize repositioning.
- Narrow wrapping and containment.
- Three-second auto-dismiss, timer replacement, older-callback protection.
- Hidden/pointer-free after dismissal.
- Save-recovery controls remain.
- Dirty state, identity, edits, conflict modal, and editor recovery preserved.
- r163 submenu workflow and keyboard behavior preserved.

**FAIL**
- None observed in focused automated or browser checks.

**NOT RUN**
- Real native OS file/folder picker acceptance.
- Native two-window disk hash and `"Conflict test B"` verification.
- Actual Android/iOS device check.
- Independent native Save/Open after this change.

Free-edition acceptance remains **INCOMPLETE** pending native picker and disk/description checks.
