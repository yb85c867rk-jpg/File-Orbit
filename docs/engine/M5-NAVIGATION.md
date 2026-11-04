# M5 Desktop Mouse Navigation — Camera/Pan/Zoom Contract

- Status: **desktop mouse pan/zoom slice implemented**; touch, keyboard navigation, inertia, automatic focus-on-click, opening/previews/search, filesystem, Vue, and native integration are NOT implemented.
- Legacy/vendor `jit.js` is unchanged.
- M5 selection/controller 28/28; focus/animation 40/40; navigation 22/22
- Browser navigation verification: **NOT RUN**.

## 1. Pure camera

Camera state is CSS pixels:

```js
{ zoom: 1, panX: 0, panY: 0 }
```

Limits:

- zoom `0.25..8`
- pan magnitude `<= 1,000,000` CSS px
- drag threshold `4` CSS px
- wheel line unit `16` CSS px; physical page uses viewport height
- per-event wheel delta clamped to `1200` CSS px

Equation around viewport center:

```text
screen = viewportCenter + pan + zoom * (baseCss - viewportCenter)
```

Pure functions:

```js
cameraForward(camera, baseCss, viewport)
cameraInverse(camera, screenCss, viewport)
panCamera(camera, dx, dy)
zoomCameraAt(camera, factor, anchor, viewport)
normalizeWheelDelta(delta, deltaMode, viewport)
wheelZoomFactor(normalizedDelta)
resetCamera()
```

Pointer-anchored zoom keeps the world point under the pointer stationary within
`1e-9` in tests. Resize preserves zoom/pan as CSS offsets relative to the new
viewport center. Pan/reset are CSS-only and never multiply by DPR.

## 2. Camera scene

`applyCameraToScene(scene, camera, viewport)` creates a new scene:

- node centers transform through the camera;
- node radii = base hyperbolic CSS radius * zoom exactly once;
- hyperline endpoints/centers transform; arc radius scales by zoom;
- labels consume transformed node centers/radii;
- hit snapshots consume the exact transformed circle/diamond geometry.

Fixed CSS sizes: label text/icons, edge stroke widths, selection-ring width/gap.
Camera is not applied through a Canvas transform or twice through projection.

## 3. Navigation controller

`createMouseNavigationController(canvas, { viewport, camera, onCameraChange, ... })`

- Owns canvas pointer/wheel/click-capture listeners only.
- Primary mouse pointer drag; threshold 4 CSS px.
- Pointer capture during drag; `pointerup`, `pointercancel`,
  `lostpointercapture` cleanup.
- Wheel zoom anchored at pointer; `deltaMode` 0/1/2 normalized.
- Ctrl/Meta wheel bypasses browser zoom handling; no preventDefault for ignored
  events.
- Wheel listener is `{passive:false}`; no other default cancellation.
- No inertia, timers, or perpetual loop.
- Drag-generated click is suppressed via a capture-phase one-shot contract;
  next pointerdown clears any stale suppression.
- Camera callback must be synchronous; thenables reject. Failed frame callbacks
  do not update the controller camera state.
- Destroy is idempotent, releases pointer capture and removes exact listener
  identities.

## 4. Rendering/selection order

1. Invalidate selection interaction.
2. Build focus view (if any) and camera scene.
3. Draw graph; update labels.
4. Install matching hit geometry with a new generation.
5. Restore selected ID if still hittable.

A drag does not generate selection/empty-space clear; a below-threshold click
still selects normally. The next genuine click after a drag is not suppressed.
Camera visibility is recomputed from the final screen radius against the strict
`minNodeRadius` threshold; a node hidden for semantic reasons above that threshold
is not revived. Pointer/wheel validation and camera computation failures abort
the active drag, release capture, preserve the last displayed camera, notify
once, and leave stale events inert. Selection redraw failures use the shared
`redrawSelectionFrame` helper: cleanup suppresses reentrant selection callbacks,
invalidates the hit snapshot, clears the active selection evidence, and leaves
later clicks inert until a successful frame installation. Failure does not claim
a successfully displayed replacement or pixel rollback.

Focus replacement resets camera identity. Camera movement afterward preserves
the displayed focus view and focused ID. Reset/fixture/phase/recreate reset camera,
focus, and selection as specified.

## 5. Harness

`tests/harness/m5-navigation/` provides F20/F200, phase, actual/synthetic DPR,
mouse drag, wheel zoom, center-anchored Zoom in/out, Reset camera, immediate
Focus selected/Reset focus, clear selection, resize, destroy/recreate, labels,
and selection ring.

```text
http://127.0.0.1:8765/tests/harness/m5-navigation/
```

```js
copy(JSON.stringify(window.__M5_NAVIGATION_STATUS__, null, 2))
```

Status includes requested/displayed camera, operation, drag/capture state,
handled/ignored event reason, selected/focused IDs, generation, viewport/DPR,
node/edge/label counts, lifecycle/errors, and separate numerical coordinate/hit
probes.

## 6. Verification

- M4 render/static: **58/58**
- M5 interaction/focus/navigation: **90/90**
- M5 selection/controller 28/28; focus/animation 40/40; navigation 22/22
- Browser navigation verification: **NOT RUN**

Mocked pointer/timing/rendering is not browser smoothness, FPS, memory, or device
evidence.

## 7. Limitations

- Desktop mouse only; no touch/keyboard.
- No inertia, pan/zoom animation, or automatic focus-on-click.
- No opening/previews/search/filesystem/Vue/native.
- No full M5/application/browser/device certification.




