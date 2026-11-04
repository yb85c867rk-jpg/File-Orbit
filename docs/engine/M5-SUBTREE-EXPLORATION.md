# M5 Node-Only Subtree Exploration

- Status: EXPERIMENTAL interaction slice.
- Layout: Experimental v2 + Refine v2.
- Crowding correction: Off.
- Browser verification: NOT RUN.

## Final interaction contract

Navigation is through graph nodes only. No breadcrumb menu, Back, Overview, or
history UI exists.

Clicking a folder F:

1. centers F;
2. shows every node whose authoritative original structural depth is <= depth(F);
3. also shows every descendant of F, including F;
4. hides deeper nodes outside F's subtree.

Visible IDs are exactly:

```text
{ n : originalDepth(n) <= originalDepth(F) } U descendants(F)
```

Same-depth context spans ALL nodes at that depth across different parents, not
just siblings. All shallower layers remain visible. Depth comes only from the
authoritative original layout. Includes only original tree edges whose endpoints
are visible; each visible ID appears once, in original ordering.

Clicking a visible ancestor applies the same rule. Clicking the original
structural root shows the full tree. Clicking the currently focused folder is
idempotent: scope does not change and a manually adjusted camera is not reset.

Clicking a file selects it and updates details without changing scope.

## Roots and IDs

```text
structuralRootId        original graph/layout root
focusedFolderId         folder controlling displayed scope
focusedStructuralDepth  authoritative original depth of F
selectedId              selected node (folder or file)
ancestorIds             root..focused chain
descendantIds           focused subtree preorder
contextIds              all nodes at original depth <= focused depth
visibleIds              context U descendants, original order
```

The focused folder is not a new structural root. Base graph/layout are never
mutated.

## Centering and fit

Every folder view derives from the authoritative v2/refined base with
`createFocusView`; focused transformations are never composed from a previous
view.

Centered fit:

- focus places F at the projection center;
- camera pan is fixed to zero;
- zoom is chosen from all visible ancestor/descendant fixed-6px glyph extents;
- all visible glyphs must fit inside padding;
- F must remain at viewport center within 1e-6 CSS px;
- ancestors remain visible and hittable.

If these constraints cannot be met within experimental camera limits, the frame
throws `centered-fit-infeasible`; a clipped frame is not installed as success.

No animation is integrated.

## Harness

`tests/harness/m5-exploration/`

- Dataset selector is a clearly marked harness control.
- Fit graph is the only camera helper; scope navigation is node-only.
- Details panel is passive and displays name/kind/ID/counts/passive path.
- No breadcrumb, Back, Overview, History API, or browser Back/Forward integration.
- Wheel zoom, background pan, resize, dataset replacement, destroy/recreate.
- Labels prioritize focused folder, parent, structural root, ancestors, then
  existing bounded policy; priorities deduplicated.
- Labels/text/font/icons/budgets unchanged.

Status:

```text
structuralRootId
focusedFolderId
selectedId
ancestorCount / descendantCount
visible / hidden / total counts
visibleEdgeCount
focusedCenterError
camera/framing
containment outcome
generation / hitActive
lastEvent (user/programmatic)
lifecycle / error
```

## Shared pipeline

- `createExplorationModel`: node-only scope/selection/details.
- `buildFilteredViewLayout`: fresh focus + filtered nodes/edges.
- `prepareExplorationFrame`: fixed-6px, centered fit, containment, hit.
- `stageExplorationFrame`: draw → labels → hit install.
- `createExplorationSession`: transactional action/frame boundary.

Failure invalidates hit state, restores model snapshot, preserves the original
error, publishes no successful navigation, and never claims pixel rollback.

## Tests

- exploration total: **64/64 PASS**.
- full `tests/engine`: **943/944 (1 skipped: fake IndexedDB concurrency limit) PASS**.
  - navigation model: 9
  - session/input/frame: 6
  - centered-fit boundary regressions: 4
  - click-action/event regressions: 5
  - smooth transition regressions: 5
  - navigator click/transition integration: 8
  - depth-context regressions: 5
  - reparent/drag/action regressions: 19
  - E1–E2 + Slice 1 editor tests: **183/183 PASS**
  - harness static/no-legacy actions: 1
- combined experimental: 70/70 PASS.
- M4: 71/71 PASS.
- M5: 111/111 PASS.
- M3: 70/70 PASS.
- unique total: **446**.
- syntax: PASS.
- browser: NOT RUN.

