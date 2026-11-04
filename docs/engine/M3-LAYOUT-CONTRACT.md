# M3 — Hypertree Radial Layout Contract

- Date: 2026-10-25
- Status: **partial implementation** — `layout/resolve.js`, `layout/angular-width.js`, `layout/distance.js`, `layout/radial.js`, and validated `layout/commit.js` are implemented/tested; rendering, focus, and browser measurement are not implemented.
- Scope: JIT Hypertree radial layout only. SpaceTree, rendering, labels, focus animation, lifecycle, and browser integration are outside this contract.
- Legacy reference: unchanged `vendor/jit/jit.2.0.1.js`, SHA-256 `4A413A0A21435AEE893EBE3572CAEB5EA81B14C437FA8BEC3AABB5F7A921546F`.

## 1. Legacy source audit

| Function | Source | Inputs/defaults | Fields read/written | Traversal / side effects |
|---|---|---|---|---|
| `Options.Node` defaults | `jit.js:1246-1267` | `overridable:false`, `dim:3`, `angularWidth:1`, `span:1`, `autoWidth:false`, `autoHeight:false` | config values only | none |
| `NodeDim.compute` | `jit.js:8360-8399` | `graph`, phases, `config` | reads `autoWidth/autoHeight`, `width/height`, type; deletes `$width/$height/$dim`; writes `$width/$height/$dim` | `graph.eachNode`; DOM label `initializeLabel` `8401-8417`; **only auto flags read label size** |
| `Layouts.Radial.compute` | `jit.js:11947-11954` | `property` undefined/string/array | delegates dimensions, levels, angular widths, positions | `NodeDim`, `computeLevels`, `createLevelDistanceFunc`, `computeAngularWidths`, `computePositions` |
| `Layouts.Radial.setAngularWidthForNodes` | `jit.js:12031-12036` | `prop` (array; uses `prop[0]`) | reads `getData('angularWidth', prop[0])`; writes `_angularWidth` | `graph.eachBFS(root, action, "ignore")`; action's second argument is `_depth` |
| `Layouts.Radial.setSubtreesAngularWidth` | `jit.js:12043-12048` | none | writes `_treeAngularWidth` | `graph.eachNode(..., "ignore")` filters which nodes are passed as aggregate roots; **not** a consistent edge-visibility filter |
| `Layouts.Radial.setSubtreeAngularWidth` | `jit.js:12055-12062` | `elem` | reads `_angularWidth`, child `_treeAngularWidth`; writes `_treeAngularWidth` | recursive postorder; `eachSubnode(..., "ignore")` filters node actions, but edge flags are not forwarded; no phase |
| `Layouts.Radial.computeAngularWidths` | `jit.js:12069-12072` | `prop` | — | calls both angular passes |
| `Layouts.Radial.computePositions` | `jit.js:11961-12024` | phases, `getLength` | root/child `pos`; `$span`; `dim-quotient`; `angleSpan`; `_flag`; reads `$dim` | `graph.eachBFS`; `eachSubnode`; `getLength(parent)`; no recursion |
| Hypertree `createLevelDistanceFunc` | `jit.js:17966-17993` | `radius`, `offset`, max `_depth` | writes `node.scale`; returns distance | `graph.eachNode`; `Math.pow` loop |
| Hypertree `getRadius` | `jit.js:18006-18011` | `config.radius` | — | `"auto"` reads canvas size (browser) |
| Hypertree `refresh` | `jit.js:18023-18034` | `reposition` boolean | copies end rho/theta to current/start when repositioning | calls `compute`/`reposition`, then `plot` |
| Hypertree `reposition` | `jit.js:18045-18056` | none | end positions; moebius translation; `ignore` end→current | `Graph.Util.moebiusTransformation`; **focus/moebius, not pure radial compute** |
| Hypertree `move` | `jit.js:18114-18133` | `pos`, options | closest node, `computeLevels` | focus path; outside M3 |

### Direct findings vs assumptions

**Observed source:**

