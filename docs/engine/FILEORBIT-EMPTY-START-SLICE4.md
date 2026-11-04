# FileOrbit Empty Startup and Creation Suspension — Slice 4

Status: **IMPLEMENTED — Node tests pass; native browser verification NOT RUN**

## No-map contract

Normal startup has no active map. There is no fixture boot, fabricated root, session, frame, model, history, or attachment registry.

- `hasMap=false` is explicit.
- Empty graph area and “Create a map to get started” sit inside the application root/fullscreen boundary.
- The single shared Create Map action is used by the empty state, desktop toolbar, and mobile Map menu.
- F20/F200 load only after explicit Development fixture selection.
- Search is disabled with “Create a map to search”.
- Details/results are empty.
- Undo/Redo and Fit are disabled.
- Theme and fullscreen remain usable.
- Resize/publication paths return before any graph frame.
- No canvas/label overlay exists until a map is installed.

## Creation presentation suspension

Entering Create Map after the dirty-editor choice captures:

- focused folder and selection
- details target
- camera/framing
- search query/input/results state
- viewport and dataset token/revision

It then hides canvas pixels, labels, selection decoration, details, editor, search results, drag feedback, and empty-state UI. Existing `tree/graph/model/session/registry/history` references remain authoritative; File/Blob payloads are not cloned.

While suspended:

- interaction ownership blocks canvas, labels, history, Fit, editor, and drag;
- theme/resize/publication/search refresh cannot redraw or reveal old presentation;
- viewer/context-menu/drag overlays are closed;
- candidate preparation remains isolated.

## Terminal ownership

`creationTerminal` is the single restoration/commit owner:

- `commit` — candidate installation commits; old presentation is discarded and new frame/details/search are published; old history/registry resources are cleared.
- `cancel` — old map presentation is restored with captured exploration/search state. If no old map existed, the empty startup state is restored.
- `failure` — old authoritative dataset is preserved; the old frame is recovered when possible, otherwise the inert/empty state remains. The error message is retained.
- `discard` — used when boot replaces/fixture-replaces the map, preventing a late cancel callback from restoring stale presentation.

Duplicate close/cancel/error callbacks cannot restore twice because the terminal value is cleared before restoration and commit/discard short-circuit.

Viewport changes during suspension cause a refit where automatic framing was used; manual framing is restored through the existing resize action.

## Normal-motion search reveal evidence

The actual `main.mjs` subprocess now includes a distinct normal-motion scenario:

- `matchMedia` returns reduced-motion false.
- Controlled `performance.now`, `requestAnimationFrame`, and `cancelAnimationFrame` supply explicit timestamps.
- A replacement map contains a synthetic supported PDF at `Docs/Report.pdf`.
- Search navigates into `Other2`, genuinely hiding the PDF.
- Status scene IDs and hit IDs exclude the PDF before activation.
- The actual search card starts a scheduled 780 ms transition.
- At 100 ms, the target is not selected, no viewer is open, and hits are inert.
- Advancing to 780 ms installs the parent scope, selects the PDF, sets matching hits, and opens the viewer exactly once from the current registry.
- The reduced-motion actual-entry regression is retained.

Identity/revision mismatch, stale dataset, waiter cancellation, and navigation failure are covered by focused search-activation/transition tests.

## Verification

- Full `tests/engine`: **688/688 pass**.
- Editor: **183/183**.
- Render: **91/91**.
- Interaction: **30/30**.
- Exploration: **157/157**.
- Syntax checks: pass.
- Browser-native verification: **NOT RUN**.

Mocked RAF/DOM evidence is not native-browser evidence.

## Deferred — NOT IMPLEMENTED

- Empty-start-screen usage tutorial slides.
- Previous/Next/Skip tutorial controls.
- Comprehensive UI polish.

Upload/Download and Embed remain out of scope.

## Limitations

- Native browser startup, resize, fullscreen, IME, focus, and viewer checks were not run.
- Final graph-label DOM absence after normal-motion reveal is not asserted; scene/hit absence and viewer state are asserted through the actual entry path.
- Creation failure with an existing map is code-preserved but only the no-map failure path has a dedicated actual-entry subprocess assertion.
