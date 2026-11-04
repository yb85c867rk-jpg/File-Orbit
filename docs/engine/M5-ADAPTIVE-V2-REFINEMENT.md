# Experimental v2 Fit-Aware Crowding Refinement

- Status: **EXPERIMENTAL, opt-in, disabled by default**.
- Baseline remains default; v1 and original v2 remain available unchanged.
- Browser verification: **NOT RUN**.
- Fit containment is not an overlap-free or label-readability claim.

## 1. Measurement boundary

Every candidate is evaluated through the actual final display pipeline:

```text
candidate staged layout
→ projection = 198.66 CSS base radius × selected workspaceScale
→ whole-graph fit camera (1100×473, padding 24)
→ camera-transformed scene
→ fixed 6 CSS px glyph policy
→ final shape-aware metrics
```

Final metrics:

- total/visible/contained/clipped node counts;
- shape-aware overlap pairs;
- minimum center separation;
- **shape-aware signed glyph-boundary separation** over actual circle/diamond
  geometry: positive gap, zero touching, negative penetration depth;
- fit zoom;
- mean/max screen displacement from the accepted v2 fitted display.

Pre-fit capacity feasibility remains historical layout evidence and is not
reported as current displayed clearance.

## 1.1 Phase and ownership contracts

Refinement accepts `phase`; default is `staged.firstPhase`. The phase must be
present in `staged.phases`, otherwise it rejects with `invalid-phase` before
mutation. Rebanding updates positions for every staged phase; acceptance uses
the requested display phase.

Accepted output is schema-aware owned: `phases` array, `experiment` and nested
`config`, `feasibility` and nested `unsatisfied`, node records/positions/spans,
and all top-level Maps are copied. Rejected output returns the original v2
object by identity. Mutating an accepted result does not mutate the original or
another refinement result.

## 2. Refinement algorithm

The refinement runs once over the accepted v2 staged result. It changes only
**sibling radial-band assignment**:

```text
candidate patterns:
  shift 0                         (original)
  shift k, k=1..min(3, bands-1)
  depth-stagger: (siblingIndex + depth) mod bandCount
```

For each candidate:

- sibling order and angular intervals are unchanged;
- `rho` is recomputed using the existing v2 `minStep`, `radialFlex`,
  `safetyMargin`, depth headroom, and band count;
- all phases receive coherent positions;
- IDs, root, topology, depths, children, demand, and allocated angular spans are
  unchanged;
- no node is hidden, no glyph is shrunk, no workspace scale is changed.

Candidate count is at most **4** including the original. There is no
simulation, relaxation loop, or unbounded search.

### Acceptance

A candidate is accepted only if:

1. every eligible fixed glyph remains contained;
2. visible/total node counts are preserved;
3. final overlap pairs decrease, or are equal with boundary separation
   improving by at least **0.25 CSS px**;
4. structural/numerical constraints pass.

Otherwise the original v2 staged result is returned and the outcome is:

```text
no-improving-candidate
```

The original v2 object is returned by identity in that case.

## 3. Actual final-fit comparison

Viewport `1100×473`, padding 24, fixed glyph radius 6, base projection radius
198.66 CSS px.

| Fixture | Workspace | Outcome | Overlap before→after | Min boundary before→after | Mean displacement | Fit zoom after | Contained |
|---|---:|---|---:|---:|---:|---:|---:|
| F20 | 1 | accepted (`depth-stagger`) | 1→0 | -0.661→18.038 | 43.87 | 1.1297 | 20/20 |
| F200 | 9.5 | accepted (`shift-1`) | **112→104** | -6.925→-6.383 | 63.26 | 0.1205 | 200/200 |
| crowdedFolder | 2 | rejected | 0→0 | 3.408→3.408 | 0 | 0.8078 | 34/34 |
| denseNeighbors | 1.25 | rejected | 0→0 | 4.826→4.826 | 0 | 1.0019 | 53/53 |
| mixedDeepWide | 1 | rejected | 0→0 | 5.075→5.075 | 0 | 1.2926 | 50/50 |
| longLabels | 1 | accepted (`shift-1`) | 0→0 | 24.87→28.96 | 95.41 | 1.5168 | 11/11 |

All six fixtures preserve node counts, fixed 6 px glyphs, and full containment.
The rejected fixtures are reported honestly rather than forced.

F200 remains heavily overlapping even after the accepted refinement
(112 → 104). The option reduces final overlap on that fixture but does not
solve crowding. It is not evidence for visual readability or general improvement.

## 4. Harness

`tests/harness/m5-adaptive-layout/` adds one checkbox:

```text
Refine v2
```

- disabled by default;
- applies only to v2;
- Apply layout reconstructs the staged base and runs the fit pipeline;
- status exposes requested/applied/outcome, pattern, attempts, before/after
  final metrics, displacement, and installed frame/projection match;
- fit, navigation, focus, selection, labels, resize, destroy/recreate, and
  draw-before-hit installation are preserved.

```text
http://127.0.0.1:8765/tests/harness/m5-adaptive-layout/
```

```js
copy(JSON.stringify(window.__M5_ADAPTIVE_LAYOUT_STATUS__, null, 2))
```

Compact status omits long ID arrays. Full comparison detail remains at
`window.__M5_ADAPTIVE_LAYOUT_FULL__`; full fit detail at
`window.__M5_ADAPTIVE_LAYOUT_FIT__`.

Browser verification remains **NOT RUN**. Label suppression/readability is not
measured by node-spacing metrics.

## 5. Verification

- refinement tests: **11/11 PASS**
- refinement + harness static: **12/12 PASS**
- M5 with fit/reset: **111/111 PASS**
- v1: **13/13 PASS**
- v2 layout: **13/13 PASS**
- applicability: **4/4 PASS**
- combined experimental: **59/59 PASS**
- M3: **50/50 PASS**
- M4: **71/71 PASS**
- unique total: **446**
- syntax: **PASS**

## 6. Recommendation

Keep the refinement **EXPERIMENTAL and opt-in**. It improves F20, F200, and
longLabels under the final-fit fixed-glyph boundary, but leaves F200 with 104
overlaps and rejects three of six fixtures. Do not promote it as a general
solution or claim label readability.













































