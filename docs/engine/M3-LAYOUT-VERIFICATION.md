# M3 — Layout Verification Plan

- Date: 2026-10-25
- Status: **validated in-memory commit implemented/tested** — resolver, angular widths, distances, staged radial positions, and commit; browser/renderer remains NOT RUN.
- Oracle: unchanged `vendor/jit/jit.2.0.1.js`, SHA-256 `4A413A0A21435AEE893EBE3572CAEB5EA81B14C437FA8BEC3AABB5F7A921546F`.

## 1. Deterministic fixtures

All fixtures are synthetic. IDs are strings; sibling order is ascending creation order.

### F20 — 20-node binary heap

**Construction:**

```text
n0 = folder, root
for i = 1..19:
  parent = n[floor((i-1)/2)]
  kind   = i < 10 ? "folder" : "file"
  id     = "n" + i
  add child to parent.children in ascending i
```

- Node count: **20**.
- Max depth: **4** (`n0 → n1 → n3 → n7 → n15`).
- Folders: `n0..n9`; files: `n10..n19`.
- Names: `"Node " + i`.
- Data (all nodes): `$dim = 4 + (i % 5)`; `$angularWidth = 1 + (i % 3) * 0.25`.
- Layout options: `Node.overridable=true`, `Node.dim=3`, `Node.angularWidth=1`, `autoWidth=false`, `autoHeight=false`; `radius=100`, `offset=0`; phases `current,start,end`.
- **Creation order:** `n0,n1,...,n19` (the order in the construction loop).
- **Graph insertion order after `loadTree`:** the complete preorder is
  `n0,n1,n3,n7,n15,n16,n8,n17,n18,n4,n9,n19,n10,n2,n5,n11,n12,n6,n13,n14`.
- **Parent adjacency keys:** the parent is inserted first for non-root nodes, then children in ascending `i`. Root `n0` adjacency keys are `n1,n2`. Example: `n1` adjacency keys are `n0,n3,n4`; its sibling/child order is `n3,n4`. Example: `n2` keys are `n0,n5,n6`.
- **Sibling order used by layout:** children in ascending `i`, excluding the parent edge.
- **BFS visitation (`eachBFS`):** `n0,n1,n2,...,n19` for F20 (the accepted M2 queue schedule; this is not the preorder).
- Root `n0`; all nodes reachable; no flags.

### F200 — 200-node 5-ary heap

**Construction:**

```text
n0 = folder, root
for i = 1..199:
  parent = n[floor((i-1)/5)]
  kind   = i < 40 ? "folder" : "file"
  id     = "n" + i
  add child to parent.children in ascending i
```

- Node count: **200**.
- Max depth: **4**.
- Folders: `n0..n39`; files: `n40..n199`.
- Names: `"Node " + i`.
- Data: `$dim = 4 + (i % 7)`; `$angularWidth = 0.8 + (i % 5) * 0.1`.
- Layout options: `overridable=true`, `radius=250`, `offset=0`, all phases.
- **Expected-order rule:** `preorder(n0)`, defined recursively as:
  ```text
  visit(id):
    append id
    for each child of id in ascending numeric suffix i:
      visit(child)
  ```
  This is DFS preorder, not numeric creation order. The first segment is
  `n0,n1,n6,n31,n156,...`; do not substitute `n0,n1,n2,...`.
- **Root adjacency keys:** `n1,n2,n3,n4,n5`; non-root adjacency keys have the
  parent first, then children in ascending `i`.
- **BFS visitation:** `n0,n1,n2,...,n199` for F200 (M2 queue schedule; not preorder).
- **Legacy mirror:** build legacy nodes/edges in the same preorder and add each
  parent's children in ascending `i`; because IDs are non-integer (`n...`),
  legacy object insertion order matches the modern Map order. Do not sort keys.

These recipes are exact and reproducible without a random seed. If a generator is used, it must reproduce this parent/kind/data mapping exactly.

## 2. Focused fixtures

