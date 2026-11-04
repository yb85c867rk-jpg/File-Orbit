# FileOrbit revised Open Orbit submenu — r163

## Baseline
- Product baseline: r162 archive `5F917EB09F3595D207E539AC910A22206A6435EE5AF0FA94FC6C572D0583255B`.
- No OntoMap access. No deployment, publishing, external hosting, paid/enterprise work.

## Implemented workflow
- `Open Orbit` is now a menu trigger, not an opener. Clicking it launches no picker.
- The submenu contains exactly:
  1. `Orbit File`
  2. `Orbit Folder`
- Expanded sidebar: submenu opens beneath Open Orbit.
- Collapsed sidebar: the same labeled flyout opens beside the navigation rail; no sidebar expansion is required.
- Narrow screens: flyout is clamped inside the viewport and remains usable with click/touch.
- Orbit File calls the existing r162 `openDocument()` flow.
- Orbit Folder calls the existing `connectFolder()` flow; it only connects/lists the folder and never generates a map.
- Picker activation happens directly from the user's menu-item click; the submenu closes first.
- Removed the separate three-dot button and Connect Folder-only menu.
- Help text, title, ARIA name, and accessible relationships updated.

## Menu behavior
- Open Orbit exposes `aria-haspopup="menu"`, `aria-expanded`, and `aria-controls="open-orbit-menu"`.
- Menu has `role="menu"`; both actions have `role="menuitem"`.
- Supports Arrow Up/Down, Home, End, Tab/Shift+Tab, Escape, outside pointer dismissal, and focus restoration to Open Orbit.
- The popup framework recalculates on window/orientation/visual-viewport/fullscreen changes.
- Sidebar collapse/expand closes any open flyout to avoid orphaned menus.
- Menu open/close does not modify the current document or edits.

## Browser evidence
Real browser with picker APIs stubbed only for routing observation; this is **not native picker acceptance**.

- Expanded 1200×800: submenu at x8–168 below Open Orbit; both items visible.
- Collapsed 1200×800: flyout at x70–230 beside the 64px rail; both items visible.
- Narrow 390×700: flyout at x70–230, fully inside viewport.
- Parent Open Orbit click: file-picker calls 0, folder-picker calls 0.
- Orbit File: file-picker 1, folder-picker 0; menu closed.
- Orbit Folder: folder-picker 1, file-picker unchanged at 1; menu closed.
- Both picker cancellations preserved the current document and edits.

Screenshots:
- `evidence/native-r121/r163-open-expanded.png`
- `evidence/native-r121/r163-open-collapsed.png`
- `evidence/native-r121/r163-open-narrow.png`
- Data: `evidence/native-r121/r163-open-submenu.json`

## Identity
| Artifact | r163 SHA-256 |
|---|---|
| main.mjs | `2884DCAD6571EBEC859D7343BAF2B899EB399D920B2CE36D5D05D08E9819C785` |
| index.html | `08B5AF477ED95D19E5CF9D202E0935B5FC8F5FEEF426486E7BEC98E56F2CE5D1` |
| shell-controls.js | `C7282FD8F9B13F27B461DA02D92B833752BB3AC92B9BDD8F0C2405B7F0E7EDE0` |
| orbit-panel.js | `6FCD0226B3F4ADFC958B116DB43CAEE9DCF177CA3224095854EC1754FBA94ECB` |
| open-workflow-main.test.mjs | `008D0554ED50B25DFDEF48DD7CB5AC833C4AFBD60E16227158562C1771476239` |
| main-harness-init-runner.mjs | `8D2EED12A2E616913ADCA36754CFBA1839A9CDEA3006118CAA0100E68A467595` |

## Test coverage
- Updated r162 workflow tests for collapsed/expanded submenu, zero picker calls on parent, both choices, Escape, outside click, resize, sidebar toggling, keyboard movement, and focus restoration.
- Removed two obsolete integrated file-open-browser scenarios rather than skipping them; the replacement workflow and folder sidebar are covered by the updated opening tests.
- Preserved direct-open validation, writable identity/baseline, same-file Save, folder listing, unsaved guards, conflict modal, and single cancellation message.

## Tests
Focused navigation/opening/Orbit/automatic/conflict: **30/30 PASS**.

Full serial result:
- p1b-main: **69/69**.
- Remaining: **1,067 tests = 1,066 pass, 1 skip, 0 fail**.
- Aggregate: **1,136 tests = 1,135 pass, 1 skip, 0 fail**.
- Both serial parts exited 0.
- Only skip: existing fake IndexedDB concurrency limitation. The two obsolete integrated file-open-browser tests were removed rather than skipped; their replacement coverage is the revised submenu and opening workflow.

## PASS / FAIL / NOT RUN
**PASS**
- Open Orbit opens only the submenu; no picker on parent activation.
- Exactly Orbit File and Orbit Folder.
- Both choices available expanded and collapsed; collapsed flyout beside icon.
- File/folder routing and submenu close.
- Keyboard, Escape, outside-click, resize, toggle behavior, focus restoration.
- Folder connection/list/refresh preserves current map.
- Direct file saves to original handle; external conflict detection preserved.
- Unsaved guards, Save As, conflict modal, and r161 feedback preserved.
- Desktop/narrow containment and touch/click activation.
- 300-node, attachment limits, icon/badge, #E74C3C behavior unchanged.

**FAIL**
- None observed in focused automated or browser-routing checks.

**NOT RUN**
- Real native OS file/folder picker acceptance.
- Native two-window disk hash and `"Conflict test B"` reopen.
- Actual Android/iOS device check.
- Independent native Save/Open after this change.

Free-edition acceptance remains **INCOMPLETE** pending native picker and disk/description verification.