- `Layouts.Radial` is the Hypertree implementation (`x` at `17904`; Hypertree does not override `compute`/`computePositions`).
- `setAngularWidthForNodes` uses `graph.eachBFS` and receives `_depth` as the action's second argument (`5077`). Root depth is `0`.
- `_angularWidth = diamValue / i` (`12034`) therefore divides by zero for the root.
- `setSubtreeAngularWidth` is recursive (`12058`); `setSubtreesAngularWidth` calls `graph.eachNode(..., "ignore")` and `setSubtreeAngularWidth` calls `eachSubnode(..., "ignore")`. These filter **node actions**, not edges; they do not implement consistent edge visibility, and ignored subtrees can produce incomplete/undefined widths.
- `computePositions` uses parent `getLength(elem)` (`11982`) and writes child positions at that length.
- Hypertree leaves `this.parent` undefined; the legacy `if (parent && parent.id == elem.id && subnodes[0].dist)` sibling sort (`11996-12001`) is not applicable to Hypertree.
- `span` is written per phase (`11971`, `12012`); `angleSpan` is a single non-phase field (`11974`, `12016`).
- `dim-quotient` is written per phase (`12013`); Hypertree rendering reads `$dim` (`18366` etc.), not `dim-quotient`.
- `NodeDim` only measures when `autoWidth`/`autoHeight` is truthy (`8367-8396`), but always creates a DOM label (`8401-8405`).
- Legacy `getData` uses `Config.overridable`: when false it **ignores** `$prop` data and returns config/default; when true it checks phase data, then current data, then config (`4254-4295`).
- Hypertree `refresh(true)` copies end positions to current/start after `reposition` (`18023-18034`).

**Deduced / to validate in M3 tests:**

- Root `_angularWidth`/`_treeAngularWidth` Infinity is mostly latent because normal child allocation uses child subtree widths, not the root's width. Exact downstream behavior must be captured by the oracle before accepting any correction.
- Integer-like IDs change object-enumeration order in legacy and therefore sibling angle order; this is not a layout bug but an ordering-policy difference.

## 2. Graph/root requirements

- M2 `Graph` with a single string `rootId`; root node must exist.
- Supported topology: a rooted tree (every non-root node has exactly one parent) with all graph nodes reachable from the root.
- Reject before layout:
  - missing/empty root;
  - disconnected/unreachable nodes;
  - cycles or multiple parents (loader already rejects; direct graph must be validated);
  - duplicate edges are not meaningful in the tree contract.
- Single root is valid; empty graph is invalid.
- `_depth` may be absent before layout; layout computes levels with the M2/legacy schedule in temporary maps, not by mutating live nodes.
- Node IDs remain strings; integer-like IDs follow the M2 Map insertion-order policy.

## 3. Position and phase contract

- Position class must implement the M1 `Polar` contract used by Hypertree: `set`, `setc`, `getc`, `rho`, `theta`.
- `pos`, `startPos`, and `endPos` are distinct objects.
- Default phase set: `["current", "start", "end"]` (legacy `$.splat(property || [...])` behavior).
- A string phase selects only that phase; an array selects exactly those phases. Reject unknown/duplicate phases.
- For each selected phase:
  - root is set to `Polar(0, 0)`;
  - child positions are set by `(theta, length)`;
  - `$span` is written for each phase;
  - `$dim-quotient` is written for each phase.
- Non-phase fields:
  - `_depth` from the staged `computeLevels` schedule (committed after success);
  - `_angularWidth` and `_treeAngularWidth` computed once from the **first selected phase** (`prop[0]`) because legacy uses `prop[0]`;
  - `angleSpan` is a single object per node, not phase-specific;
  - `node.scale` is set by the distance function.
- `compute("end")` must not modify current/start positions; `compute()` all phases may update all. `refresh(reposition)` is a later integration helper, not part of the pure layout commit.

## 4. Dimension and angular-width fields

### `$dim`

