# FileOrbit Open browser — r124 bounded keyboard-focus correction

Status: implemented. Relevant browser/navigation/stale-ownership suites: **19/19 passed**. Full engine: **1083 tests, 1082 passed, 1 skipped, 0 failed**.

## Defect

The integrated Open map browser derived tab order from an explicit array:

`Choose/Change folder, Refresh, Open elsewhere, Close, map rows`

The actual DOM order is:

`Choose/Change folder, Refresh, map rows, Open elsewhere, Close`

With a populated Orbit list this caused:

- Shift+Tab from the first control to focus the last map row instead of Close;
- Tab from Close not to wrap;
- Tab from the last map row to skip the footer controls.

## Correction

- `allControls()` now derives focusable controls from `card.querySelectorAll('button')`, preserving actual DOM order.
- Hidden, disabled, and disconnected controls are excluded from tab cycling.
- Tab and Shift+Tab are handled explicitly across the filtered list; the last control is Close and the first is Choose/Change folder.
- Empty and unsupported-directory states use the same control-order logic.
- `renderRows()` preserves focus when Refresh/list replacement removes the focused row: it focuses the matching row, else the first row, else Refresh/Choose.
- All map rows remain reachable; footer controls remain reachable after the final row.
- No automatic-save or Settings cleanup work was started.

## Verification

- Populated-list tests cover:
  - Shift+Tab from the first control wraps to Close;
  - Tab from Close wraps to the first control;
  - Tab from a map row reaches the footer instead of prematurely wrapping;
  - focus remains usable after list replacement/Refresh;
  - empty and unsupported-directory states.
- Relevant browser/navigation/stale-ownership suites: **19/19 passed**.
- Full engine: **1083 tests, 1082 passed, 1 skipped, 0 failed**.
- Native keyboard checks: **NOT RUN** — the available harness browser is headless and cannot represent native user keyboard/picker interaction. Browser/mock unit tests are separate evidence.

## Boundaries

- No native picker/write/keyboard acceptance claim.
- Android/iPhone/Firefox/Safari NOT RUN.
- Preflight-to-write race, empty/partial leftovers, no automatic cleanup, stale Open Orbit controller selection, no persisted Orbit handle, no watching/recursion/rename/delete/sync.
- No atomic/exclusive creation, compare-and-write, rollback, or crash durability claim.
