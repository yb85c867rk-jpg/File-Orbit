# M5 Immediate Focus / Recenter — Contract and Source Mapping

- Status: **immediate focus slice implemented**; animation, focus-on-click, pan/zoom, touch, keyboard navigation, opening, previews, search, filesystem, Vue, and native integration are NOT implemented.
- Legacy reference: unchanged `vendor/jit/jit.2.0.1.js`, SHA-256 `4A413A0A21435AEE893EBE3572CAEB5EA81B14C437FA8BEC3AABB5F7A921546F`.
- Browser focus verification: **NOT RUN**.

## 1. Legacy audit and intentional differences

Legacy path:

- `Hypertree.onClick(id)` reads `graph.getNode(id).pos.getc(true)` and calls `move(pos)` (`jit.js:18090-18093`).
- `Hypertree.move(pos)` checks `|pos| < 1`, calls `graph.getClosestNodeToPos(versor)`, and animates with the `moebius` mode (`jit.js:18114-18133`).
- The animated `moebius` mode uses `v = vector.scale(-delta)` (`jit.js:6833-6838`).
- `Graph.Util.moebiusTransformation` negates the supplied point again (`jit.js:17843-17849`).
- `Complex.moebiusTransformation(c)` computes `(z + c) / (1 + conjugate(c) z)` (`jit.js:17821-17826`).

Therefore centering a point `f` uses:

```text
c = -f
T_c(z) = (z + c) / (1 + conjugate(c) z)
```

Modern intentional differences:

- The requested stable ID is centered directly. There is no closest-node substitution.
- No animation.
- Structural root/topology, node order, depths, and accepted M3 layout are unchanged.
- Focus is a pure staged view resolved from an authoritative base layout.

## 2. Pure focus view API

```js
const view = createFocusView(baseStaged, {
  focusId, // stable ID or null for identity/base
  phase
});
```

Returns:

```js
{
  requestedId,
  centeredId,
  phase,
  baseFocusPosition: { x, y },
  focusedPosition: { x, y },
  centerError,
  staged
}
```

Properties:

- `baseStaged` is never mutated.
- `staged.nodes` is a new Map; every position record in every phase is a new object; nested `spans`, `dimQuotients`, `angleSpan`, and copied top-level Maps are independently owned.
- Selected phase positions are transformed from the base, not from a previous focused view.
- Unselected phases are copied unchanged.
- Reset also returns independently owned records and is validated before return.
- `baseFocusPosition` is the source coordinate; `focusedPosition` is the measured transformed coordinate; `centerError = |focusedPosition|`.
- A candidate transformation is not evidence of a displayed focus; only successful frame installation may be reported as displayed.
- `children` is copied; root ID, IDs, order, depths, topology remain unchanged.
- Requested and centered IDs are the same stable ID.
- Repeated A → B → A is resolved from base and agrees with direct base → A; no drift.

## 3. Validation

Before returning:

- requested ID exists and is a string;
- selected phase exists;
- every copied phase has a position record;
- all phase positions have finite, nonnegative `rho` and finite Cartesian coordinates;
- input focuses/nodes are strictly inside the open unit disk;
- Möbius output is finite and strictly inside the open unit disk;
- singular/unrepresentable Möbius errors reject explicitly;
- measured center error is computed from `focusedPosition` and is `<= 1e-12` (`FOCUS_CENTER_TOLERANCE`);
- no coordinate clamping or tolerance adjustment is performed.

Error codes include `invalid-focus`, `focus-disk`, `focus-singular`, `focus-nonfinite`, and `focus-center`.

## 4. Frame integration

Harness sequence:

1. Invalidate interaction.
2. Build the focus view from the authoritative base layout.
3. Project and prepare graph scene (node sizes, hyperlines, labels, hit geometry).
4. Draw graph and update labels.
5. Install the hit snapshot only after success.
6. Restore selection explicitly if the selected ID is still hittable.

Use `installSelectionFrame(controller, { scene, generation, selectedId, draw })`:

- selected restoration uses `controller.restoreSelection(id)`, not a synthetic click or DOM event;
- restored callback reason is `restore` (programmatic), not `click`;
- failed preparation/drawing/labels/installation leaves interaction invalidated;
- requested focus is separate from successfully displayed focus.

## 5. Focus state and harness

`tests/harness/m5-focus/` provides:

- F20/F200, phase, actual/synthetic DPR;
- existing single-click selection;
- explicit **Focus selected** and **Reset focus**;
- clear selection, resize, destroy/recreate;
- retained labels/icons and indigo selection ring;
- `window.__M5_FOCUS_STATUS__`.

Focus is only initiated by **Focus selected**. A click selects; it never
automatically focuses.

Resize/DPR preserves the successfully displayed focus ID and reprojects it.
Fixture/phase replacement resets focus and selection. Destroy/recreate resets to
the base view. Resize restores selection only when still hittable.

Status includes operation/fixture/phase/generation, DPR/viewport, selected ID,
requested and displayed focus IDs, focus state, normalized focus point, center
error, prepared/drawn counts, labels, controller metadata, lifecycle, errors,
separated user/programmatic events, and numerical probes.

## 6. Verification

- Focus tests use actual legacy `Complex.moebiusTransformation` operations
  through the unchanged vendor file.
- F20/F200 transformation parity, identity/reset, topology/order/depth,
  open-disk rejection, near-boundary behavior, phase isolation, non-aliasing,
  repeated focus, transformed scene radius/hyperlines/hits, frame installation,
  selection restoration, and no click-event fabrication are covered.
- M4 render/static: **58/58**.
- M5 selection/controller: **28/28**; M5 focus/animation: **40/40**; M5 navigation: **22/22**; combined M5 **90/90**.
- Browser focus verification: **NOT RUN**.

## 7. Limitations

- Immediate focus only; no animation.
- No focus-on-click, pan/zoom, touch, keyboard navigation, or accessibility
  certification.
- No file opening/previews/search/filesystem/Vue/native.
- No full M5/application/browser/device parity claim.
- Very small peripheral nodes remain difficult to select at zero hit padding.









