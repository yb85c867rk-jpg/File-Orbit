# M5 Viewport-Recovery Contract — Fit Camera

- Status: **IMPLEMENTED for the experimental adaptive-layout harness only**.
- Baseline/v1/v2 layout formulas, fixtures, demand allocation, workspace selection, and glyph policy are unchanged.
- Browser fit verification: **NOT RUN**.

## 1. Pure fit calculation

API: `calculateFitCamera(input)` in
`src/engine/hypertree/navigation/fit.js`.

Input describes base-CSS geometry **before camera application**:

```text
nodes          array/Map of {id, center:{x,y}, radius, visible}
viewport       actual CSS width/height
padding        number or {x,y}
presentation   {kind:'fixed', glyphRadiusCss} or {kind:'native'}
projectionScale actual workspace/projection scale (metadata)
limits         {minZoom, maxZoom, maxPanCss,...}
```

The camera equation is unchanged:

```text
screen = viewportCenter + pan + zoom * (baseCss - viewportCenter)
```

Fit derives `pan` from the fitted base center:

```text
panX = -(baseCenterX - viewportWidth/2) * zoom
panY = -(baseCenterY - viewportHeight/2) * zoom
```

It does not assume `pan=0`.

### Sizing

- **Fixed glyphs**: `available = viewport - 2*padding - 2*glyphRadius`;
  glyph extents are screen-fixed.
- **Native glyphs**: base bounds include node radii; screen radius scales with
  `zoom`.
- Every eligible node's full glyph box is checked after fitting.
- Tolerance: **1e-6 CSS px**.

### Defined cases

- empty eligible set: `ok:true`, `empty:true`, reset camera;
- single node: zoom 1 if contained, otherwise normal fit bounds;
- zero/non-finite viewport: `invalid-viewport`;
- invalid node geometry: `invalid-geometry`;
- padding larger than viewport: `padding-exceeds-viewport`;
- required zoom below `limits.minZoom`: `min-zoom-exceeded`, camera `null`;
- required zoom above `maxZoom`: `max-zoom-exceeded`;
- clipped result: `glyph-clipped` with clipped IDs/counts.
- No silent clamp and no containment claim after failure.

## 2. Fit scope

Fit guarantees **node glyph containment** under the declared padding and
presentation policy. It does **not** guarantee:

- all filenames/labels visible;
- no node overlap at overview scale;
- all hyperlines inside node bounds;
- layout clearance feasibility.

Labels remain bounded/suppressed separately. Overlap and label suppression are
reported separately from containment.

## 3. Camera limits

Default navigation limits are unchanged:

```text
minZoom .25, maxZoom 8, maxPanCss 1,000,000
```

The experimental harness uses `EXPERIMENTAL_CAMERA_LIMITS` with
`minZoom = 0.02` and the same other limits. This limit object is used by
normalization, forward/inverse transforms, wheel/buttons, fit, controller
construction/update, drawing, and status. Default camera limits remain in force
for existing navigation tests.

The fit camera is returned through `normalizeCamera` with the same limits, so a
fit camera cannot be rejected by a downstream layer.

## 3.1 Projection boundary

`prepareFitFrame` resolves one projection from the finalized viewport,
base projection radius, and workspace scale, prepares the base scene with that
projection, and calculates fit from the same scene. The harness passes that
exact projection into the frame installer. `drawCameraFrame` no longer rebuilds
a different projection for a fit frame.

Status records `fitProjection`, `currentFrame`, and
`fitDrawProjectionMatch`; historical `layoutMetrics` is separate. Resize in fit
mode prepares a new frame/projection; manual resize preserves the camera and
uses the current projection. Replacement paths rebuild projection after the new
layout selects its workspace scale.

## 4. User behavior

- Initial create/replacement/recreate: prepare base → fit → draw → install.
- **Fit graph**: fits the current displayed focus view; preserves focus and
  selection; does not recompute layout or reset focus.
- **Reset camera**: zoom=1, pan=(0,0). It is 100%/origin, not whole-graph fit.
- **Reset focus**: fits the authoritative base view (including refinement), enters fit mode, and clears requested/displayed focus only after successful installation. Failure retains the prior request. Reset camera remains the separate manual zoom=1 action.
- **Focus selected**: centers the requested Möbius focus; it does not auto-fit
  afterward.
- **Resize**: recompute fit if framingMode=fit; preserve manual camera otherwise.
- Wheel/drag/zoom buttons leave fit mode and set manual.
- Fit graph re-enters fit mode.
- Failed fit leaves interaction inert and does not claim a successful frame.

## 5. Diagnostics

`window.__M5_ADAPTIVE_LAYOUT_STATUS__` exposes:

- `framingMode: fit|manual`
- fit reason/satisfied/error
- eligible/contained/clipped counts
- clipped ID sample (long arrays omitted)
- padding/tolerance
- required/applied zoom and pan
- effective camera limits
- viewport, projection and workspace scale
- focused/selected IDs
- generation/controller metadata
- separate fit scope, visibility, overlap, and layout-feasibility wording

Full fit diagnostic:

```js
window.__M5_ADAPTIVE_LAYOUT_FIT__
```

Full comparison detail:

```js
window.__M5_ADAPTIVE_LAYOUT_FULL__
```

## 6. Actual fit evidence

Reference viewport `1100x473`, padding `24`, fixed glyph radius `6`:

| Fixture | Workspace | Nodes | Fit | Contained | Clipped | Applied zoom | Pan |
|---|---:|---:|---|---:|---:|---:|---:|
| F20 | 1 | 20 | yes | 20/20 | 0 | 0.9669 | (-0.5,-4.1) |
| F200 | 9.5 | 200 | yes | 200/200 | 0 | **0.0955** | (-3.1,0.5) |
| crowdedFolder | 2 | 34 | yes | 34/34 | 0 | 0.6687 | (7.0,-17.6) |
| mixedDeepWide | 1 | 50 | yes | 50/50 | 0 | 1.0700 | (19.4,16.2) |

F200 requires zoom **0.0955**, below the default `.25`; the experimental limit
admits it without clipping. Node counts are unchanged by fit.

No claim is made that fitting improves overlap or label readability.

## 7. Verification

- fit tests: **18/18 PASS**
- camera/controller: **18/18 PASS**
- M5 with fit/reset: **111/111 PASS**
- M3: **50/50 PASS**
- v1: **13/13 PASS**
- v2 layout: **13/13 PASS**
- applicability: **4/4 PASS**
- unique total: **446**
- M4: **58/58 PASS**
- Syntax: **PASS**
- Browser fit: **NOT RUN**



















