- Meaning: rendered node size (screen units), used by Hypertree rendering; radial layout uses it only for `maxDim`/`dim-quotient`.
- Resolution precedence must be explicit and legacy-compatible:
  1. if `Node.overridable` is false: config `dim` (default `3`), ignoring `$dim`;
  2. if true: phase data `$dim` if present, else current data `$dim`, else config `dim`;
  3. `NodeDim` auto measurement is outside pure layout; if `autoWidth`/`autoHeight` is true and no supplied dimensions exist, M3 must report `browser-measurement-required`, not invent a DOM value.
- Valid values: finite, `>= 0`. Zero is allowed.
- Zero dimensions are valid input; `dim-quotient` is only a data output and Hypertree does not consume it. If `maxDim` is 0, define `dim-quotient` as `0` (legacy computes `0/0 = NaN`; this is an intentional correction, not a required legacy defect).

### `$angularWidth`

- Meaning: relative angular share; dimensionless positive weight.
- Resolved by the same `overridable` precedence; default config `1`.
- Legacy then applies `diamValue = getData(...) || 5`; this means a resolved `0`/falsy becomes `5`. For M3, explicit values must be finite and `> 0`; zero/negative are rejected as invalid layout input (intentional validation correction). Default 1 remains.
- Used only to seed `_angularWidth`; it is not a direct final angle.

### `span`

- Meaning: angular span in radians.
- Root: set to `2*PI` for each phase.
- Child: set to its allocated `angleProportion` for each phase.
- Initial config `span` (default 1) is not read by `Layouts.Radial.compute`; it is a data output of layout.
- `span` is phase-specific.

### `angleSpan`

- Per-node `{begin, end}` in radians.
- Root: `{0, 2*PI}`.
- Child: `{begin: angleInit, end: angleInit + angleProportion}`.
- Not phase-specific; overwritten by each compute.
- Sibling spans for a parent are contiguous and cover the parent span.

### `_angularWidth` / `_treeAngularWidth`

- Derived, dimensionless.
- Non-root: `_angularWidth = resolvedAngularWidth / _depth`.
- Root: legacy divides by zero. M3 correction: root `_angularWidth = 0`; root `_treeAngularWidth = sum(child _treeAngularWidth)` (postorder max with 0). Ordinary child positions are expected to be unchanged; this must be oracle-tested.
- Non-root `_treeAngularWidth = max(_angularWidth, sum(child _treeAngularWidth))`.
- Aggregation is iterative postorder, child adjacency order, no recursion.
- These fields are not phase-specific; the first selected phase supplies `$angularWidth`.

### M2 `getData` difference

M2 `GraphNode.getData` is a simple `$prop` store with current fallback and default 0. It has no `Config.overridable` resolution. M3 must use an explicit resolver:

```text
resolve(prop, phase):
  if !options.node.overridable -> options.node[prop] (or documented default)
  else phase data $prop -> current data $prop -> options.node[prop] -> default
```

M3 must not silently treat the M2 default `0` as the legacy config default. No M2 change is required; this is a layout-level resolver.

### First-slice implementation and deliberate differences

Implemented files:

- `layout/resolve.js` — `normalizePhases`, `normalizeNodeOptions`, `resolveNodeNumber`, `resolveDim`, `resolveAngularWidth`, `resolveSpan`.
- `layout/angular-width.js` — `computeAngularWidths`.
- `layout/distance.js` — `computeLevelDistances`.
- `layout/errors.js` — `LayoutContractError`.
- `layout/index.js` — exports.

Deliberate differences from legacy resolution/aggregation:

- Legacy `setAngularWidthForNodes` uses `diamValue = getData(...) || 5`; a resolved `0` silently becomes `5`, and negative values are accepted. M3 requires explicit `angularWidth > 0`; zero/negative are rejected (default remains `1`).
- Legacy `getData` falls back to `0` when a property is absent; M3 uses own-property presence and config/defaults, so an explicit `$dim = 0` remains zero.
- Legacy root `_angularWidth`/`_treeAngularWidth` become Infinity; M3 resolves/validates `$angularWidth` for **every node including the root** first, then returns root angular `0` and a finite postorder sum.
- Root selected-phase/current-fallback resolution follows the same precedence as other nodes; invalid root values are rejected before the correction is applied.
- M3 aggregation is iterative postorder; legacy `setSubtreeAngularWidth` recurses.
- M3 distance staging preserves the legacy coefficient loop and descending pow sum; it caches by depth, which preserves each depth's result and arithmetic order.
- M3 rejects a parent/child-placement distance outside `(0, 1)` after offset (`radial-domain`); raw leaf/single-root distances are retained without clamping.
- M3 stages depths/angular widths and does not mutate live `_depth`, `_flag`, angular fields, positions, or phase data. Legacy mutates the isolated graph; that is oracle-only.
- M3 initial layout rejects `ignore` nodes and `_hiding` edges rather than inheriting legacy's inconsistent node-action filtering.

