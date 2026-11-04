# Experimental Adaptive Layout v2 — Multi-Band, Size-Aware

- Status: **EXPERIMENTAL, opt-in only**.
- Baseline remains the default. v1 is frozen for comparison.
- Browser visual comparison: **NOT RUN**.
- No promotion, tuning, or replacement of accepted baseline.

## 1. Objectives and reference policy

Separate quantities:

- **Layout**: normalized `(theta, rho)` positions inside the unit disk.
- **Presentation**: fixed 6 CSS px glyph radius at reference zoom.
- **Workspace/projection**: uniform projection scale, then normal pan/zoom.

Declared reference:

```text
viewport              800 x 600 CSS
reference projection  240 CSS px radius
reference camera      zoom=1, pan=(0,0)
glyph radius          6 CSS px (circles and diamonds)
clearance             4 CSS px
outer safety          1e-6
band count            2 (1..4)
workspace scales      1.00 .. 16.00, step 0.25
max input nodes       2000
max depth             64
```

The fixed glyph policy is explicit and experimental. It is applied after
Möbius focus and camera scene transformation, so glyphs stay 6 CSS px at every
camera zoom. It is not default renderer behavior. Fixed glyph radius does not
guarantee readable filenames; labels remain separate.

## 2. Algorithm

### Demand and bands

```text
rawDemand = 1 + ln(1 + subtreeSize) + branchWeight * ln(1 + childCount)
demand    = rawDemand ^ demandCompression
bandIndex = siblingPosition mod bandCount
bandFraction = 0.2 + 0.8 * bandIndex / (bandCount - 1)
```

Sibling order is preserved; band assignment never reorders nodes.

### Size-aware angular capacity

For each child, with the reference projection and candidate workspace scale:

```text
arcRadius = approximateRho * referenceProjectionRadius * workspaceScale
required  = 2 * asin(min(1, (2*glyphRadius + clearance) / (2*arcRadius)))
span      = required + (parentSpan - sum(required)) * demand / sumSiblingDemand
```

Intervals are contiguous in sibling order and must cover the parent interval.
Required angular footprint and available arc length are both used; raw subtree
counts alone are not.

### Radial placement

```text
lower = parentRho + minStep
upper = 1 - safetyMargin - minStep * (maxDepth - depth)
rho   = lower + radialFlex * bandFraction * (upper - lower)
```

- Root remains at normalized origin.
- Child radius increases from parent.
- Same-depth siblings use multiple bands and may have different radii.
- All positions finite and strictly inside the open disk.
- No force simulation, post-render nudging, or collision solver.
- If required arcs exceed a parent span, the layout tries the next bounded
  workspace scale. If all declared scales fail, it throws
  `experimental-v2-infeasible` with diagnostics. No silent clamping.

### Termination

At most **61** candidates/attempts; each attempt is `O(N)`. Candidate count, actual attempts, and selected index are recorded.
Input is bounded to 2000 nodes / depth 64. No unbounded search.

## 3. Schema and interaction

Schema: `experimental-adaptive-layout-v2`.

Compatible consumers:

- `nodes[].positions`, `spans`, `angleSpan`, `dimQuotients`
- `rootId`, `phases`, `children`, `depths`, `nodeCount`

Explicit derived fields:

- `demandById`
- `allocatedSpanById`
- `radialById`
- `parentRadialById`
- `placementRadiiById`
- `feasibility` (`satisfied`, `workspaceScale`, `unsatisfied`)

No baseline `placementDistances` semantics are reused. `stageRadialLayout` and
v1 are unchanged.

At the harness, graph drawing, labels, selection ring, and hit testing all use
the same final fixed-glyph scene. There is zero hit padding. Fixed text/icon
size, edge stroke, and ring width/gap remain the accepted renderer values.
Immediate focus uses v2 base coordinates; reset restores the base.

## 3.2 Projection contract

One authoritative capacity radius is declared:
`referenceProjectionRadiusCss`. The Node report uses **240** for both capacity
and projection. The harness passes the actual base projection radius
(`min(content width,height) * 0.42`) into capacity evaluation and uses that same
value for display, scaled by `workspaceScale`. Status separates:

- calculation radius
- displayed projection radius
- workspace scale
- camera zoom

On resize, the previous feasibility guarantee is marked
`feasibilityGuaranteeApplicable: false`; it is not silently reused as proof for
the new radius. Local sibling capacity remains the only claimed scope.

Current display applicability is evaluated separately from historical layout
capacity. It is false when camera zoom is below the evaluated scale, focus or
resize changed the view, presentation is not fixed 6px, glyph radius differs,
or calculation/display radius or workspace scale differ. A concise reason is
returned; fit containment is not treated as overlap-free clearance.

## 4. Controlled comparison

### A. Primary reference view (workspaceScale = 1)

Fixed 6 px glyphs, camera identity, projection radius 240.

