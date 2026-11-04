# M4 Canvas Foundation — Contract and Source Mapping

- Date: 2026-10-25
- Status: **static labels/icons slice implemented**; hit testing, focus, animation, pan/zoom, Vue, filesystem, and native integration are NOT implemented.
- Legacy reference: unchanged `vendor/jit/jit.2.0.1.js`, SHA-256 `4A413A0A21435AEE893EBE3572CAEB5EA81B14C437FA8BEC3AABB5F7A921546F`.

## 1. Source mapping

| Legacy source | Observation | M4 treatment |
|---|---|---|
| `Canvas.Base['2D'].createCanvas` (`jit.js:3131-3146`) | Creates one canvas with `width`/`height` attributes and CSS size | One owned canvas, explicit CSS/backing sizes |
| `getCtx` (`3148-3152`) | Lazily obtains the 2D context | Obtain during creation; fail closed and remove canvas |
| `getSize` (`3153-3160`) | Caches backing dimensions | Explicit metrics recomputed on every valid resize |
| `translateToCenter` (`3161-3167`) | Context translated by half canvas size | **Correction:** pure projection adds CSS center; context transform contains only DPR/effective scale |
| `resize` (`3169-3190`) | Resets width/height, translates center, clears | Reset backing size, reapply one complete transform, clear |
| `clear` (`3205-3214`) | Clears in transformed coordinates | **Correction:** identity transform + full backing clear, then restore transform |
| Hypertree label/plot (`18219-18224`, `18366-18369`) | Canvas-local `coord.x/y` scaled by radius; labels add canvas center | Projection preserves normalized Cartesian × radius + center; y down |
| `getRadius`/`createLevelDistanceFunc` (`17966-18011`) | Radius is distinct from normalized distance | M4 radius is CSS pixels; M3 rho remains normalized; no second scale |

Deliberately not reproduced: canvas ID/global lookup, label container/background canvases, scroll/resize/event listeners, pan/zoom transform state, DOM measurement inside the layout, and legacy center translation in the context.

## 2. Coordinate contract

Four distinct spaces:

1. **Normalized Hypertree Cartesian:** `x = rho*cos(theta)`, `y = rho*sin(theta)`. Values are unitless normalized coordinates from M3.
2. **Canvas-local CSS pixels:** `x_css = width/2 + x*radius`, `y_css = height/2 + y*radius`. Origin is the CSS viewport center; x right, y down, matching Canvas/Hypertree drawing.
3. **Canvas backing pixels:** CSS coordinates mapped by the context transform to integer backing pixels.
4. **Browser client coordinates:** CSS-local points plus a supplied drawable-content origin.

`toClient(css, origin)` / `fromClient(client, origin)` are **translation-only**. The supplied origin must already represent the canvas drawable content origin (content-box origin, not the border-box top-left). CSS scaling, rotation, skew, perspective, zoom transforms, canvas border/padding, and other content-to-border offsets are not inferred. The harness has no canvas border/padding and explicitly accounts for the host border/padding when it derives the drawable origin.

Pure API:

```js
createProjection({width, height, radius})
// { width, height, radius, centerX, centerY,
//   toCss(x,y), fromCss(cssX,cssY),
//   toClient(css,rect), fromClient(client,rect) }
```

- `width/height >= 0`; `radius > 0`.
- Inverse divides by the explicit positive radius, not by a zero canvas dimension.
- Browser `rect` is an argument; no DOM globals in the pure module.
- Zero width/height has center `0,0`; normalized/CSS conversion still uses the explicit radius.

## 3. DPR and backing-size contract

For requested CSS size and `dpr > 0`:

```text
backingWidth  = round(cssWidth  * dpr)
backingHeight = round(cssHeight * dpr)
scaleX = cssWidth  === 0 ? 0 : backingWidth  / cssWidth
scaleY = cssHeight === 0 ? 0 : backingHeight / cssHeight
ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0)
```

