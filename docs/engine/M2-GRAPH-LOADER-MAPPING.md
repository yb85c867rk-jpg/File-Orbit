# M2 — Graph and Tree Loader

- Date: 2026-10-25
- Scope: graph data model + rooted tree loader needed by Hypertree.
- Legacy reference: unchanged `vendor/jit/jit.2.0.1.js`, SHA-256 `4A413A0A21435AEE893EBE3572CAEB5EA81B14C437FA8BEC3AABB5F7A921546F`.
- Not in scope: layout positions, rendering, labels, focus animation, lifecycle, browser integration.

## 1. Legacy surface actually used by Hypertree

| Legacy source | Use |
|---|---|
| `Graph` `4013-4241` | `getNode`, `get`, `getByName`, `getAdjacence`, `addNode`, `addAdjacence`, `hasNode`, `empty` |
| `Graph.Node` `4647-4809` | `id`, `name`, `data`, `adjacencies`, `pos/startPos/endPos`, `angleSpan`, `selected/drawn/exist`, `getPos/setPos` |
| `Graph.Util.eachNode` `4923-4928` | node iteration |
| `Graph.Util.eachAdjacency` `4984-4997` | edge iteration; legacy swaps `nodeFrom/nodeTo` in place |
| `Graph.Util.computeLevels` `5020-5041` | `_depth` BFS schedule |
| `Graph.Util.eachBFS` `5069-5085` | layout traversal |
| `Graph.Util.eachLevel` `5106-5121` | `eachSubnode`, subtree traversal |
| `Graph.Util.getParents` `5271-5278` | parent lookup after levels |
| `Graph.Util.getClosestNodeToPos` `5359-5372` | Hypertree `move` (`18118`) and nearest-node focus |
| `Loader.construct` `8096-8145` | tree construction; graph-array branch not ported |
| `Loader.loadJSON` `8263-8275` | root id selection |
| Hypertree graph options `17935-17944` | `klass: Polar`, `selected:false`, `exist:true`, `drawn:true` |
| `Layouts.Radial` `11947-12023` | `computeLevels`, `eachBFS`, `eachSubnode`, positions |

Not ported: SpaceTree, charts, `Graph.Op`, rendering, labels, optional extras, graph-adjacency loader branch.

## 2. Modern API mapping

| Legacy | Modern |
|---|---|
| `new Graph(options, Node, Edge, Label)` | `new Graph({ positionClass, nodeDefaults, metadataLimits })` |
| `graph.nodes` object | `graph.nodes: Map<string, GraphNode>` |
| `graph.edges` nested object | `graph.edges: Map<string, Map<string, Adjacence>>` |
| `Graph.Node` | `GraphNode` |
| `Graph.Adjacence` | `Adjacence` |
| `graph.getNode/get/getByName/getAdjacence` | same names |
| `graph.addNode/addAdjacence/hasNode/empty` | same names |
| `graph.each/eachNode/computeLevels/eachBFS/clean/getClosestNodeToPos/getClosestNodeToOrigin` | same names |
| `node.eachAdjacency/eachLevel/eachSubgraph/eachSubnode/anySubnode/getSubnodes/getParents/isDescendantOf` | same names |
| `node.getPos/setPos` | same names |
| `node.getData/setData/removeData` | same names (simple data store) |
| `Loader.construct/loadJSON` | `loadTree(tree, options)` → `{ graph, rootId }` |
| `node.pos/startPos/endPos` | independent `Polar` instances |
| `$jit`/`Class`/prototype append | explicit ESM classes; no prototype mutation |

## 3. Input contract

**Primary and only input:** a rooted folder/file tree object.

```js
{
  id: "root",          // required, non-empty string
  name: "Root",        // required string
  kind: "folder",      // required: "folder" | "file"
  data: { ... },       // optional plain metadata object
  children: [ ... ]    // optional array; only folder may have non-empty children
}
```

- Root selection is the input object itself; `rootId = tree.id`.
- Empty input (`null`, `{}`) is invalid. A single root (file or empty folder) is valid.
- Legacy graph-adjacency arrays are **rejected** with `unsupported-graph`; they are not reinterpreted as trees.
- Duplicate IDs are rejected before replacement.
- Repeated object references and cycles are rejected.
- Missing edge targets, self-loops, and duplicate edges do not exist in tree-only input; graph input is unsupported.
- Unknown node fields are rejected.
- Node/depth/children/metadata limits are explicit and overridable (`limits` option).

### Accessor and array contract

- Own-property descriptors are validated **before any value is read**.
- Mandatory `id`, `name`, and `kind` must be own, enumerable data properties.
- Node accessors, non-enumerable fields, symbol fields, and unknown fields are rejected.
- `children` must be a dense array with only normal `length` (non-enumerable) and enumerable data indices.
- Sparse arrays, accessor-backed indices, extra/symbol properties, and non-enumerable entries are rejected before entries are read.
- Supported inputs are plain data objects/arrays. Arbitrary `Proxy` inputs are outside this contract; inspecting them can execute their own traps, so they are not claimed to be safely inspectable.

### Metadata rules

