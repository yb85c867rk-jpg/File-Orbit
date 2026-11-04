# M5 Desktop Navigation Harness

Deterministic browser harness for desktop mouse camera pan/zoom with graph,
labels, selection, and hit geometry kept coherent. No touch, keyboard, inertia,
automatic focus-on-click, opening, previews, search, or file access.

## Run

From the authorized project root:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

```text
http://127.0.0.1:8765/tests/harness/m5-navigation/
```

Equivalent loopback static server rooted at the project root works. Native ESM
requires HTTP; `file://` is not supported.

## Controls

- F20/F200, phase, actual/synthetic DPR.
- Mouse drag pans; pointer capture is owned during drag.
- Wheel zooms anchored at the mouse position.
- Zoom in/out buttons anchor at viewport center.
- Reset camera restores `zoom=1`, `pan=(0,0)`.
- Immediate Focus selected resets camera identity; Reset focus restores base.
- Clear selection, resize, destroy/recreate.
- Labels/icons and indigo selection ring retained.

Camera limits: zoom `0.25..8`, pan magnitude at most `1,000,000` CSS pixels,
drag threshold `4` CSS pixels. Ctrl/Meta wheel events bypass the controller.

## Status

```js
window.__M5_NAVIGATION_STATUS__
```

Contains requested/displayed camera, camera operation, drag/capture state,
handled/ignored navigation event reason, selected/focused IDs, generation,
phase/viewport/DPR, graph/label counts, controller lifecycle/errors, and separately
labeled numerical coordinate/hit probes.

```js
copy(JSON.stringify(window.__M5_NAVIGATION_STATUS__, null, 2))
```

## Limits

Browser navigation verification is **NOT RUN** unless manually executed.
Pointer/timing mocks are not browser smoothness or device evidence. No touch,
keyboard, inertia, or mobile certification is claimed.