| Fixture | Baseline visible/viewport/overlap/minSep | v1 visible/viewport/overlap/minSep | v2 |
|---|---:|---:|---|
| F20 | 20/20/0/16.24 | 20/20/1/9.70 | satisfied |
| F200 | 200/200/143/5.62 | 200/200/165/2.84 | **infeasible** |
| crowdedFolder | 34/34/0/41.50 | 34/34/0/19.33 | **infeasible** |
| denseNeighbors | 53/53/0/25.39 | 53/53/0/27.62 | **infeasible** |
| mixedDeepWide | 50/50/5/1.87 | 50/50/6/2.81 | satisfied |
| longLabels | 11/11/0/106.03 | 11/11/0/90.10 | satisfied |

v2 does **not** silently substitute scale 9.5 in the primary comparison. Its
infeasibility is reported.

### B. Secondary equal-scale view

v2's selected scale is applied equally to baseline, v1, and v2.


Same 800x600 viewport, fixed 6 px glyphs, and same workspace scale (v2's
requested scale applied to all three modes). Node metrics are shape-aware;
diagnostics are bounded to 300 nodes. Labels are **NOT MEASURED** in Node.

| Fixture | Scale | Baseline visible/viewport/overlap/minSep/ms | v1 visible/viewport/overlap/minSep/ms | v2 visible/viewport/overlap/minSep/ms |
|---|---:|---:|---:|---:|
| F20 | 1 | 20/20/0/16.24/2.07 | 20/20/1/9.70/0.92 | 20/20/1/9.92/1.06 |
| F200 | 9.5 | 200/1/0/53.37/1.65 | 200/1/0/26.94/1.91 | 200/4/0/25.29/13.60 |
| crowdedFolder | 2 | 34/14/0/83.00/0.20 | 34/14/0/38.65/0.16 | 34/29/0/22.78/0.25 |
| denseNeighbors | 1.25 | 53/53/0/31.73/0.52 | 53/53/0/34.53/0.33 | 53/53/0/20.29/0.26 |
| mixedDeepWide | 1 | 50/50/5/1.87/0.41 | 50/50/6/2.81/0.51 | 50/50/0/14.69/0.23 |
| longLabels | 1 | 11/11/0/106.03/0.08 | 11/11/0/90.10/0.10 | 11/11/0/32.62/0.09 |

Fixed-size diagnostic: every compared node already has radius 6, so actual
rendered overlap and the fixed-size 6 diagnostic are the same in this table.

`infeasibleDepth`: rejected with `experimental-v2-infeasible`.

## 5. Interpretation

v2 only partially supports the objectives:

- Mixed deep/wide improves strongly (5 -> 0 overlaps; minimum separation
  1.87 -> 14.69).
- F200 requires scale 9.5; only 4 nodes intersect the reference viewport, and
  minimum separation is worse than baseline.
- F20, crowdedFolder, denseNeighbors, and longLabels have worse minimum
  separation.
- v2 has no added hidden-node loss under fixed glyph presentation, but it can
  push most F200 content outside the viewport.
- The outer contour is less circular, but this is not the same as a usable
  outer-branch arrangement.

No visual-superiority, readability, or performance claim is made. Labels and
browser comparison are NOT RUN. The evidence does **not** support promoting v2.

## 6. Harness

`tests/harness/m5-adaptive-layout/`:

- Baseline / Experimental v1 / Experimental v2
- Presentation: fixed 6 CSS px or native
- Workspace/projection scale display
- Feasibility and unsatisfied constraints
- Compact status JSON by default; full ID arrays via
  `window.__M5_ADAPTIVE_LAYOUT_FULL__`
- Baseline controls, pan/zoom, reset camera, focus/reset, selection, resize,
  destroy/recreate preserved

```text
http://127.0.0.1:8765/tests/harness/m5-adaptive-layout/
```

```js
copy(JSON.stringify(window.__M5_ADAPTIVE_LAYOUT_STATUS__, null, 2))
```

Browser visual comparison remains **NOT RUN**.
## 7. Verification and recommendation

- Baseline M3: **50/50 PASS**
- v1: **13/13 PASS**
- v2 layout/presentation: **15/15 PASS** (13 v2 + 2 shared harness static)
- v2 applicability: **4/4 PASS**
- M4: **58/58 PASS**
- M5: **90/90 PASS**
- Baseline/v1 layout/fixtures unchanged
- Browser visual comparison: **NOT RUN**
- Labels: **NOT RUN** in a browser

Primary reference comparison shows v2 infeasible at scale 1 on F200,
crowdedFolder, and denseNeighbors. Secondary equal-scale comparison shows
F200 at 9.5 with only 4/200 viewport-intersecting nodes and worse minimum
separation on five fixtures. This does not support promotion. Keep v2
EXPERIMENTAL and do not tune it in this correction.