- DPR is applied exactly once, through this transform.
- Integer rounding is absorbed into `scaleX/scaleY`; a fractional CSS size maps the full CSS extent to the full backing extent.
- The context has no center translation and no additional `node.scale`; drawing uses CSS-local coordinates.
- A zero dimension yields backing `0` and scale `0`; no division by zero.
- Same CSS size with changed DPR resets backing and reapplies a fresh transform; no cumulative translate/scale.

## 4. Surface API

```js
createCanvasSurface(host, {width, height, dpr})
surface.canvas
surface.context
surface.getMetrics()
surface.resize({width, height, dpr})
surface.clear()
surface.destroy()
```

- Uses `host.ownerDocument`; no global document/IDs.
- Creates exactly one canvas owned by the instance and appends it to `host`.
- Explicit CSS `style.width/height` and integer `canvas.width/height`.
- `getMetrics()` returns a frozen copy: CSS size, DPR, backing size, effective scales.
- `resize` validates the complete next state before changing the surface. It resets backing, reapplies the full transform, and clears.
- `clear` sets identity transform, clears `0..backingWidth/Height`, then restores the documented transform.
- `destroy` is idempotent, removes only this instance's canvas, preserves other host children, and releases internal host/context refs where practical.
- Post-destroy access/methods throw `CanvasSurfaceError` with code `destroyed`; `destroy` remains a no-op.
- Context/initialization failure removes the canvas created by the failed attempt and throws `CanvasSurfaceError`.

## 5. Allocation policy and lifecycle limits

`SURFACE_LIMITS` (policy, not measured device guarantees):

- max CSS side: 16,384
- max backing side: 16,384
- max backing pixels: 33,554,432

Requests exceeding these are rejected before allocating/resizing. Invalid dimensions, DPR, host, or context fail closed. Hidden/zero host size is supported via zero-sized backing and zero effective scale. Browser max canvas/GPU limits can be lower or higher; this policy is not a device guarantee.

No `ResizeObserver`, media-query listener, timer, animation loop, pan/zoom, graph drawing, labels, icons, hit testing, or focus is added in this slice.

## 6. Verification split

- 58 Node/static checks: 13 surface/coordinate, 4 surface-harness static, 6 geometry, 15 graph-scene/draw (including selection-ring checks), 2 graph-harness static, 4 label-classification, 12 label-overlay, and 2 labels-harness static.
- **Mocked context tests are not browser rendering evidence.**
- Standalone harness: `tests/harness/m4-surface/`. It draws only axes, calibration marks, and a sample unit circle, uses `projection.toCss()` for marks, measures the host content area (border/padding excluded), shows CSS/backing/actual DPR, exposes projection/inverse observations and canvas-identity/operation status, and has independent resize/recreate/destroy controls. Resize and DPR changes call `surface.resize()` on the existing instance; only initial creation/recreate creates a new canvas.
- Graph harness: `tests/harness/m4-graph/` renders F20/F200 nodes/hyperlines with fixture/phase selection, actual/synthetic DPR, live resize, destroy/recreate, expected/requested/prepared/drawn counts, and machine-readable `window.__M4_GRAPH_STATUS__`.
- Actual browser graph/label verification is **NOT RUN**; no browser launch is claimed. Prior graph/surface browser observations remain scoped to those harnesses.
## 7. Static graph rendering slice

Source mapping:

| Legacy | Observation | M4 treatment |
|---|---|---|
| `Hypertree.Plot.NodeTypes.circle.render` (`jit.js:18363-18373`) | `dim * (1 - squaredNorm)` when `Node.transform`; position scaled by `node.scale`; draws only `dim > 0.2` | Node CSS radius uses `dim * (1 - rho^2)`; center uses projection; no projection-radius multiplication; visibility threshold `0.2` |
| `Hypertree.Plot.EdgeTypes.hyperline` (`18525-18531`) | Normalized `pos.getc()` endpoints and explicit radius | Hyperline geometry computed normalized, projected to CSS once |
| `EdgeHelper.hyperline.render` (`6649-6734`) | Arc center/ratio/angles/sense; straight fallback for zero determinant, negative ratio, ratio >1000 | Same ordinary arithmetic, with documented tolerance/fallback for coincident/near-collinear/unstable/oversized arcs |
| Node presentation | Circle/square/etc. | Folder = transformed circle; file = diamond; root indigo accent; no icons/labels |