Coverage includes exact F20/F200 membership, edge connectivity, hidden hits,
nested/parent/root/idempotent clicks, file selection, programmatic restoration,
centered fit/containment, ancestor hittability, pan/zoom scope, preparation/draw/
label/hit failures, dataset replacement, immutability, and absence of legacy
navigation actions.

## Manual browser sequence (NOT RUN)

1. Initial full tree.
2. Click a folder; confirm all nodes at or above its original structural depth plus its complete subtree, focused centered.
3. Click nested folder; confirm deeper ancestor chain.
4. Click a visible parent; confirm expanded scope.
5. Click original root; confirm full tree.
6. Click current focused folder; confirm no scope/camera reset.
7. File click/details; background clear; wheel/pan/Fit/resize/dataset.
## Centered-fit boundary tolerance

`CONTAINMENT_TOLERANCE_CSS = 1e-6` is applied to every padding boundary.
`containment.paddingToleranceCss` exposes it. Focused-center tolerance remains
`CENTER_TOLERANCE_CSS = 1e-6`.

Regression coverage:

- F200 n30 at 1100×473;
- F200 n38 at 1001×577;
- all 40 F200 folders at 1100×473, 1001×577, and 800×600;
- a genuine padding violation beyond tolerance;
- focused center + ancestor hit installation.

No coordinate clamping, zoom change, layout/camera change, ancestor hiding, or
tolerance enlargement.
## Click-event correction

The harness-local click guard rejected `isPrimary === false` and swallowed
coordinate-conversion errors. Native click handling was extracted to
`handleExplorationCanvasClick`, now used by the harness and tests:

- ordinary left click accepted from `button === 0`, without pointer-stream
  metadata;
- `clientToCanvasCss` failures produce `coordinate-error` diagnostics;
- missing frame/session and frame failures produce bounded reasons;
- post-drag suppression remains owned by the navigation controller's click
  capture;
- current-folder/file/background behavior preserved.

`lastClickDiagnostic` is exposed in harness status for development. No new
product menu.

Executable click regression covers ordinary left click with `isPrimary:false`,
off-center child folder, current folder, file, background, coordinate failure,
frame-install failure, post-drag click suppression, and canvas replacement.
## Smooth transition

Folder navigation uses a 780 ms deterministic ease-in-out transition via the
accepted focus animator. Progress is elapsed-time based; no setTimeout frame
replacement, no CSS canvas transform.

- Möbius focus parameter is interpolated, not node coordinates.
- Camera zoom/pan interpolate coherently from source to exact target centered fit.
- Intermediate visibility is the bounded union of source/target scopes; final
  completion installs the exact target scope.
- Intermediate hits are disabled; draw/labels run per sampled view.
- Final draw → labels → hit installation uses the normal session path.
- `prefers-reduced-motion` uses the immediate path.
- Busy, cancel, resize/dataset/destroy, stale callback, and frame failure are
  handled with owned requestAnimationFrame cancellation.
- No speed-control menu; duration remains code-configurable.

Transition tests use mocked timestamps. They are mocked evidence, not browser FPS
or smoothness verification. Browser remains NOT RUN.
## Click-to-transition integration

The shared click handler now delegates folder hits through
`createExplorationNavigator`, not `session.run`.

Authoritative action rules:

- changed folder + motion enabled → 780ms transition;
- reduced motion/duration 0 → immediate;
- current folder → idempotent immediate selection, no camera reset;
- file/background → existing selection behavior.

Target model commit and final hit installation happen only in transition
completion. The shared click action accepts an `onFolder` hook so button,
coordinate, hit, and diagnostic rules remain single-source.

During transition, the accepted navigation controller is suspended/detached;
wheel/pan/Fit cannot install competing frames. Busy folder/Fit requests report
`transition-busy` without drawing failure. Controller restoration is exactly
once after final success/error recovery. Resize/dataset/destroy cancel owned work.

Integration tests invoke the shared click dispatcher + navigator + transition,
with mocked RAF timestamps, and inspect the actually installed final scene,
camera, visible IDs, centered focused folder, and hit snapshot.
## Transition frame ownership

Folder hits now route through `createExplorationNavigator` (shared harness and
tests), never directly through `session.run`.

- changed folder + motion → transition is the only frame owner;
- reduced motion/duration 0 → immediate;
- current folder → idempotent immediate, no camera reset;
- files/background → existing selection path;
- target model commit/final hits only at completion.

During transition the accepted navigation controller is destroyed/suspended.
Wheel/pan/Fit cannot install competing frames; Fit reports `transition-busy`.
The controller is recreated once after final success/error recovery. Resize,
dataset replacement, and destroy cancel owned work.

