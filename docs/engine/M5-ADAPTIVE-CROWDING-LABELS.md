# Experimental v2 Crowding and Label Placement

- Status: **EXPERIMENTAL, opt-in**.
- Baseline remains default; v1/v2/refinement remain available.
- Browser verification: **NOT RUN**.
- Node overlap, fit containment, and label readability are separate claims.

## Part A — collision-evaluated node candidate search

New stage: `refineExperimentalV2Crowding(staged, graph, options)`.
It runs after the selected v2/refinement candidate and never mutates its input.

### Bounds

```text
max supported nodes   400
candidate budget      5 (original + 4 corrections)
correction patterns   4
iterations            1 deterministic pass
tie-break             fewer overlap pairs, then greater boundary separation
```

### Method

1. Render the base candidate through the actual final pipeline:
   projection → whole-graph fit → fixed 6 px glyphs → final scene.
2. Collect actual shape-aware overlap pairs.
3. For each bounded candidate, redistribute subtree angular sectors by demand
   power and redistribute leaf radial lanes within parent/depth headroom.
   This is a **collision-evaluated global candidate search**, not pair-targeted
   movement; collision pairs are used for measurement/acceptance, not to move
   individual colliding nodes.

```text
child sector weight = demand(child) ^ angularPower
leaf lane             = (siblingIndex + depth) mod lanes
leaf radial fraction  = (lane + 0.5) / lanes
```

4. Rebuild every node's interval, theta, radial position, spans, and derived
   maps coherently for every phase.
5. Re-fit and re-render every candidate before measuring.
6. Accept only if:
   - all eligible fixed glyphs are contained;
   - visible/total node counts are unchanged;
   - final overlap pairs decrease, or equal overlaps have boundary separation
     improved by at least 0.25 CSS px.
7. Otherwise return the original staged candidate unchanged with
   `no-improving-candidate`.

No hiding, glyph shrinking, workspace inflation as an improvement, random
search, force simulation, or animation loop is used.

### Actual final-fit comparison

Viewport 1100×473, padding 24, fixed 6 px, base projection 198.66.

| Fixture | Outcome | Overlap before→after | Boundary before→after | Fit zoom after | Fitted displacement |
|---|---|---:|---:|---:|---:|
| F20 | no-crowding | 0→0 | 18.038→18.038 | 1.1297 | 0 |
| F200 | accepted | **104→54** | -6.383→-4.778 | 0.1141 | 172.71 mean / 364.37 max, 200 changed |
| crowdedFolder | no-crowding | 0→0 | 3.408→3.408 | 0.8078 | 0 |
| denseNeighbors | no-crowding | 0→0 | 4.826→4.826 | 1.0019 | 0 |
| mixedDeepWide | no-crowding | 0→0 | 5.075→5.075 | 1.2926 | 0 |
| longLabels | no-crowding | 0→0 | 28.958→28.958 | 1.5168 | 0 |

Fitted displacement is measured by stable ID between the original and
accepted final fitted scenes (each with its own fit camera). F200 moves every
node: **mean 172.71 CSS px, max 364.37 CSS px, 200 changed**. Rejected results
report zero.

F200 residual after correction: **54 pairs**, distributed by endpoint depth:
depth 2: 7, depth 3: 97, depth 4: 4. The residual is concentrated at depth 3.
Zero overlap is **not** achieved at this viewport.

Second viewport check with the same fixture/stage:

| Viewport | F200 before→after overlaps | Contained |
|---|---:|---:|
| 800×600 | 72→18 | 200/200 |
| 1600×900 | 20→**0** | 200/200 |

The result is viewport-sensitive; 1100×473 still has residual crowding.

## Part B — bounded label placement

`label-overlay` now supports explicit policy:

```text
legacy  right/left placement, prior behavior
around  right/left/above/below placement
```

The adaptive harness defaults to `around`; `legacy` remains selectable for
comparison.

For each label, at most four positions are tried. Placement considers:

- viewport padding/bounds;
- already accepted label rectangles (including overlap padding);
- visible node glyph obstacles, excluding the owner node allowance;
- priority order: selected/focused IDs, root, then shallower depth/index.

The bounded label budget remains 40; no font-size reduction, no underlying-name
truncation, and no extra suppression to fake improvement. Names still use full
textContent/title/aria-label and existing local icons.

Metrics distinguish:

- visible/created/suppressed labels;
- label-label overlap suppression;
- `labelNodeOverlapCount`: **count of visible label-node pairs** whose exact
  circle/diamond geometry intersects. Owner-node pairs are excluded; suppressed
  labels are not counted. This is distinct from the conservative bounding-box
  obstacle test used during around placement;
- viewport suppression;
- priority visible/suppressed counts;
- bounded placement attempts.

Label measurements are DOM/browser-dependent. Node tests use the fake DOM and
exact geometry helper. Browser label verification is
**NOT RUN**. Node fake-DOM tests verify policy behavior only; no browser
readability claim is made.

## Harness controls

- `Crowd correct` checkbox — opt-in node correction, off by default.
- `Refine v2` remains separate.
- `Labels` selector — `around` or `legacy`.
- Status exposes requested/applied/outcome, bounded work, before/after final
  metrics, residual counts, label metrics, fit projection, and frame matching.
- Reset focus, automatic fit, resize, navigation, selection, and hit
  installation are preserved.

## Recommendation

Keep both controls EXPERIMENTAL and opt-in. F200 improves from 104 to 54 overlaps
at the primary viewport but remains crowded; zero overlap at 1600×900 does not
establish general success. Label readability remains unverified in browser.
## Verification

- crowding tests: **8/8 PASS** (includes 1100×473, 800×600, 1600×900).
- label placement tests: **16/16 PASS** (Node fake DOM; browser NOT RUN).
- combined experimental: **59/59 PASS**.
- M4: **71/71 PASS**.
- M5 with fit/reset: **111/111 PASS**.
- M3: **50/50 PASS**.
- unique total: **446**.
- syntax: **PASS**.
- browser label/node visual verification: **NOT RUN**.

No browser label measurements are claimed from the Node fake-DOM tests.









