### Scene API

```js
prepareGraphScene(staged, {
  phase,
  projection,
  nodeDims,       // optional Map<id, CSS base dim>
  nodeKinds,      // optional Map<id, 'folder'|'file'>
  presentation
})
drawGraphScene(surface, scene)
renderGraphScene(surface, staged, options)
```

- Consumes the accepted staged radial result; no layout recomputation or graph mutation.
- `phase` defaults to `staged.firstPhase`; must be selected.
- Node centers: `projection.toCss(x,y)`.
- Node radius: CSS pixels, `dim * (1-rho^2)` by default; not multiplied by projection radius. `visible` only when radius > `0.2`.
- Edges: one per parent-child tree connection; normalized hyperline geometry projected to CSS; each connection drawn once.
- Edges first, nodes second; edge/node order follows staged children/node order.- Optional `drawGraphScene(surface, scene, { selectedId, selection })` draws a non-filled indigo selection ring after nodes; it does not mutate scene geometry, enlarge the selectable shape, or become a hit target. See `M5-SELECTION.md`.
- IDs and lookups use strings/Map; no concatenated edge-key ambiguity.
- Empty scenes draw background only.
- `prepareGraphScene` returns a prepared scene, not a trusted immutable boundary. `drawGraphScene` revalidates and snapshots all nodes/edges/styles before the first Canvas operation; mutating a returned scene cannot bypass validation.
- Presentation colors use a documented DOM-free subset: 3/4/6/8-digit hex (`#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`). Named/rgb()/var()/currentColor are rejected.
- Scene limits: **1500 nodes / 1499 edges** (bounded-rendering policy; not a measured performance claim). Oversize rejects before clear/draw.

### Geometry policy

- `GEOMETRY_TOLERANCE = 1e-12`.
- `MAX_ARC_RATIO = 1000`, `MAX_ARC_RADIUS_CSS = 1_000_000`.
- Straight-line fallback for:
  - coincident endpoints;
  - zero determinant / root-connected / diametric / near-collinear (`|det| <= tol * scale`);
  - negative squared ratio or degenerate/non-finite arc values;
  - normalized arc ratio >1000 or projected arc radius >1,000,000 CSS px.
- Ordinary legacy arc center/ratio/angles/sense preserved.
- Invalid/non-finite coordinates/styles/dimensions reject the whole scene before any clear/draw.
- No silent truncation.

### Canvas state

- Uses the accepted surface transform; all drawing coordinates/strokes are CSS pixels, independent of DPR.
- `drawGraphScene` validates/snapshots before `clear`, balances `save()`/`restore()` in `finally`, and establishes a neutral drawing baseline inside the saved scope: `globalAlpha=1`, `globalCompositeOperation=source-over`, solid `setLineDash([])`, zero shadows, `filter=none`, and explicit line join/cap defaults. Caller state is restored afterward.
- A scene-validation failure leaves the previous frame untouched.
- A drawing-context failure can leave a partial frame; this is not pixel-transactional rendering.
- Arbitrary caller clipping is outside the renderer contract; save/restore preserves caller state but does not reset an established clip.
- Zero-sized surface returns zero draws without clearing; destroyed surface errors propagate.
## 8. Static labels and file-type icons

Source mapping:

- Legacy `Hypertree.Label.HTML.placeLabel` (`jit.js:18311-18330`) places labels at
  `pos.x * s * r + center` / `pos.y * s * r + center` in canvas CSS pixels and
  hides when outside. M4 uses the same projection centers, with an owned HTML
  overlay in the host content coordinate space.