Integration tests use the shared click dispatcher + navigator + transition with
mocked RAF timestamps, and inspect the actually installed final scene, camera,
visible IDs, focused center, and hit snapshot. Browser smoothness/FPS remains
NOT RUN.
## Transition label metadata

Transition label callback metadata is:

```text
progress, eased, camera, targetView, unionView
```

`targetView` is the exact target scope view; `unionView` is the motion
source∪target visibility. The harness and normal frames share
`explorationLabelPriorityIds` (focused, parent, structural root, ancestors,
selected), preserving the bounded label policy.

Regression exercises the real label callback on initial/intermediate/final
frames and label failure. No no-op label adapter is used for this check.
## Depth-context visibility

For focused folder F at original structural depth d:

```text
visible = { every node with originalDepth <= d } U descendants(F)
```

- context includes same-depth nodes across all parents;
- deeper nodes outside F's subtree are excluded;
- all context nodes participate in centered-fit containment;
- root depth 0 plus all descendants restores the full tree;
- edges are exactly original parent-child edges with both endpoints visible;
- IDs follow authoritative base node order, deduplicated.

Counts exposed: `focusedStructuralDepth`, `contextCount`, `subtreeCount`,
`contextOverlapCount`, `visibleCount`, `hiddenCount`. Long ID arrays remain out
of compact status.
## Presentation

- Folder transition duration: **780 ms** (shared default and harness).
- Structural root fill: **#D6B36A**, applied by `structuralRootId`/filtered rootId through presentation configuration.
- Focused non-root folder keeps its existing color.
- Existing indigo selection ring, shapes, sizes, edges, labels/icons unchanged.
- Renderer defaults for unrelated harnesses unchanged.
## Smooth visibility fade

UA transition partition uses the same eased progress as movement:

```text
retained (source ∩ target) = 1
exiting  (source − target) = 1 − eased
entering (target − source) = eased
```

- source ∪ target geometry remains during motion;
- edges fade with `min(endpoint opacity)`;
- nodes/edges carry validated `opacity` in explicit scene data;
- nodes without opacity input default to 1;
- labels/icons fade with owning node; label budget/priority/collision unchanged;
- intermediate hits disabled; final target installs normal opacity;
- renderer save/restore and neutral baseline preserved;
- structural root gold and indigo selection ring fade with owner.

Bounded label tradeoff: during motion the union candidate set is still capped at
40 and current priority/collision policy; entering opacity-0 labels may occupy a
bounded slot before becoming visible. No unbounded temporary labels are created.
## Transition label lifecycle

The actual harness uses explicit label lifecycle methods:

```text
beginTransition(scene, presentation, priorityIds)
updateTransition(same)
completeTransition(target scene)
cancelTransition()
```

- A fixed stable-ID plan is selected once from the first union scene, bounded by
  the existing maxLabels budget.
- Label DOM elements are preserved; per-frame updates change only position and
  owner opacity.
- Placement anchors are fixed at plan start, so labels follow nodes without
  candidate-set re-selection each frame.
- Labels suppressed at plan start remain suppressed during motion; entering
  labels with opacity 0 receive a stable fallback anchor and fade in.
- Completion reuses retained/target label elements, removes source-only groups,
  and adds bounded missing target groups using normal target policy.
- Cancellation removes temporary groups and resets to normal overlay state.

Bounded tradeoff: target labels outside the initial union plan may be created at
completion within the same maxLabels budget. No unbounded temporary labels are
created.
## Transition label metrics

`transitionMetrics` now measures from actual displayed label rectangles:

- `visibleCount`/`suppressedCount` from displayed groups, including final
  handoff fallback labels;
- `labelNodeOverlapCount` via exact circle/diamond geometry with owner exclusion;
- `labelNodeOverlapMeasurement: measured-visible-label-rectangles`;
- transition-only suppression counters are `null` with
  `suppressionMeasurement: fixed-transition-policy` because they are not
  re-evaluated per frame.

A fully visible retained fallback label is included in final counts. No universal
label-continuity claim is made; bounded target labels outside the initial plan may
appear at completion.
## Node drag-and-drop reparenting

Session-local structural moves are implemented through:

- shared `buildReparentCandidate` validator/candidate-tree builder;
- shared `createNodeDragGesture` pointer boundary;
- harness candidate staging/refinement/frame installation.

Rules:

- file/folder drag over a folder moves it as the target's last child;
- folder subtree moves wholesale;
- root/self/descendant/file/empty/stale targets reject;
- existing parent is a no-op;
- source tree/layout remain unchanged until successful final frame installation;
- focused folder/selection are restored when still valid;
- structuralRootId stays unchanged and gold;
- depth-context scope is recomputed from candidate topology;
- no auto-navigation to drop target.

