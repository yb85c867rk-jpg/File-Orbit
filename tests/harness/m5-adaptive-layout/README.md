# M5 Adaptive Layout Comparison Harness

**EXPERIMENTAL.** The legacy-compatible radial layout remains the default. This
harness compares it with an opt-in density-aware staged layout.

## Run

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

```text
http://127.0.0.1:8765/tests/harness/m5-adaptive-layout/
```

## Controls

- Fixtures: F20, F200, crowded folder, dense neighbors, mixed deep/wide, long
  labels, infeasible depth.
- Layout: baseline or experimental.
- Experimental configuration: minStep, radialFlex, branchWeight,
  demandCompression.
- Phase, actual/synthetic DPR, mouse navigation (drag/wheel/buttons), reset
  camera, immediate Focus selected/Reset focus, selection, resize,
  destroy/recreate.
- Apply layout rebuilds the staged base, resets focus/camera/selection, draws
  graph/labels, and installs matching hit geometry.

Experimental layout changes do not modify the baseline source or default path.
Animated focus is not integrated into this harness.

## Metrics

Both modes are measured with the same fixture, viewport, node dimensions,
label budget, and presentation:

- visible rendered node count;
- pairwise shape-aware circle/diamond overlap count;
- label candidate/created/visible/suppressed counts (temporary DOM overlay);
- radial spread by structural depth;
- minimum visible node center separation;
- occupied node-shape bounds;
- staged layout elapsed time.

Node metrics are O(N²) diagnostics for bounded fixtures. Label suppression is
reported separately from node overlap. Measurement cost is not included in
layout elapsed time.

## Status

```js
window.__M5_ADAPTIVE_LAYOUT_STATUS__
```

```js
copy(JSON.stringify(window.__M5_ADAPTIVE_LAYOUT_STATUS__, null, 2))
```

Status includes requested/displayed layout mode and configuration, numerical
layout bounds/validation, baseline vs experimental metrics, selection/focus,
camera/controller metadata, lifecycle, errors, and measurement provenance.

Browser visual comparison is **NOT RUN** unless manually executed. Node tests
cannot establish visual superiority or usability.