- Legacy labels are not reused as interactive elements here.

### Presentation/classification

```js
presentation = Map<id, { name, kind: 'folder'|'file', typeHint?: ... }>
```

- Stable node-ID keyed; display names are literal text.
- Classification is presentation-only, never MIME or open authorization.
- Hint precedence: folder -> `folder`; file supported hint -> hint; otherwise
  final case-insensitive extension; otherwise `generic`.
- Supported file hints: pdf, text, markdown, image, archive, generic.
- Extensions: pdf; txt/text/log/csv/tsv/json/xml/yaml/yml; md/markdown/mdown/mkd;
  png/jpg/jpeg/gif/webp/svg/bmp/avif/tif/tiff; zip/tar/gz/tgz/bz2/tbz2/xz/7z/rar.
- Dotfiles, extensionless names, trailing dots, multiple dots, and Unicode
  display names are handled deterministically; no absolute path is required.

### Overlay contract

```js
const overlay = createLabelOverlay(host, { maxLabels, maxWidth, gap, padding, overlapPadding });
overlay.update({ scene, presentation });
overlay.destroy();
overlay.getMetrics();
```

- One owned overlay div per instance, ownerDocument-based, no global IDs.
- Host must be a positioning host with no padding/internal scrolling; overlay
  coordinates are translation-only CSS pixels. Canvas border/padding and CSS
  transforms are not compensated. Canvas/host border remains outside both.
- Names via `textContent`; fixed local SVG icons only; no filename in innerHTML,
  selectors, URLs, or SVG markup. No external fonts/CDNs/dependencies.
- Labels are non-interactive (`pointer-events:none`) and do not claim complete
  accessible graph navigation.
- Full display name remains in DOM text, `title`, and `aria-label`; CSS ellipsis
  is truncation only, not a renamed value.
- Update validates and snapshots all selection/placement fields before attaching
  temporary DOM: string/matching ID, supported kind, boolean visibility,
  safe-integer nonnegative depth, finite center, finite nonnegative radius,
  presentation, and configuration. Ordering/construction/measurement/placement
  are inside one cleanup boundary; failures remove the temporary overlay and
  preserve prior overlay identity, labels, metrics, and host children.
- Non-finite or negative measurements throw `invalid-measurement`; zero
  measurements are hidden/unmeasurable, not visible.

### Label policy

- Root explicitly first; then depth ascending; then stable scene Map order.
- Default max labels 40; hard budget 500. Only `maxLabels` candidate elements
  are created/measured, not all hidden afterward.
- Invisible nodes are skipped. Candidate count may exceed created count.
- Placement prefers right of node, flips left near the right boundary, clamps
  within viewport, and hides labels that cannot fit. Deterministic rectangle
  overlap suppression applies in priority order.
- Report `candidateCount`, `createdCount`, `visibleCount`, `suppressedCount`,
  `overlapSuppressedCount`, `viewportSuppressedCount`, `unmeasurableCount`,
  `visibleIconCount`, `textMismatchCount`, measurement method, and viewport.
- Updates use a temporary new overlay and swap only after complete validation/
  measurement; invalid input preserves the prior valid overlay. Destroy is
  idempotent and removes only this overlay.

### Labels harness/status

`tests/harness/m4-labels/` renders F20/F200 with synthetic PDF/text/Markdown/
image/archive/unknown, Unicode, extensionless, and literal HTML-looking names;
actual/synthetic DPR, resize, fixture/phase update, destroy/recreate; status
exposes graph and label counts, icons, overlaps, text mismatches, lifecycle, and
errors. It has no activation/opening behavior.

**Browser label verification is NOT RUN.** Mocked label dimensions do not prove
browser font metrics or visual layout; previous graph/surface browser
observations remain scoped to those harnesses.







