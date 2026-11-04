# M5 Experimental Adaptive Layout — Contract and Verification

- Status: **EXPERIMENTAL, opt-in only**. The accepted legacy-compatible radial layout remains the default.
- API: `stageExperimentalLayout(graph, options)`.
- No force simulation, screen-space nudging, collision solver, live-graph commit, or default-path replacement.
- Browser visual comparison: **NOT RUN**.

## 1. Algorithm contract

### Demand

For each node, using structural children and subtree size:

```text
rawDemand = 1 + ln(1 + subtreeSize) + branchWeight * ln(1 + childCount)
demand = rawDemand ^ demandCompression
```

- `demandCompression` in `(0,1]` prevents one huge branch from taking all
  sibling angular space.
- Sibling branch demand is summed only for the parent allocation; sibling order
  is never changed.
- Root and depths come from the accepted angular/topology stage.

### Angular allocation

For each parent with ordered children:

```text
childSpan = parentSpan * childDemand / sum(siblingDemand)
```

- Child intervals are contiguous in declared sibling order.
- Parent interval coverage is checked before return.
- Zero/underflowed spans reject rather than silently emitting duplicate
  boundaries.
- `angleSpan`, `spans`, and positions are replaced coherently for every phase.

### Radial placement

Let:

```text
maxRho(d) = 1 - safetyMargin - minStep * (maxDepth - d)
lower     = parentRho + minStep
upper     = maxRho(childDepth)
ratio     = childDemand / maxSiblingDemand
rho       = lower + radialFlex * ratio * (upper - lower)
```

- Root is at normalized `(theta=0, rho=0)`.
- Child radius is strictly greater than parent radius by at least `minStep`.
- Siblings may have different radii at the same structural depth.
- Outer contour is irregular but remains inside the open unit disk.
- If `upper < lower`, the layout rejects with `experimental-infeasible`; there
  is no clamp/collapse.
- `safetyMargin` protects the boundary; positions still satisfy `rho < 1`.

### Parameters

```text
minStep             default 0.01, range (0, 0.25]
radialFlex          default 0.65, range [0,1]
branchWeight        default 0.75, range [0,10]
demandCompression   default 0.60, range (0,1]
safetyMargin        default 1e-6, range [0,0.25)
radius              default 1, positive (compatibility metadata)
```

### Determinism/complexity

- Child order is the accepted graph child order; ties are resolved by that
  order, never sorted by size.
- Linear traversal plus per-parent arithmetic: `O(N)` time and `O(N)` output.
- Comparison diagnostics are separate `O(N²)` work for bounded fixtures.

### Preserved structure

- stable IDs, root ID, topology, child order, sibling order, depths;
- phases and phase isolation;
- structural root at origin;
- caller graph and accepted baseline layout unchanged;
- output Maps/arrays/position records independently owned.

### Derived fields

EXPERIMENTAL staged fields are explicit: demand is `demandById`; allocated
angular span is `allocatedSpanById`; child radial coordinate is `radialById`;
parent radius is `parentRadialById`; child-keyed placement radius is
`placementRadiiById`. `scale` is compatibility metadata. `dimQuotients` are
recomputed from graph dimensions per phase. `coefficient` is `null`,
`selection` is `'experimental'`, and `schema` is
`'experimental-adaptive-layout-v1'`.
## 2. Comparison fixtures

Declared in `tests/engine/layout/crowding-fixtures.mjs`:

- `crowdedFolder`: root has one 24-child dense folder plus three small folders.
- `denseNeighbors`: root has four neighboring 12-child folders.
- `mixedDeepWide`: root has a depth-6 chain, a 20-child wide folder, and five
  3-child medium folders.
- `longLabels`: long root/folder/file names and varied file types.
- `infeasibleDepth`: depth-60 chain rejected at `minStep=0.02`.

F20/F200 remain unchanged regression fixtures.

## 3. Measured comparison (corrected evidence)

### Diagnostic definitions and bounds

- Pairwise diagnostics reject above **300 nodes** before entering O(N²) loops
  with `diagnostic-limit`.
- `visibleOverlap` uses actual visible radii and shape-aware circle/diamond
  checks.