| Fixture | Construction | Purpose |
|---|---|---|
| `single-root` | `{id:"solo", kind:"folder"}`; dim 5, angularWidth 1 | root-only, zero child division |
| `unequal` | root `r`; children `a(dim=2, angular=1)`, `b(dim=10, angular=2)`, `c(dim=6, angular=1.5)` | unequal sibling dimensions/angular shares |
| `integer-ids` | root `r`; children `"10"`, `"2"`, `"1"` | Map insertion order vs legacy numeric object-key order |
| `deep-chain` | 1,000 (and 10,000) linear folder chain | iterative recursion safety |
| `wide` | root `wide` + 1,000 files | wide sibling allocation |
| `invalid-dims` | dim `NaN`/`Infinity`/`-1`; angular `0`/`-1`; radius `NaN`/`auto` | explicit rejection |
| `zero-dims` | all `$dim=0` | zero dimension/quotient policy |
| `root-angular` | root + one child; compare root `_angularWidth`/`_treeAngularWidth` | root division correction |
| `phases` | same tree, compute only `end`, then only `current` | phase isolation |
| `flags` | node `ignore=true`; adjacency `_hiding=true` | unsupported visibility handling |
| `unreachable` | direct M2 Graph with two components | topology rejection |
| `atomicity` | pre-populate non-default depths/flags/positions/phase data; inject failure after staging, before commit | zero live mutation on failure |

## 3. Legacy oracle procedure

1. Load the unchanged vendor file in a Node VM with the existing M2 DOM stub; verify SHA-256 before use.
2. Build the legacy graph with `Legacy.Graph`, `klass: Legacy.Polar`, and a Node config:
   `overridable:true`, `dim:3`, `angularWidth:1`, `span:1`, `autoWidth:false`, `autoHeight:false`.
3. Insert legacy nodes/edges using the accepted M2 insertion policy:
   - node insertion in DFS preorder;
   - each parent’s children added in ascending `i`;
   - parent edge exists before child edges; legacy object insertion order is preserved for non-integer IDs;
   - do not sort or reverse sibling adjacency.
   - set `$dim`/`$angularWidth` data on each node after insertion.
4. Create a layout host and execute the **actual** legacy `Layouts.Radial.compute`:
   - host prototype: `Legacy.Layouts.Radial.prototype`;
   - `graph`, `root`, `config`, `parent=null`;
   - `createLevelDistanceFunc` from `Legacy.Hypertree.prototype`;
   - `getRadius` returns the fixture’s explicit numeric radius (never `auto`).
5. `NodeDim` uses supplied dimensions; `autoWidth/autoHeight=false`. The DOM stub is only for the label element created by `NodeDim.initializeLabel`; no `offsetWidth/offsetHeight` measurement is used. This is **actual legacy layout arithmetic**, not a stubbed layout.
6. Extract node IDs, depths, `_angularWidth`, `_treeAngularWidth`, `angleSpan`, `scale`, positions for each phase, `$span`, `$dim-quotient`.
7. Record root `_angularWidth`/`_treeAngularWidth` as legacy Infinity separately; never require Infinity as correctness.

Browser measurement is **not** part of this oracle. `autoWidth`/`autoHeight` must stay false, and no DOM measurement value may be invented in Node.

## 4. Comparison rules (declared before implementation)

### Exact

- Node ID set and insertion order.
- Parent/child adjacency and sibling order.
- Depth values.
- Phase selection.
- `node.scale` assignment (same radius).
- Root position coordinates exactly `(0,0)`.
- Error categories for invalid/unsupported inputs.

### Angular values

Use wrapped angular distance **only for orientation values such as `theta`**:

```text
wrap(a,b) = abs(atan2(sin(a-b), cos(a-b)))
```

- `THETA_TOL = 1e-12` rad.
- Applies to child `theta` and other orientation comparisons only.
- Do **not** use wrapping for `$span`, `angleSpan.begin/end`, contiguity, or total coverage.

Use ordinary absolute/relative numeric comparison for:

- `$span` values;
- `angleSpan` interval endpoints (they are unwrapped partition boundaries);
- contiguity (`child.begin` vs previous `end`);
- total angular coverage (`2*PI` vs root span).

`span = 0` and `span = 2*PI` must not compare equal. The verifier must explicitly assert this distinction using the ordinary comparator.

- `SPAN_ABS = 1e-12`, `SPAN_REL = 1e-12`.
- Acceptance: `abs(actual-expected) <= SPAN_ABS + SPAN_REL * max(1, abs(expected))`.
- Root `angleSpan` must satisfy `begin=0` and `end=2*PI` under this ordinary comparator; `end` must not be wrapped to 0.
- Child interval contiguity uses the same ordinary comparator; no periodic equivalence is allowed at partition boundaries.

Justification: these are partition lengths/positions in a linear interval, not orientations; wrapping would hide a full-turn allocation error.

### Radius / Cartesian