Drag gesture:

- 4 px threshold;
- node pointerdown claims before the accepted pan controller;
- empty canvas retains background pan;
- one-shot post-drag click suppression;
- pointer capture/cancel/lost-capture cleanup;
- unavailable during transition;
- drag ghost and folder target highlight;
- exact data-target feedback `이것은 데이터 노드입니다.` for ~2s via aria-live status;
- no new menus.

In-memory limitation: moved topology is session-local and is reset by reload/dataset replacement. No filesystem operation, persistence, undo/redo, rename, delete, or native drag.

Candidate frame failure preserves the prior authoritative tree and attempts a recovery frame; no pixel-rollback claim.
## Drag/drop integration corrections

- Pointerup target is resolved exclusively from current release coordinates and
  the current frame; hover highlight is presentation-only.
- Source/target/cycle/data/empty/stale checks are revalidated at drop.
- Gesture captures dataset token, frame generation, and structural root; stale
  drops reject without mutation.
- Node gesture owns frame/navigation updates; Fit is blocked during gesture.
- Candidate environment is isolated from live refs; candidate success is
  committed only after frame installation. Failure restores authoritative refs,
  attempts recovery, and reports the original error.
- Cancelled drags suppress the generated click without turning into navigation;
  lost capture/cancel cannot double-complete.
## Shared reparent action and Fit ownership

- Fit uses shared `fitBlockReason` from node pointerdown through completion or cancellation; drag-busy performs no frame install.
- Reparent installation uses shared `performReparentInstallation` with candidateEnv isolation.
- Tests execute success, preparation failure, draw/label/hit failure, and recovery success/failure through the shared action.
- Failure preserves original authoritative refs and original error; failed recovery reports inert.
## Recovery-result reporting

The harness recovery adapter uses shared `recoverAuthoritativeSession(session)`.
It reports recovered only when the real `session.run('recovery')` result has
`ok === true`. A recovery frame failure returning `{ok:false}` leaves interaction
inert and does not overwrite the original candidate-installation error.
## E1 rename editor

E1 is implemented with:

- shared `editor/validation.js`, `commands.js`, `action.js`, `controller.js`,
  `intent.js`, `activation.js`, `context-menu.js`;
- metadata-only candidate installation preserving `baseLayout`, camera, framing,
  topology, IDs, and data;
- `EDITOR_MAX_NODES=300` admission ceiling;
- stable form/input DOM, focus/caret/selection, Korean IME, Enter/Escape;
- initial details show the actual structural root without a fake selection/click;
- no permanent Rename button in the normal details summary;
- right-click opens one owned Rename context menu; choosing Rename opens the form;
- left click keeps navigation/selection/clear and never opens the editor;
- context menu is viewport-clamped, prevents default only for handled nodes, and background remains native;
- canonical editor target schema across menu/pending/form; explicit contextmenu event only;
- editor target independent of navigation selection/focus;
- menu-only right click; context menu clamped to viewport and dismissed on outside/Escape;
- semantic dirty pending intent without pointer-coordinate replay;
- ownership, resize/dataset/destroy cleanup;
- at the E1 boundary no add/description/link/delete/undo/history UI; E2 adds only add/metadata.

E2–E5 remain **PLANNED / NOT IMPLEMENTED**. Browser IME/focus verification is
**NOT RUN**.


## E2 add child / edit metadata

E2 is implemented with:

- folder menu actions Add folder and Add data item; data menu Edit details;
- add forms and description/link form sharing stable form DOM and Korean IME handling;
- append-last insertion, deterministic `fo-{dataset}-{counter}` IDs, and full-tree collisions;
- 300-node admission, depth/child checks, accepted layout/refinement/frame/hit path;
- metadata stored only in `node.data.description/link`, preserving unrelated data;
- metadata edit preserves navigation selection (including null), layout, camera, and framing with `fit:false`;
- structural add preserving focus/scope with centered fit and new-node selection;
- canonical semantic action targets and dirty Continue/Discard handoff;
- session-local file picker, 20 MiB/100 MiB budgets, bounded-prefix format classification;
- format badges in normal/transition labels with explicit review state.

Delete, undo/redo, persistence, uploads, and filesystem/native integration remain
**NOT IMPLEMENTED**. E3–E5 remain **PLANNED / NOT IMPLEMENTED**. Browser verification
is **NOT RUN**.















































































































































