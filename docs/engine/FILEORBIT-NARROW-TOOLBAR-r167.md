# FileOrbit narrow-screen toolbar wrapping — r167

## Baseline
- Product baseline: r166 archive `D75476C25A91642791D66EBA4357933AF7C895500EA69C72B63BB49A1F840DAA`.
- No OntoMap access. No deployment, publishing, external hosting, paid/enterprise work.

## Cause
At phone widths the layout reserves 64px for the fixed navigation rail. On a 375px viewport the map/toolbar budget is only **295px** after the 16px toolbar margin. Seven 44px touch targets need:

`7×44 + 6×3 gap + 8 padding + 2 border = 336px`

so Download wraps. At 390px the budget is 310px and still insufficient. At 430px the budget is 350px, so all seven already fit.

## Fix
- Kept 44px touch targets and icon sizes.
- Reduced mobile toolbar gaps/padding before considering smaller buttons.
- Added the existing popup-menu/action-menu pattern at `max-width: 415px`:
  - Embed and Copy Map move into a **More graph actions** menu;
  - Search, Undo, Redo, Fullscreen, More, and **Download remain in one row**;
  - the menu routes to the existing hidden action buttons, preserving action logic and availability (Copy Map stays disabled when unavailable).
- At 416px+ all seven controls return to the row; at 430px all seven fit as before.
- The More button is hidden above 415px.
- No actions removed; accessible names/tooltips remain on the original controls; More menu items are labeled.
- No horizontal page/toolbar overflow.
- Download action order remains last.

## Identity
| Artifact | r167 SHA-256 |
|---|---|
| main.mjs | `F5D963A79495D66CC15C72E21B47FB3D36E520841A059532048647899F589CF9` |
| index.html | `40342F23B58C8B54EC78E72E47A83A48C131823B8436B4C8252A3740F025C533` |
| main-harness-init-runner.mjs | `8F94D2FA085EFD6C9845A678BDA51C20ED299BEE46E5609AD22BC74ED86EFEDD` |

## Browser viewport evidence
Emulated Chromium viewports, not actual iPhone Safari.

| State | Rows | Download same row | Visible controls | Toolbar overflow |
|---|---:|---:|---|---:|
| Before 375×812 | 2 | No | 7 (Download wraps) | 0 |
| After 375×812 | 1 | Yes | Search, Undo, Redo, Fullscreen, More, Download | 0 |
| Before 390×844 | 2 | No | 7 (Download wraps) | 0 |
| After 390×844 | 1 | Yes | same six controls | 0 |
| Before 430×932 | 1 | Yes | all seven | 0 |
| After 430×932 | 1 | Yes | all seven | 0 |
| After 667×375 landscape | 1 | Yes | all seven | 0 |
| After 1200×800 desktop | 1 | Yes | all seven | 0 |

- Before 375: toolbar height 99px, graph top 135, map height 632.
- After 375: toolbar height 50px, graph top 86, map height 681.
- After 375 with rail expanded and Details collapsed: one row, graph height 594.
- More menu at 375: x207–367, fully inside; Embed enabled, Copy Map disabled without a map.
- Activating Embed from More closes the menu and opens the existing embed dialog.
- Desktop toolbar: 262×42, one row, More hidden.

Screenshots:
- `evidence/native-r121/r167-before-375.png`
- `evidence/native-r121/r167-before-390.png`
- `evidence/native-r121/r167-before-430.png`
- `evidence/native-r121/r167-after-375.png`
- `evidence/native-r121/r167-after-390.png`
- `evidence/native-r121/r167-after-430.png`
- `evidence/native-r121/r167-after-375-panels.png`
- `evidence/native-r121/r167-after-375-menu.png`
- `evidence/native-r121/r167-after-landscape-667.png`
- `evidence/native-r121/r167-after-desktop.png`
- Data: `evidence/native-r121/r167-toolbar.json`

## Tests
Focused navigation/shell/opening/automatic/conflict/copy-encoding: **43/43 PASS**.

Full serial result:
- p1b-main: **69/69**.
- Remaining: **1,067 tests = 1,066 pass, 1 skip, 0 fail**.
- Aggregate: **1,136 tests = 1,135 pass, 1 skip, 0 fail**.
- Both serial parts exited 0.
- Only skip: existing fake IndexedDB concurrency limitation.
- Existing Copy Map encoding test was stabilized to wait for the asynchronous post-open verification baseline snapshot; no product save logic changed.

## PASS / FAIL / NOT RUN
**PASS**
- 44px touch targets retained; no tiny controls.
- Download remains visible and in the same row at 375/390/430/landscape/desktop.
- All actions preserved; Embed/Copy reachable from More on narrow.
- More menu inside viewport; action routing and Copy availability.
- Icon order, accessible names, tooltips.
- Sidebar expanded/collapsed and Details collapsed/expanded states.
- No horizontal overflow.
- Map/toolbar geometry recomputed after the one-row toolbar.
- Desktop layout and existing actions unchanged.
- Opening, saving, recovery, conflict protection, notifications, free limits unchanged.

**FAIL**
- None observed in focused browser/automated checks.

**NOT RUN**
- Actual iPhone Safari device verification.
- Native OS picker/disk and `"Conflict test B"` verification.
- Actual Android/iOS device check.
- Independent native Save/Open after this change.

Free-edition acceptance remains **INCOMPLETE** pending actual-device and native checks.