- `RHO_ABS = 1e-9`, `RHO_REL = 1e-12`.
- `CART_ABS = 1e-9`, `CART_REL = 1e-12`.
- Acceptance: `abs(actual-expected) <= absTol + relTol * max(1, abs(expected))`.

Justification: radius ≤250 in fixtures; double ulp ~3e-14; pow/sum chains are short; 1e-9 absolute leaves margin without hiding a wrong level distance.

### Derived data

- `$span`: ordinary numeric comparison (`SPAN_ABS`/`SPAN_REL`), **never wrapped**.
- `$dim-quotient`: `1e-12` absolute/relative.
- `_angularWidth`/`_treeAngularWidth` non-root: `1e-12` relative/absolute.
- Root angular fields: not compared to Infinity; modern root `_angularWidth` must be `0` and root `_treeAngularWidth` finite.
- Legacy Infinity/NaN is **never** an oracle requirement.

No tolerance may be relaxed after seeing failures.

## 5. Invariants

- All selected-phase `rho`, `theta`, Cartesian coordinates, `scale`, angular widths, spans, and quotients are finite.
- Root is `(0,0)` for every selected phase.
- Non-root `rho >= 0`; theta is compared with wrapped distance.
- Child `angleSpan` intervals are contiguous within their parent’s interval using the ordinary span comparator:
  `|child[i].begin - previous.end|` and `|final.end - parent.end|` within `SPAN_ABS + SPAN_REL*max(1,abs(expected))`. No angular wrapping is applied.
- Root `angleSpan.begin` is exactly `0` and `angleSpan.end` equals `2*PI` under the ordinary comparator; `2*PI` must not be treated as `0`.
- Root `$span` is `2*PI`; a child `$span` of `0` is not equal to `2*PI`.
- The verifier must include a direct span-comparator test feeding `0` and `2*PI`; the ordinary comparator must return not-equal (no periodic equivalence).
- `_angularWidth(root) = 0`; `_treeAngularWidth(root)` equals the postorder max(0, sum children).
- Non-root `_treeAngularWidth >= _angularWidth`.
- `dim-quotient` finite; when `maxDim=0`, quotient is `0`; otherwise `0 <= quotient <= 1`.
- Unselected phases are byte/value-unchanged (positions and phase data).
- Selected current/start/end position objects remain distinct.
- Deep/wide fixtures complete without recursion error.

### Commit failure atomicity test (implemented)

1. Build F20 or a smaller tree; pre-populate every node with non-default live state:
   - `_depth` values not equal to computed depths;
   - `_flag` values including `true` on selected nodes;
   - distinct current/start/end positions with non-zero rho/theta;
   - `$span`, `$dim-quotient`, `angleSpan`, `scale`, `_angularWidth`, `_treeAngularWidth` with non-default values.
2. Snapshot every live field, including position-object identity and phase data.
3. Invoke `computeRadialLayout` with the internal test-only pre-application hook; the hook throws after complete staging and destination preflight but before the first write.
4. Assert:
   - every pre-existing `_depth` and `_flag` is unchanged;
   - current/start/end position object identities, rho/theta, and data are unchanged;
   - `angleSpan`, `scale`, `_angularWidth`, `_treeAngularWidth` are unchanged;
   - no partial new positions or phase data exist.
5. Late non-writable position/frozen phase store/accessor target tests also assert earlier nodes remain unchanged.

This is a pre-application failure test, not a rollback-after-partial-write proof. No partial-write rollback is implemented; preflight plus validated direct writes are the supported atomicity mechanism.

## 6. Legacy comparison matrix

| Case | Compare to legacy | Notes |
|---|---|---|
| F20/F200 non-integer IDs | depths, non-root angular widths, positions, spans, scale | root fields corrected |
| single-root | root position 0, finite derived fields | legacy root Infinity excluded |
| unequal | theta/rho, spans, dim-quotient | dimensions supplied |
| integer-like IDs | **no exact legacy angle-order comparison** | modern Map order is intentional; assert policy |
| deep/wide | invariants only | legacy recursion is not a correctness target |
| invalid | exact rejection categories | no legacy execution required |
| phases | phase isolation + selected values | legacy compute with subset |
| flags/unreachable | exact unsupported errors | legacy mixed/NaN behavior not preserved |

**This slice executed depth/angular-width/distance, staged radial arithmetic, and in-memory commit rows.** Browser rendering, device layout, and renderer/focus comparisons remain NOT RUN.

### Distance precision boundary

