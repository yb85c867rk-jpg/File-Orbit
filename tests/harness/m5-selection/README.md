# M5 Node Selection Harness

Deterministic browser harness for mouse hit testing and selection highlighting
over the static Hypertree graph and labels. No opening, focus/recentering,
touch/keyboard, preview, search, or file access is implemented.

## Run

From the authorized project root:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8765/tests/harness/m5-selection/
```

Any equivalent static loopback server rooted at the project root works. Native
ESM imports require HTTP; `file://` is not supported.

## Controls

- F20/F200 fixture and current/start/end phase.
- Actual or synthetic DPR 1/1.25/2/3.
- Clear selection.
- Resize invalidates the old hit snapshot before replacing the canvas geometry.
- Recreate/destroy rebuild or remove owned canvas, labels, and selection
  controller.
- Click a rendered node to select it; click empty canvas to clear.
- No node activation, opening, focus movement, or file access.

## Status

```js
window.__M5_SELECTION_STATUS__
```

Reports selected ID/name, controller generation/frame, graph drawn counts, label
counts, canvas/backing sizes, DPR, lifecycle, errors, and `lastEvent` from actual
user clicks. `numericalProbe` is separately marked: it is a pure hit-test probe,
not a user click. Browser interaction verification is **NOT RUN**.

## Hit limitations

Zero extra hit padding is used. Very small peripheral nodes remain difficult to
click. Focus/zoom, touch, keyboard, and accessibility navigation are later work.
Labels remain `pointer-events:none`; clicking label text outside a node does not
select a node.