## 5. Radius, distance, and browser separation

- Hypertree `createLevelDistanceFunc` (`17966-17993`) uses:
  - `radius` (`getRadius`); `"auto"` requires canvas measurement;
  - `offset` (default 0, finite);
  - `maxDepth` = max staged `_depth` over all nodes;
  - `legacyDepth = maxDepth + 1` (the source increments its local `depth`);
  - a per-depth geometric distance `sum(a^d for d=_depth+1..1) - offset`;
  - `node.scale = radius`;
  - the `a` selection loop `i=0.51..1 step 0.01`, `(1-a^legacyDepth)/(1-a) >= 2`, use `i-0.01`, else `0.75`.
- The coefficient loop is preserved literally, including float stepping and `i - 0.01`. Do not replace it with a closed form or integer-step loop.
- The distance sum is accumulated **descending**: `a^(depth+1)` first through `a^1`; `offset` is subtracted afterward.
- `radius` is assigned to `node.scale`; **do not multiply normalized distance by radius**. Legacy does not do that.
- `getLength` is evaluated on the **parent** node (`11982`), so children are placed at the parent's distance. Distance evaluated for a leaf is not a child-placement distance; preserve this distinction.
- M3 pure distance staging requires an explicit finite positive numeric `radius` and finite numeric `offset`. `radius: "auto"`, numeric strings, `NaN`, and infinities are rejected; no coercion.
- Staged depth input comes from `computeAngularWidths`; distance staging does not read/change live `_depth`/`_flag`.

### First-slice distance API

```js
computeLevelDistances(angularResult, { radius, offset = 0 })
// -> {
//   rootId, radius, offset,
//   maxDepth, legacyDepth,
//   coefficient, selection: 'loop' | 'fallback',
//   distances: Map<nodeId, number>,
//   scales: Map<nodeId, number>,
//   placementDistances: Map<parentId, number>
// }
```

- `distances` are raw legacy distances for every node.
- `scales` contain the numeric radius for every node.
- `placementDistances` contains raw distances only for nodes that have at least one child; these are the values a future radial position pass may consume.
- `children`/depth maps from the angular result are used for parent detection; full topology validation is not duplicated.
- Distance values are cached by depth. Each unique depth still uses the exact descending `Math.pow` accumulation, so per-depth results/operation order are unchanged. Cost is `O(N + sum over distinct depths of (depth+1))`; for a chain this is `O(N + D²)`. Depth caching does **not** make chains linear.

### Radial-domain policy (intentional correction)

- Raw legacy distances can be negative or outside the unit disk when `offset` is large/negative.
- A **child-placement** distance (a parent with children) must satisfy `0 < distance < 1`; otherwise `radial-domain` is raised. There is no clamp, absolute value, or offset rewriting.
- Raw **leaf** distances may be negative or ≥1 because they are never used to place children.
- A **single root** has no child placement; its raw distance may be negative/out-of-disk and the result has an empty `placementDistances`.
- This distinction is tested explicitly. Ordinary legacy parent distances are inside the open unit disk; the validation is a deliberate guard for offset-induced invalid placement.
- Full radial position computation is not part of this slice.

### Staged radial API and policies