- `sameIdsVisibleBoth` restricts overlap to IDs visible in both modes.
- `fixedSizeDiagnostic` uses one analytical radius of **6 CSS px** for all nodes,
  preserving shapes and ignoring visibility. It is not used for rendering or hit
  geometry.
- Radius statistics are reported over all nodes and separately over visible nodes
  (`min/max/mean/median/p90`).
- Label suppression is separate from node overlap and is not measured in the
  Node report.

| Fixture | Baseline visible/hidden/newHidden/newVisible/visibleOverlap/sameIdOverlap/fixed6/ms | Experimental visible/hidden/newHidden/newVisible/visibleOverlap/sameIdOverlap/fixed6/ms |
|---|---:|---:|
| F20 | 20/0/0/0/0/0/1/1.32 | 17/3/3/0/0/0/1/1.35 |
| F200 | 200/0/0/0/97/94/449/1.42 | 181/19/19/0/0/0/686/1.66 |
| crowdedFolder | 34/0/0/0/0/0/0/0.24 | 34/0/0/0/0/0/23/0.41 |
| denseNeighbors | 53/0/0/0/0/0/8/0.38 | 53/0/0/0/0/0/4/0.87 |
| mixedDeepWide | 50/0/0/0/3/1/13/0.26 | 48/2/2/0/0/0/18/0.30 |
| longLabels | 11/0/0/0/0/0/0/0.10 | 11/0/0/0/0/0/0/0.49 |

Infeasible fixture:

```text
rejected: experimental-infeasible
```

Observations:

- Visible counts decrease on F20, F200, and mixedDeepWide; hidden counts increase.
- The visible-overlap reduction cannot be attributed to spacing alone: moving
  nodes outward also shrinks their rendered radius.
- The fixed-size diagnostic conflicts with that apparent win: F200 is
  **449 -> 686**, crowdedFolder **0 -> 23**, and mixedDeepWide **13 -> 18**.
  Center placement is therefore worse on those fixtures under identical node
  sizes.
- Same-ID visible overlap is F200 **94 -> 0** and mixedDeepWide **1 -> 0**, but
  F20/F200 lose hidden/visible nodes as noted.
- This is mixed evidence, not a solved crowding problem. No visual or
  performance-superiority claim.
## 3.1 Experimental schema/version

`schema: "experimental-adaptive-layout-v1"`.

Compatible with renderer/focus/hit consumers:

- `rootId`, `phases`, `firstPhase`, `nodeCount`, `maxDepth`, `children`, `nodes`
- node `positions` (`{theta,rho}` per phase), `spans`, `angleSpan`,
  `dimQuotients`, `depth`
- `radius`, `offset`, `scales` as compatibility metadata

EXPERIMENTAL-only fields (not baseline placement semantics):

- `demandById`: compressed demand weight
- `allocatedSpanById`: allocated angular span (radians)
- `radialById`: child radial coordinate (`rho`)
- `parentRadialById`: parent radius for each child
- `placementRadiiById`: child-keyed placement radius, including children with
  different radii under one parent

Removed from the experimental result to avoid publishing baseline semantics
under the same names:

- `placementDistances` (baseline is parent-keyed distance used for children)
- `distances`, `angularWidths`, `treeAngularWidths`
- node `distance`, `placementDistance`, `angularWidth`, `treeAngularWidth`

Actual rendering/focus/hit code reads node `positions`, not these derived fields.
The baseline `stageRadialLayout` schema is unchanged.

## 4. Harness

`tests/harness/m5-adaptive-layout/` provides baseline/experimental selector,
crowding fixtures, validated experimental controls, DPR, selection, immediate
focus/reset, pan/zoom/reset camera, resize, destroy/recreate, and baseline vs
experimental metrics. Animated focus is not integrated.

```text
http://127.0.0.1:8765/tests/harness/m5-adaptive-layout/
```

```js
copy(JSON.stringify(window.__M5_ADAPTIVE_LAYOUT_STATUS__, null, 2))
```

Browser visual comparison remains **NOT RUN**.

## 5. Recommendation

Retain as **EXPERIMENTAL** for further comparison. The overlap reduction is
promising for dense fixtures, but hidden-node loss and lower minimum separation
mean it should not replace the baseline or be described as an improvement
without browser visual review and revised boundary/visibility policy.