- Only JSON-like values: `null`, boolean, finite number, string, array, plain object.
- `undefined`, non-finite numbers, bigint, symbol, function, class instances, accessors, and cycles are rejected.
- Metadata is deep-copied into null-prototype objects, so keys `__proto__`, `constructor`, and `toString` are ordinary safe keys.
- Limits: 64 keys/object, depth 8, 4,096 chars/string, 128 array items, 16,384 approximate bytes/node.
- `startData` and `endData` are independent stores; `getData/setData` use `$`-prefixed keys.

### Failure atomicity and replacement configuration

`loadTree` builds and validates a new graph first. If `targetGraph` is supplied, `replaceWith` happens only after success. A failed load leaves the target graph unchanged. The input object is never mutated.

Replacement policy:

- If `positionClass`/`nodeDefaults` are omitted, the target graph's configuration is inherited.
- Explicit `positionClass`/`nodeDefaults` build the new graph with the override, and a successful replacement updates the target configuration together with all nodes.
- `metadataLimits` are inherited from the target when `limits` is omitted; an explicit `limits` updates the replacement configuration.
- `Graph` snapshots `nodeDefaults` and `metadataLimits`, so later caller mutation does not affect subsequently added nodes.
- `Graph.replaceWith` copies `positionClass`, `nodeDefaults`, `metadataLimits`, nodes, and edges together; a failed load never partially applies this configuration.
- A target metadata limit stricter than the loader's validation limit may reject during node construction; the target remains unchanged.

## 4. Ordering and layout implications

- `graph.nodes` and each node's `adjacencies` use **Map insertion order**.
- Tree loader insertion is preorder: root, first child, that child's subtree, next sibling.
- `eachNode` / `eachAdjacency` iterate insertion order.
- `computeLevels` and `eachBFS` preserve the legacy reverse-sibling queue (`unshift`/`pop`) schedule.
- `eachLevel` is iterative but visits children in adjacency insertion order and preserves the legacy action-return stop rule.
- Flag behavior is deliberately legacy-compatible:
  - `eachLevel`, `eachSubnode`, and `eachSubgraph` do **not** forward flags to `eachAdjacency`; edge flags therefore do not prune level traversal.
  - Those methods filter the **action on nodes** with the flags; a filtered parent is not visited but its descendants are still traversed.
  - `eachAdjacency`, `computeLevels`, and `eachBFS` do honor flags on adjacencies/nodes.
- `getClosestNodeToPos` uses strict `<`; the **first node in iteration order wins ties**.
- Legacy object enumeration sorts integer-like keys numerically. Modern Map order is insertion order. This is an **intentional difference**; non-integer IDs match legacy order, integer-like IDs do not.
- Layout implication: sibling angular order follows insertion order for integer-like IDs rather than legacy numeric-sorted order. Documented, deterministic, and tested.

## 5. Intentional differences / corrections

| Legacy | Modern |
|---|---|
| `id` can be number/coerced in graph maps | string-only, non-empty validation |
| duplicate IDs silently reuse a node | duplicate rejected |
| cyclic/repeated tree input can recurse | iterative loader; cycle/repeated rejected |
| recursive tree loading/traversal | iterative loading; iterative `eachLevel`/`isDescendantOf` |
| object prototype keys can collide | `Map` for nodes/edges; null-prototype metadata |
| metadata retained by reference (`$.merge` shallow) | JSON-like metadata copied with limits |
| direct property reads can invoke getters | descriptors validated; mandatory fields must be data properties; children arrays structurally validated |
| replacement changes nodes only | replacement copies positionClass/nodeDefaults/metadataLimits with nodes/edges |
| one shared mutable adjacency swapped during iteration | directed adjacency records; no mutation during traversal |
| `eachLevel` ignores edge flags | preserved deliberately; node flags filter actions, descendants still traversed |
| graph-array input supported | tree-only (`unsupported-graph` for arrays) |
| no resource limits | explicit node/depth/children/metadata limits |
| `getData` depends on `Config.overridable` | simple `$prop` store; layout options belong to M3 |

## 6. Tests

Command:

```powershell
node --test --test-isolation=none tests/engine/graph/graph-loader.test.mjs
```

Runtime: Node **v24.12.0**.

Result (2026-10-25): **19 tests, 19 pass, 0 fail.**

M1 integration regression:

```powershell
node --test --test-isolation=none tests/engine/math/math.test.mjs
```

Result: **16 tests, 16 pass, 0 fail**; M1 source/tests unchanged.

Coverage:

- deterministic small tree; fixed-seed legacy tree parity; empty/single-root
- duplicate IDs; prototype-like IDs; numeric ID rejection
- cyclic/repeated objects
- malformed children/metadata and limit violations
- input immutability and metadata copy
- accessor/non-enumerable/symbol/array-structure rejection without getter invocation
- failure-atomic target replacement and configuration inheritance/override
- independent current/start/end positions
- fixed-seed legacy node/edge/level/BFS/parent/closest comparisons
- node flags vs edge flags in `eachLevel`, `eachSubnode`, `eachSubgraph`, and direct adjacency iteration
- tie policy (first insertion) and non-tied closest
- integer-like ID ordering difference
- 10,000-depth chain and 2,000-wide folder
- filter flags and mutation helpers

Legacy reference verifies the vendor SHA-256 before comparisons.

## 7. Remaining limits

- No layout computation (M3), rendering/labels, focus animation, lifecycle, browser harness, or application/native work.
- No REA verification; REA remains blocked.
- Graph-adjacency input is intentionally unsupported.
- Browser parity/device behavior is NOT RUN.