```js
stageRadialLayout(graph, {
  rootId,
  phases = ['current', 'start', 'end'],
  nodeOptions = { overridable: false, dim: 3, angularWidth: 1, span: 1 },
  radius,
  offset = 0,
  limits
})
// -> {
//   rootId, phases, firstPhase, nodeCount,
//   maxDepth, legacyDepth, coefficient, selection,
//   radius, offset,
//   nodes: Map<id, {
//     id, depth, angularWidth, treeAngularWidth,
//     scale, distance, placementDistance,
//     angleSpan,
//     positions: Map<phase, {theta,rho}>,
//     spans: Map<phase, number>,
//     dimQuotients: Map<phase, number> | null
//   }>,
//   depths, angularWidths, treeAngularWidths,
//   distances, placementDistances, scales,
//   children
// }
```

- The API composes `computeAngularWidths` and `computeLevelDistances` internally; callers cannot supply unrelated staged results.
- Root: position `(0,0)`, span `2π`, angleSpan `{0,2π}`, scale = radius, `dimQuotients = null`.
- Root `dim-quotient` is **not written** by legacy `computePositions`; M3 preserves that and does not read/resolve the root `$dim` for quotient. An invalid root `$dim` is therefore ignored by this slice.
- Children: theta from first-selected-phase subtree weights; rho = parent `placementDistances`; sibling order = staged adjacency; span/dim-quotient per phase; angleSpan non-phase.
- Child dimensions are resolved/validated per selected phase. All-zero sibling dimensions produce `dim-quotient = 0` (legacy `0/0 = NaN` is an intentional correction); root has no quotient.
- Underflow/absorption policy: if a positive child weight yields `angleProportion === 0` or `angleInit + angleProportion === angleInit`, reject with `allocation-underflow`; no clamp/renormalization. Positive finite weights are not claimed to always produce distinguishable intervals.
- Interval validation uses ordinary arithmetic for boundaries/spans, not angular wrapping. Child intervals must be ordered, contiguous, nonnegative, and cover the parent interval within `1e-12`; root covers `2π`.
- Positions/data are new owned records. Unselected phases receive no records. No live graph field is read for depth/flag or written.
- Additional radial work is O(N); the distance stage retains `O(N + Σ(depth+1))` (`O(N + D²)` for chains). No extra quadratic pass is added.
- The staged API itself has no commit path; `computeRadialLayout` is the separate validated in-memory commit entry point.

### Validated commit API and supported atomicity

```js
computeRadialLayout(graph, options) // same options as stageRadialLayout
```

- Internally stages with `stageRadialLayout`; the staged result is private until all writes complete.
- Returns the staged result after application. `stageRadialLayout` remains the pure public API.
- There is no public commit method accepting caller-edited staged maps.
- No `await`, callbacks, or application hooks run between staging and writes; the operation is synchronous.

Supported targets:

- engine-owned M2 `Graph` and `GraphNode` instances;
- M1 `Polar` position objects (`pos`, `startPos`, `endPos`);
- writable own data properties and extensible `data`/`startData`/`endData` stores.

Preflight before the first write checks every node's:

- `_depth`, `_angularWidth`, `_treeAngularWidth`, `scale`, `angleSpan` writable own slots;
- selected-phase `pos`/`startPos`/`endPos` identity, exact M1 Polar class, writable own `theta`/`rho`;
- selected-phase data-store identity/extensibility and writable `$span`/`$dim-quotient` slots;
- non-root quotient slot; root quotient is never checked for writing because it is never written/deleted;
- when a planned property is absent as an own property, the entire prototype chain is inspected via descriptors; any inherited descriptor is rejected (including writable data and accessors). This applies to phase-store `$span`/`$dim-quotient` and to missing node slots such as `scale`; inherited setters are never invoked;
- staged finite values.

Application writes directly to validated properties; it does not call `setPos`, `setData`, or other overridable methods. `angleSpan` identity is **replaced** with a fresh object (the staged object is never aliased); position/data object identities are preserved. `_flag`, unselected phases, root `dim-quotient`, non-reserved metadata, and unrelated graph fields are untouched.

Failure/atomicity limits:

