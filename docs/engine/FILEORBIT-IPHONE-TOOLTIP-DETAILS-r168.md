# FileOrbit iPhone tooltip and landscape Details — r168

## Baseline
- Product baseline: r167 archive `23421FD60B8E7F0F9EFB89AF5EF8B01E89329C52444F0F4D1FA194E8195B05A5`.
- No OntoMap access. No deployment, publishing, external hosting, paid/enterprise work.

## 1. More label ownership
### Cause
The persistent label came from **both** sources:
- The More button had a native `title="More graph actions"`.
- The app tooltip controller also displayed the same text; on touch there was no `pointerleave`/blur to hide it and no auto-dismiss timer.

The browser-native title cannot be reliably timed by app JavaScript.

### Fix
- On touch-capable devices, remove native `title` attributes from toolbar controls and keep `aria-label` as the accessible name.
- A toolbar `MutationObserver` strips dynamically re-added titles (history/fullscreen/copy updates) on touch.
- Desktop keeps native titles and hover tooltips.
- The app tooltip now owns touch timing:
  - shows from `data-tooltip` / `aria-label`;
  - hides after **1500ms**;
  - clears its timer and uses a token so older callbacks cannot hide a newer tooltip;
  - hides immediately on More press/menu open, menu-item selection, outside pointerdown, and `orientationchange`;
  - does not close or time out the action menu itself.

The More button now has `data-tooltip="More graph actions"`.

Browser emulation confirmed:
- on touch, every toolbar action title is `null`, while `aria-label` and `aria-haspopup` remain;
- More tooltip appears on focus and is hidden after ~1.5s;
- menu stays open after 1.7s;
- selecting Embed closes the menu and hides the tooltip;
- outside tap hides the tooltip;
- rotation hides the tooltip;
- desktop keeps its native title and hover tooltip beyond 1.65s.

Evidence:
- `evidence/native-r121/r168-tooltip.json`
- `evidence/native-r121/r168-portrait-tooltip-375.png`
- `evidence/native-r121/r168-portrait-menu-375.png`
- `evidence/native-r121/r168-orientation-tooltip-menu.json`

## 2. Phone-landscape Details default
### Cause
Responsive Details previously only recognized `max-width: 560px`. Phone landscape is wider than 560px, so it took the desktop path and opened Details.

### Fix
Added a phone-landscape layout mode:
`touch-capable + width > height + height <= 560 + width <= 1000`

- Initial phone-landscape load starts Details collapsed.
- Entering phone landscape from portrait collapses Details once.
- Manual expansion remains expanded through ordinary resizes/browser-bar changes.
- Re-entering landscape collapses again; portrait behavior is unchanged.
- Desktop remains expanded by default.
- Uses the existing `data-collapsed`, hidden content, `aria-expanded`, and label toggle.
- If an editor form is active, existing protection prevents collapsing; draft/input/focus remain available.
- Orientation is treated only as a layout change; no document state is reset.
- `scheduleViewportResize()` recomputes map/canvas geometry and hit testing.

Browser emulation measurements:

| State | Details | aria-expanded | Graph height |
|---|---|---|---|
| Initial 844×390 landscape | collapsed | false | 300px |
| Manual landscape expand | expanded | true | 300px |
| Landscape resize 820×390 | remains expanded | true | 300px |
| Rotate to 390×844 portrait | collapsed | false | 713px |
| Re-enter 844×390 landscape | collapsed | false | 300px |
| Desktop 1200×800 | expanded | true | — |

Editor state across 375×812 → 844×390 → 390×844:
- map remained loaded;
- form remained open;
- same input element, token, focus, and draft value `draft landscape`;
- Details stayed open because editing was active;
- toggle disabled while the form is open.

Root-node hit testing at viewport center returned the same root id after each rotation.

Evidence:
- `evidence/native-r121/r168-details.json`
- `evidence/native-r121/r168-details-rotate.json`
- `evidence/native-r121/r168-editor-state.json`
- `evidence/native-r121/r168-hit-rotation.json`
- `evidence/native-r121/r168-landscape-initial-844.png`
- `evidence/native-r121/r168-landscape-expanded-844.png`
- `evidence/native-r121/r168-portrait-to-landscape-844.png`
- `evidence/native-r121/r168-back-to-portrait-390.png`
- `evidence/native-r121/r168-editor-landscape-844.png`
- `evidence/native-r121/r168-portrait-375.png`

## Identity
| Artifact | r168 SHA-256 |
|---|---|
| main.mjs | `8136C727CC19643D3AC3CC2635C664BDF896DE782E87501A52B3BCE7E966E9B4` |
| shell-controls.js | `46FA0A56B9DB5AA93F658082C2654FA0956532A84184C795597A711A0B823F1B` |
| index.html | `8485ADD0E1D30954BAEED0739CFD12FEDBB76899E959F99E0FBC6AB16A76CEF0` |
| main-harness-init-runner.mjs | `51D756C0051334C584B1CA636E9B8B7249841B42B7F25FD47596C149CE6B2FAB` |

## Tests
Focused tooltip/navigation/responsive/layout/sidebar/opening/automatic/conflict: **33/33 PASS**.

Full serial result:
- p1b-main: **69/69**.
- Remaining: **1,068 tests = 1,067 pass, 1 skip, 0 fail**.
- Aggregate: **1,137 tests = 1,136 pass, 1 skip, 0 fail**.
- Both serial parts exited 0.
- Only skip: existing fake IndexedDB concurrency limitation.
- Test-only stabilization: the saved-map usage scenario now waits for the asynchronous usage section; no product storage behavior changed.

## PASS / FAIL / NOT RUN
**PASS**
- Native title removed on touch; accessible name/menu relationship preserved.
- App tooltip auto-dismisses at ~1.5s; timer replacement safe.
- Tooltip hides on menu open, item selection, outside tap, rotation.
- More menu remains usable independently of tooltip timing.
- Desktop native title and hover tooltip retained.
- Initial/entered phone landscape Details collapsed via existing toggle state.
- Manual landscape expansion persists through resizes.
- Portrait behavior and desktop Details behavior preserved.
- Editor draft/form/focus preserved through rotation.
- Map geometry and hit testing recomputed.
- r167 single-row toolbar and action availability retained.
- Opening/saving/recovery/conflict/notification/free limits unchanged.

**FAIL**
- None observed in focused automated or browser-emulation checks.

**NOT RUN**
- Actual iPhone Safari device verification; all evidence is Chromium viewport/touch emulation.
- Native OS picker/disk and `"Conflict test B"` verification.
- Actual Android/iOS device check.

Free-edition acceptance remains **INCOMPLETE**.