- **60-node chain, radius=100, offset=0**: rejects at parent `d53` with `radial-domain`. Descending double-precision accumulation rounds that parent distance to `1`; this is the documented open-disk rejection, not a clamp or coefficient change. Inputs/live fields are asserted unchanged.
- **10,000-node chain, radius=100, offset=0.1**: succeeds; `maxDepth=9999`, `distances=10,000`, `placementDistances=9,999`, all placement values finite and strictly in `(0,1)`. Inputs/live fields are asserted unchanged.
- **Not previously covered:** the earlier 8-test distance suite did not contain the 10,000-node case; these are new tests.
- Depth 10,000 is a structural bound. Successful placement still depends on floating-point precision and offset. Complexity is `O(N + sum over distinct depths of (depth+1))`; for a chain this is `O(N + D²)`, even with depth caching. Measured runtime is evidence, not a budget.

### Radial checks

- Actual `Layouts.Radial.compute` parity: F20/F200, unequal sibling weights/dims, single root, and selected-phase `end` case.
- IDs/order, depths, root `(0,0)`, non-root theta/rho/Cartesian, angleSpan, span, dim-quotient, and scale are compared where legacy writes them.
- Root dim-quotient is asserted absent in both modern output and legacy writes.
- Zero dimensions: modern quotient `0`; legacy `0/0` NaN is recorded as an intentional correction while positions/spans still compare.
- Invalid child dimensions are rejected; invalid root dimension is not read (root quotient policy).
- Extreme weight underflow is rejected with `allocation-underflow`; no clamp/renormalization.
- Wide 1,000-child and deep 10,000-chain staged layouts; 60-chain offset=0 still rejects at d53.
- Success and failure preserve all live state/identities; no unselected-phase records.

### Commit checks

- Applied values match staged values; F20/F200 committed positions/data match actual legacy radial arithmetic.
- Position/data identities and unselected phases remain intact; `angleSpan` is replaced by a fresh object, not the staged alias.
- Single-root and root dim-quotient no-write/no-delete.
- current-only, end-only, all-phase, and repeated synchronous layouts.
- Test-only pre-application failure hook after complete staging/preflight leaves all live values/identities unchanged.
- Late non-writable position, frozen phase store, accessor-backed data, inherited non-writable data, inherited setters, conflicting inherited node slot, and unsupported position class are rejected before any write; inherited setter call counts are zero.
- True/false `_flag` values survive success and failure.
- Supported atomicity is preflight + validated direct writes; partial-write rollback is not claimed.

## 7. Actual status

- M3 first slice (`resolve.js`, `angular-width.js`, errors/exports): **IMPLEMENTED**.
- M3 angular-width tests: **14/14 PASS** (`node --test --test-isolation=none`, Node v24.12.0).
- M3 distance slice (`distance.js`): **IMPLEMENTED**.
- M3 distance tests: **10/10 PASS**.
- M3 radial tests: **12/12 PASS**.
- M3 commit tests: **14/14 PASS**; combined M3 **50/50 PASS**.
- Actual legacy angular methods executed for F20/F200: **PASS**; root Infinity recorded separately.
- Actual legacy `Hypertree.createLevelDistanceFunc` executed for F20/F200, single root, shallow chains, coefficient transitions, offsets, and multiple radii: **PASS**.
- Distance raw/placement policy: parent placement requires `0 < distance < 1`; leaf/single-root raw distances are not clamped.
- M2 regression: **19/19 PASS**; M1 regression: **16/16 PASS** (run once after this slice).
- Actual legacy radial `Layouts.Radial.compute` executed for F20/F200, unequal, single-root, and selected-phase fixtures: **PASS**.
- Live in-memory commit now applies staged values; rendering/focus remain **NOT IMPLEMENTED/NOT RUN**.
- Pre-application failure test: **PASS** (test-only hook after staging/preflight, before writes).
- Post-partial-write rollback: **not claimed/not implemented**; preflight covers supported ordinary targets.
- Browser/device layout parity: **NOT RUN**.
- REA: **NOT RUN** and not used.

Evidence: `evidence/m3/`. The legacy oracle loads the unchanged vendor file and calls the actual `Layouts.Radial.setAngularWidthForNodes` / `setSubtreesAngularWidth` methods, the actual `Hypertree.createLevelDistanceFunc`, and the actual `Layouts.Radial.compute` for staged radial parity; no layout formula is reimplemented as the oracle.

Node VM arithmetic parity does **not** establish browser rendering, mobile compatibility, or full engine completion. The earlier full-layout beforeCommit test is now represented by the pre-application commit test; no partial-write rollback is claimed.