- Any staging, preflight, or test-injected pre-apply failure leaves all live values/identities unchanged.
- Preflight covers all nodes before the first write, so one invalid late destination cannot leave earlier nodes modified.
- No rollback is used: the supported ordinary-object write path consists of already-validated writable data slots and therefore does not introduce ordinary application exceptions. Unsupported/proxy/custom objects must be rejected; process termination/OOM/concurrent mutation are outside scope.
- A test-only `__setCommitFailureHookForTests` seam exists in `layout/commit.js`, not the public index.

## 6. Ordering, flags, and visibility

- Sibling order = adjacency Map insertion order. `computePositions` assigns angular spans in that order.
- `computeLevels`/`eachBFS` preserve M2's `unshift`/`pop` queue schedule; for F20 the BFS visitation is `n0..n19`, which is not the F20 preorder.
- Closest-node tie policy remains M2's first Map-order node; layout does not compute closest nodes.
- Flags:
  - Legacy `eachLevel` ignores edge flags (R3 accepted); layout must not rely on filtered edge traversal.
  - Legacy angular-width aggregation does not implement consistent visibility semantics: `setSubtreesAngularWidth` filters aggregate-root actions with `eachNode(..., "ignore")`, while `setSubtreeAngularWidth` calls `eachSubnode(..., "ignore")`; edge flags are not forwarded by `eachLevel`.
  - Hidden/ignored nodes can produce incomplete/undefined or NaN derived widths in legacy. M3 initial contract: layout input must have **no node `ignore` flags and no adjacency `_hiding` flags**; reject before mutation with `unsupported-visibility-flag`.
  - `exist`, `drawn`, `selected` are rendering state and are ignored by pure layout.
- Unreachable nodes: reject as unsupported; layout is root-component only.

## 7. Empty, zero, invalid, deep, wide

- Empty graph/root missing: invalid.
- Single root: valid; no child allocation; root position 0 for selected phases; finite derived fields under correction.
- Zero `$dim`: valid; zero `dim-quotient` when all dims are zero.
- Non-finite/negative dim, non-positive angularWidth, non-finite radius/offset, unknown phase, negative/undefined depth: reject before commit.
- Deep chains: iterative level/angular-width/position passes; no call-stack recursion. Depth 10,000 is a **structural** M2/loader bound, not a promise that every offset/radius places successfully. Placement also depends on floating-point distance and the open-disk `(0,1)` policy; a 60-node chain at offset 0 already hits a precision boundary at d53.
- A 10,000-node chain with `offset=0.1` is tested as a valid structural/numerical case; its measured runtime is evidence only, not a performance budget. Depth caching still costs `O(N + D²)` for a chain.
- Wide trees: O(N) maps and O(N) adjacency; no recursive subtree walk.

## 8. Validation and mutation policy

### Staging requirement

The accepted M2 `Graph.computeLevels` mutates live `_depth` and `_flag` immediately. M3 must **not** call it on the live graph before staging; doing so would violate all-or-nothing.

M3 layout uses read-only graph traversal and temporary maps:

- `depthById: Map<string, number>` — initialized to `-1` for all nodes; root `0`;
- `flagById: Map<string, boolean>` — traversal-internal, initialized false;
- `angularWidthById`, `treeAngularWidthById`;
- per-phase position/data/scale records;
- `angleSpan` records.

Depth/traversal staging must preserve the accepted M2/legacy schedule exactly:

- use the same adjacency insertion order and M2 queue `unshift`/`pop` schedule;
- root depth 0; process reachable nodes with the same neighbor checks;
- do not call `computeLevels` or `eachBFS` on the live graph (both mutate `_flag`/read live fields);
- use a read-only adjacency iterator or a temporary copy of the queue.

### Commit policy

