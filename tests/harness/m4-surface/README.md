# M4 Canvas Surface Harness

Standalone browser calibration harness for the M4 Canvas foundation. It draws
only axes, calibration marks, and a sample unit circle. It does **not** render
graph nodes/edges, labels/icons, or the Obsidian-inspired UI.

## Run

From the authorized project root:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8765/tests/harness/m4-surface/
```

If Python is unavailable, use any static loopback file server rooted at the
project root. Native ESM imports require an HTTP origin; opening `index.html`
directly via `file://` is not supported.

## Controls

- **Resize / refresh**: measures the host content box (border/padding excluded) and calls `surface.resize()` on the existing live canvas. Canvas identity must be preserved.
- **Recreate surface**: destroys and creates a new canvas independently.
- **Destroy surface**: idempotently removes only the harness-owned canvas.
- **DPR source**: `actual browser DPR` is distinguished from synthetic
  `1`, `1.25`, `2`, `3` cases. DPR changes call `surface.resize()` on the
  existing instance; synthetic cases are labeled `source: "synthetic"`.

## Machine-readable status

The page sets:

```js
window.__M4_SURFACE_STATUS__
```

with observed CSS/backing sizes, actual DPR, selected/synthetic DPR, effective
scales, operation (`create`/`resize`/`recreate`/`draw`/`destroy`), whether canvas
identity was preserved, surface state, errors, and numerical projection/inverse
round-trip observations. The visible `<pre>` shows the same JSON. `status.json`
is the static NOT_RUN checkpoint, not a live observation.

`toClient`/`fromClient` are translation-only. The supplied origin must be the
canvas drawable content origin; CSS transforms (scale/rotate/skew/perspective),
canvas border/padding, and content-to-border offsets are not inferred. This
harness has no canvas border/padding and explicitly excludes the host border
and padding from its content size and drawable origin.

## What this does not establish

Mocked Node tests and this harness do not establish graph rendering, browser/
device compatibility, GPU memory release, or full M4 completion. Actual browser
verification for this slice is **NOT RUN** unless run manually through the
loopback page above and recorded separately.

