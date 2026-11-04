# M5 Node Selection — Contract and Source Mapping

- Status: **first M5 interaction slice implemented**; focus/recentering, animation, pan/zoom, file access/opening, previews, search, touch/keyboard interaction, Vue, and native integration are NOT implemented.
- Legacy reference: unchanged `vendor/jit/jit.2.0.1.js`, SHA-256 `4A413A0A21435AEE893EBE3572CAEB5EA81B14C437FA8BEC3AABB5F7A921546F`.
- Browser interaction verification: **NOT RUN**. Prior surface/graph/labels observations remain scoped.

## 1. Source mapping and known legacy mismatch

Legacy `Hypertree.Plot.NodeTypes.circle.contains` (`jit.js:18374-18378`) uses:

- `node.getData('dim')` without the transform shrink
- `node.pos.getc().$scale(node.scale)`

It ignores the rendered `dim * (1 - squaredNorm)` transform. Modern hit testing uses the already-rendered CSS-pixel node geometry from the prepared graph scene, so a transformed peripheral node is not hit in its oversized legacy region.

Legacy has no diamond node type. The modern file diamond is hit as the actual four-vertex rendered diamond, not as a square or circle.

## 2. Hit-test contract

```js
const snapshot = createHitSnapshot(scene);
const id = hitTestNode(snapshot, { x, y });
```

- O(N) reverse scan; no spatial index.
- Circle: `dx² + dy² <= radius²`.
- Diamond: `|dx| + |dy| <= radius`.
- Hidden (`visible !== true`) or `radius <= 0` nodes are not hittable.
- Extra hit padding is **zero**; stroke width and decorative selection rings do not contribute.
- Boundary is inclusive.
- Overlaps resolve in reverse drawing order: the last drawn matching node wins.
- Returns a stable string ID or `null`.
- The snapshot is validated/frozen and independent of later public scene mutation.
- No edge or label hit targets.

## 3. Coordinate contract

`clientToCanvasCss(canvas, clientX, clientY)`:

- Reads `getBoundingClientRect()` at event time.
- Subtracts canvas `clientLeft/clientTop` border and declared computed canvas padding.
- Page scroll is reflected by the rect; DPR is never multiplied into mouse coordinates.
- Translation-only: arbitrary CSS transform scaling/rotation is unsupported.
- Host must not introduce padding/internal scrolling between the canvas and its drawable origin without an explicit update. Canvas border/padding is handled by the helper.
- Hit snapshot and frame must share scene generation, phase, projection, and viewport.
- `scene.phase` and `scene.projection.width/height` are authoritative. Optional `phase`/`viewport` arguments must agree exactly; omitted viewport is derived from the scene projection.
- Generation is a positive safe integer and must strictly increase for each update. Same/stale generation is rejected; there is no same-generation replacement path.
- Invalid replacement preserves snapshot, selection, generation, and callback history (`lastCallbackError`).

## 4. Controller contract

```js
const controller = createSelectionController(canvas, { onChange });
controller.update({ scene, generation }); // phase/viewport derived from scene
controller.clear();
controller.invalidate();
controller.getState();
controller.destroy();
```

- Owns exactly one `click` listener on the supplied canvas; no document/window listeners.
- Primary button only (`button === 0`); unsupported buttons/events ignored.
- Click hit selects ID; empty canvas clears.
- Re-selecting the same ID is deterministic and does not notify again.
- `update()` validates the complete replacement and frame metadata before swapping; invalid replacement preserves previous snapshot/selection/generation/callback history.
- `installSelectionFrame(controller, {scene, generation, draw})` invalidates first, draws/updates labels, then installs the hit snapshot only after success. Preparation/drawing/install failure leaves interaction invalidated.
- Selection IDs that disappear or become non-rendered are cleared.
- `invalidate()` drops snapshot/selection without removing the listener; stale clicks are inert until a new update.
- Zero-sized viewport clears selection and refuses hits.
- Notification happens after internal state is coherent. Callback throws are recorded in `lastCallbackError`; state remains coherent and the controller remains installed.
- `destroy()` is idempotent, removes the exact listener identity, clears state, and leaves other instances intact.
- Selection state is outside M2 graph metadata and layout state.
- No timers, observers, animation loops, or global registries.

## 5. Selection presentation

`drawGraphScene(surface, scene, { selectedId, selection })`:

- Ring is drawn after edges and nodes; node draw order is unchanged.
- Indigo ring (`#818cf8`), additional outline, not a hit target.
- Does not mutate layout coordinates, node radius, scene records, or label geometry.
- Ring is not filled and does not enlarge the selectable shape.
- `DEFAULT_SELECTION = { color:'#818cf8', width:2, gap:3 }`.
- Invalid selection options reject before clearing/drawing.
- Missing/hidden selected IDs draw no ring.
- Labels remain non-interactive with `pointer-events:none`.

## 6. Tests and harness

- M4 render/static: **58/58** (includes selection-ring renderer checks).
- M5 selection/controller: **28/28**. M5 focus/animation: **40/40**. M5 navigation: **22/22**. Combined M5: **90/90**.
  - hit geometry/interior/boundary/exterior
  - transformed peripheral vs legacy oversized region
  - hidden/zero-radius and ring/stroke exclusion
  - reverse-order overlaps
  - DPR-independent client coordinates and page scrolling
  - resize/scene/phase invalidation and invalid replacement
  - primary/empty/repeated selection
  - callback errors, listener identity, destroy idempotence, instance isolation
  - caller/snapshot mutation independence
  - renderer highlight without geometric mutation
- M1–M3 not rerun; no shared engine modules changed.

Harness: `tests/harness/m5-selection/` with F20/F200, phase, actual/synthetic DPR, resize, fixture update, clear, destroy/recreate, labels/icons retained, selected ID/name, scene generation, lifecycle, errors, and separately marked numerical probes vs actual user-click events.

## 7. Limitations

- Mouse only; not touch or keyboard accessible.
- Very small peripheral nodes remain difficult to click at zero extra hit padding.
- No focus/recentering, animation, pan/zoom, opening, previews, search, or file access.
- No edge/label hit testing.
- No full M5, application completion, browser/device parity, or accessibility certification claim.