- `_depth`: **committed** from `depthById` only after all validation and staged calculations succeed. On failure, existing `_depth` values remain untouched.
- `_flag`: **internal-only**. It is not committed; live `_flag` values (including non-default pre-existing values) are preserved on both success and failure. The legacy/M2 transient flag is a traversal scratch value, not layout output.
- `_angularWidth` / `_treeAngularWidth`: staged, finite-validated, then committed.
- `angleSpan`, `node.scale`, selected-phase positions, `$span`, `$dim-quotient`: staged, finite-validated, then committed.
- `current/start/end` phases are independent; selected-phase commit only touches selected phases plus non-phase derived fields.
- Commit is all-or-nothing. A late validation/calculation failure must leave depths, flags, positions, phase data, angle spans, scales, and angular widths exactly as before.
- Do not mutate `data` metadata objects except reserved `$` fields.
- Commit is supported only for engine-owned M2 `Graph`/`GraphNode` instances, with immutable topology for the duration of the call, no concurrent mutation, and no `ignore`/`_hiding`/unreachable nodes. Subclasses, proxies, or caller-owned wrappers are outside the commit contract unless they explicitly satisfy the same invariants.

### Pre-application commit failure test (implemented)

Start with a graph whose root and descendants already have non-default `_depth`, `_flag`, current/start/end positions, `$span`, `$dim-quotient`, `angleSpan`, `scale`, `_angularWidth`, and `_treeAngularWidth`. The test-only hook fails after complete staging/preflight and before the first write; every live field/identity remains unchanged, including pre-existing `_flag` and `_depth`. This does not claim rollback after partial writes.

## 9. M3 modules/API

Source-to-module mapping:

| Legacy | Module | Status |
|---|---|---|
| `getData` legacy precedence | `layout/resolve.js` | **implemented** |
| `setAngularWidthForNodes` + subtree widths | `layout/angular-width.js` | **implemented** |
| `NodeDim` dimension resolution/measurement boundary | `layout/dimensions.js` | not created |
| `createLevelDistanceFunc` | `layout/distance.js` | **implemented** |
| `Layouts.Radial.computePositions` | `layout/radial.js` | **implemented** |
| Validated application | `layout/commit.js` | **implemented (in-memory only)** |
| Hypertree `refresh` phase copy | `layout/phases.js` | not created |
| Public exports | `layout/index.js` | **implemented** |

Implemented API:

```js
computeAngularWidths(graph, {
  rootId,
  phases = ['current', 'start', 'end'],
  nodeOptions = { overridable: false, dim: 3, angularWidth: 1, span: 1 },
  limits = { maxDepth: 10000, maxNodes: ... }
})
// -> {
//   rootId, phases, firstPhase,
//   depths: Map<string, number>,
//   angularWidths: Map<string, number>,
//   treeAngularWidths: Map<string, number>,
//   children: Map<string, string[]>,
//   nodeCount
// }
```

`computeLevelDistances` stages distance/scale/placement data with explicit numeric `radius`/`offset`; `stageRadialLayout` composes both and stages positions. `computeRadialLayout` alone preflights and commits in memory. See §5.

## 10. Root depth division-by-zero: finding and decision

**Source fact:** `setAngularWidthForNodes` uses the BFS action's second argument, which is `_depth` (`5077`), not an index. Root `_depth=0`, so `_angularWidth = diamValue / 0` is `Infinity` (or `NaN` if the resolved value is non-finite).

**Downstream effect (source + deduction):**

- root `_angularWidth = Infinity`;
- root `_treeAngularWidth = Math.max(Infinity, sum) = Infinity`;
- normal child angle allocation uses `child._treeAngularWidth` and `totalAngularWidths` of the parent's children, not the root's own `_treeAngularWidth`; ordinary child positions are therefore expected to remain finite and unchanged;
- root-only layout has no subsequent division;
- external consumers of root `_treeAngularWidth` see a non-finite value;
- if the root is `ignore`d or depth metadata is invalid, widths can become `NaN`; those cases are unsupported.

**Decision:** M3 corrects the root value to `_angularWidth = 0` and `_treeAngularWidth = max(0, sum(child widths))`. F20/F200 angular-width tests confirm non-root parity and finite root correction against child sums; radial positions are staged/committed in memory, while browser rendering remains NOT RUN.

## 11. Smallest next implementation task

The resolver, angular-width, distance, and staged radial slices are implemented and reviewed separately. The smallest next task is:

- validated in-memory commit is implemented; pre-apply failure test is implemented.
- next work is outside M3: renderer/focus/browser integration (NOT STARTED).

Do not implement rendering, focus, or browser measurement in that slice.












