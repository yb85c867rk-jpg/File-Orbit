# FileOrbit Node Editor — Implementation Plan

- Status: **E1–E2 + Slice 1 IMPLEMENTED (menus, folder/data atomic edits) — NODE/MOCK VERIFIED; E3 DELETE, UNDO/HISTORY, REPLACEMENT/CONVERSION PLANNED / NOT IMPLEMENTED**
- Product: **FileOrbit**
- Machine-readable name: **fileorbit**
- Planning date: 2026-10-26
- Planning revision: **8 — Slice 1 context-menu/form cleanup and atomic folder/data editing implemented; E3 Delete, undo/history, replacement/conversion remain separate future slices**
- Authorized project: `C:\Users\openw\Documents\Projects\visual-directory`
- Scope: session-local, in-memory node editing
- Review slice: E1–E5
- Browser verification: **NOT RUN**

> This document plans an editor. It does not implement editor functionality.
> No engine behavior, tests, dependencies, lockfiles, native configuration, or
> working-directory names were changed by this planning task.

## 1. Executive decision

Extend the existing accepted mutation boundary rather than adding an editor-owned
renderer or a second graph store.

The authoritative editable representation should remain the plain rooted tree
currently held by the harness in `tree`, because that is already the input to
`loadTree()` and the source used by `buildReparentCandidate()`. A candidate tree
is cloned and validated; `loadTree()` derives a candidate `Graph`; the accepted
v2/refinement layout produces a candidate `baseLayout`; `createExplorationModel()`
produces scope; and the existing exploration session/frame/label/hit boundary
installs the candidate. Only after successful installation does the harness
commit the new `tree`, `graph`, `baseLayout`, `model`, and `session`.

Metadata-only edits must not recompute layout. Structural edits must recompute
depth and layout. Both use one command contract and one installation/recovery
path.

## 1.0 Slice 1 implementation status

Slice 1 is implemented and Node/mock verified:

- Folder/root menu: **Edit Folder, Add Folder, Add Data**.
- Data menu: **Edit Data, Add Data**.
- Separate Rename / Edit details menu entries removed.
- Folder forms: Name + Description only.
- Add Folder stores optional `node.data.description`.
- Edit Folder saves name and description in one command/installation with layout reuse.
- Edit Data atomically saves name and type-appropriate metadata.
- Add Data from a data node resolves its existing parent and appends a sibling.
- Typed File editing keeps the existing attachment and does not require reselection.
- No Delete, Undo/Redo, file replacement, or type conversion is exposed.

Folder visibility correction: .editor-field[hidden], .editor-summary[hidden], and .editor-actions[hidden] now explicitly use display:none, so author display rules cannot override the hidden attribute. Edit/Add Folder expose only Name, Description, Save, and Cancel.

Admission correction: `validateFolderEdit()` and `validateDataEdit()` now apply the shared `validateEditorAdmission(tree)` before no-op handling or candidate preparation. Datasets above 300 nodes remain view-only for all editor commands.

Actual harness wiring: createDragGestureFor().onDrop is constructed through createPointerUpDropHandler, which captures the accepted gesture and live identity before cleanup and calls the shared drop action. Regression tests drive the real drag controller callback rather than calling the helper directly.

Shared drop action: pointerup destination resolution is extracted into drop-action.js and used by the harness, using current overlay label geometry for data targets and Canvas hit geometry for folders. Data-target rejection never prepares/installs a candidate.

Invalid-drop feedback: pointerup resolves visible data icon/name destinations before mutation and shows the exact English message 'This action is not allowed.' centered in the graph viewport for 2000 ms.

Presentation cleanup corrections: folder glyphs restore explicit per-node opacity; label drag and label selection share one generated-click suppression gate; destroy/recreate releases both Canvas and label drag controllers.

Presentation cleanup: data nodes use FileOrbit exploration green circles (radius 4 CSS px, shape circle) plus their existing icons/names. The circle, icon, and name support selection/details, drag, right-click, and context targeting; names retain viewer/web-link activation. No data diamonds or extra data circles beyond the one green circle. Canvas cursor is contextual. Details panel shows only Name, Description, web destination, and attachment information.

Menu/field-policy correction: data-node menus never offer Add. Folder/root menus retain Add and expose disabled Delete; data menus expose Edit Data and disabled Delete only. Delete remains unavailable pending Undo/Redo. Only typed Web link data (authoritative node.data.dataType) exposes URL editing; File and legacy forms hide URL and preserve existing link metadata.

Label context-menu correction: installed label owners now resolve through a scoped document contextmenu handler, share the Canvas target/activation path, and activate only when the installed frame, identity, visibility, and pointer ownership are valid. Background context menus retain native behavior. Glyph misses expose bounded diagnostics (no frame, coordinate failure, hit miss, stale target).

Viewport shell correction: application uses a 100dvh grid (auto toolbar, auto error strip, minmax(0,1fr) main region), removes fixed 64px subtraction, constrains graph/detail overflow, and coalesces ResizeObserver updates through the accepted resize path.

Delete menu runtime blocker fixed: shared esolveDeleteTarget replaces missing findNodeWithParent in harness request/execute paths; menu action exceptions publish diagnostics. Shared resolver used by folder/data menu E2E.

Search Slice 3: enabled whole-map name/description search with NFC/case folding, literal multiword matching, deterministic ranking, 50-card cap, right-panel result cards, explicit web Open website, stable-ID result activation through the shared navigator/session/frame, hidden-data parent reveal waiter, dirty Continue/Discard resumption, dataset/revision revalidation and mutation refresh.

Create Map Slice 2: desktop/mobile actions open one application-hosted dialog; multi-file/folder picker and owned file/drop area; synthetic root; deterministic stable IDs; isolated 300-node/20MiB/100MiB candidate; description:null imports; v2/refinement/frame candidate installation with rollback and history reset on success.

Application shell Slice 1: two-row top toolbar. Row 1: branding + Create Map/Upload/Download + Embed/Fullscreen/Theme with responsive Map/More menus. Row 2: reserved search + single-instance Undo/Redo. Graph and right details/editor panel below. #app-root is the fullscreen boundary and owns the overlay host for context menus, Delete confirmation, and attachment viewer. Search, Create Map, import/export, and Embed remain unavailable/deferred. No separate history authority; navigation and responsive layout changes do not clear history.

Data-circle presentation: FileOrbit exploration draws one green (#22C55E) radius-4 CSS circle per data node (PDF included) using the shared final geometry; PDF icon remains #F87171, PDF badge neutral, other data icons/badges green, folder icons keep their default color. Data circles feed drawing, fit, labels/obstacles, selection rings, hit snapshots, hover, context menu, drag/drop, transitions, resize, and history frames.

Visual hierarchy corrections: shared hit testing restored to last-drawn matching-node semantics while retaining per-node radii; label palette is now explicit/opt-in with FileOrbit harness and preview opting into green data/PDF-red.

File-type icon presentation: format-specific local SVG shapes/badges. Exploration palette: PDF icons remain #F87171; all non-PDF data icons and badges are #22C55E; stored classification controls PDF exception. Folder circles: root #F8FAFC and radius 12; depth-1 #D1D5DB radius 9.6; deeper #B8BEC7 with max(4, 12*0.8^depth); edges #454B54; selection ring #818cf8. Shared resolver applies radii/styles to scene, fit, labels obstacles, hits, selection, transitions, resize and history. Preview fixture at tests/harness/icon-preview/index.html. Native visual inspection NOT RUN.

Attachment-name click robustness: label activation uses installed name/icon geometry when click target is the captured host; diagnostics report owner/activation/viewer state; async viewer failures caught.

Editor menu identity fix: shared adapter supplies current datasetToken/baseRevision to coordinator; resume path audited.

Attachment viewer keyboard/guard corrections: focus traversal uses Array.from children/uppercase tag matching; shared viewer guard blocks history/Fit/camera while open.

Attachment viewer corrections: harness consumes file-name activation metadata; PDF fallback included in focus cycle; deferred PDF URLs tracked/revoked on destroy; UTF-8 preview trims incomplete trailing multibyte at 1 MiB.

Attachment viewer (session-local): resolved from registry/node metadata; supports PDF (native iframe + new-tab fallback), TXT/Markdown source (1 MiB literal preview), PNG/JPEG/GIF/WebP by validated signature; unsupported/review/unavailable states; viewer-owned object URLs/async tokens/modal focus. Browser-native PDF/image rendering NOT RUN.

History UI startup/visibility correction: removed premature top-level setHistoryUiVisible, moved state into shared module, and restricted folder-settle hide to completed different scope.

History UI visibility: right-panel controls start hidden, show after successful mutations, remain visible through Undo/Redo, hide after successful navigation/selection/background clear, and reset on dataset replacement. Presentation only; stacks untouched.

Delete pending identity: Discard intent is validated against captured dataset/revision, stable ID, kind, and visibility before confirmation. E2E frame adapter now uses candidateEnv and asserts deleted IDs absent/restored in scene/hits.

Delete modal ownership: Tab containment, history/editor blocking while open, dirty Continue/Discard routed through existing editor prompt. End-to-end menu→real confirmation→shared installer→Undo/Redo test added.

Delete lifecycle correction: harness uses shared menu dispatcher, resize closes pending confirmation, dialog traps Tab focus and blocks history/editor background actions. Dirty-draft Delete remains a block, not Continue/Discard.

Delete workflow (E4) UI: Delete menu actions enabled for non-root folders/data through shared menu dispatcher; root disabled; confirmation wired; 300-node admission enforced before delete.

Delete workflow (E4): Delete Folder/Delete Data enabled for non-root folders and data, confirmation dialog with counts/stale identity checks, shared delete command + structural history, attachment retention across Undo/Redo/eviction. Delete is implemented but browser-native menu/confirmation flow is NOT RUN.

Resize lifecycle: shared performViewportResizeAction cancels transitions, replaces surface, installs resized frame, then recreates both exploration navigator and mouse controller only on success; failure marks interaction inert.

Navigation terminal recovery: recovered frame/hits/labels retained; failed recovery leaves interaction inert; terminal cleanup is idempotent per transition; ordinary completion performs no recovery redraw.

Navigation cleanup boundary: actual harness onError/onSettled use inalizeTransitionNavigation; overlay cleanup failure is separate from original error, a recovery frame is attempted, and input is restored only when coherent. Real label-overlay transition lifecycle covered at 874x622 and 1100x473.

Folder-navigation correction: click diagnostics preserve navigator reasons and normalize string/Error errors; onStart failures return transition-start-failed and restore ownership; harness onError/onSettled restore navigation in finally.

E3-B details null preservation: explicit null details remain null through reparent; both harness commit and finalized history use the same policy.

E3-B details consistency: one shared post-operation details policy (details-policy.js) drives both authoritative harness commit and finalized history viewAfter. Add uses visible selection else visible parent; reparent preserves valid current details else visible source/focused fallback.

E3-B final corrections: Add/reparent history finalizes viewAfter from the installed candidate model/session inside beforeCommit, then re-plans the complete entry before authoritative commit. Metadata and structural replay take an explicit structuralRootId and reject mismatches without ReferenceError.

E3-B corrections: replay validates required live attachments through the actual registry, Add records intended selected/details fit viewAfter, and structural replay validates candidate admission, moved-subtree snapshots, structural-root identity, exact indices, and subtree ID collisions.

E3-B structural history: Add Folder, Add Data, and reparent now record one inverse-command entry with stable IDs, exact parent/index, JSON node payloads, recompute layout replay, and attachment refs retained across Undo/Redo. E3-B is implemented/Node-verified; browser-native button/drag replay is NOT RUN. Delete remains disabled.

E3-A corrections: command.historyEntry is the single reservation contract; explicit null selection/details are preserved; replay enforces 300-node admission. E3-A metadata Undo/Redo implemented for Edit Folder, Edit Data, and legacy metadata edits. Bounded inverse-command history: 20 entries, 2 MiB/entry, 8 MiB total UTF-8 JSON; metadata-only payloads, independent before/after views, current-revision replay, no layout recompute. Add/reparent clear history after success with feedback. E3-B structural history and attachment ownership are NOT implemented. Delete remains disabled.

Web-link correction: explicit and scheme-less inputs now share the URL parser's canonical href (including root trailing slash); authority-only scheme-less checks permit ':' and '@' in path/query/fragment while still rejecting credentials and host:port. Label links use deferred activation and are enabled only after a successful frame installation.

Web-link enhancement: optional links are normalized through one shared validator (bare domain-style input gains https://, explicit HTTP(S) is retained, IDN uses deterministic WHATWG IDNA serialization). Typed web-link labels render as native anchors with safe textContent, target=_blank, rel=noopener noreferrer, and are inert during transitions. Existing scheme-less host:port, local-path, protocol-relative, credential, and unsupported-scheme inputs are rejected.

Future slices, explicitly **not implemented**:

- E3 bounded undo/redo history and attachment ownership across history.
- Delete confirmations and subtree deletion.
- File replacement and File/Web conversion.
## 1.1 E1 implementation status

E1 is implemented and covered by Node/mock evidence. Browser-native IME/focus
verification remains **NOT RUN**.

Implemented files:

- `src/engine/hypertree/editor/validation.js`
- `src/engine/hypertree/editor/commands.js`
- `src/engine/hypertree/editor/action.js`
- `src/engine/hypertree/editor/controller.js`
- `src/engine/hypertree/editor/intent.js`
- `src/engine/hypertree/editor/index.js`
- `tests/harness/m5-exploration/editor-panel.js`
- `tests/engine/editor/validation.test.mjs`
- `tests/engine/editor/draft.test.mjs`
- `tests/engine/editor/panel.test.mjs`
- `tests/engine/editor/intent.test.mjs`
- `tests/engine/editor/rename-action.test.mjs`

Integrated harness paths:

- `tests/harness/m5-exploration/main.mjs`
- `tests/harness/m5-exploration/index.html`
- `src/engine/hypertree/exploration/navigation-model.js` readonly details fields
- `src/engine/hypertree/exploration/reparent-action.js` shared candidate install

Verification reported in the E1 review package:

- E1 editor tests: 49/49.
- E2 editor tests: 40/40.
- Full `tests/engine` run: 481/481.
- Exploration suite including static wiring: 64/64.
- M4: 71/71.
- Layout/refinement + interaction smoke: 46/46.
- Browser: **NOT RUN**.

E2–E5 remain planned and unimplemented.


The following files and symbols were inspected before planning. No abstraction
was assumed to exist merely because an earlier plan mentioned it.

### 2.1 Authoritative tree and graph

| File | Symbols inspected | Planning consequence |
|---|---|---|
| `src/engine/hypertree/data/tree-loader.js` | `ALLOWED_FIELDS`, `loadTree()`, `validateName()`, `readChildren()` | A node accepts only `id`, `name`, `kind`, `data`, `children`; description/link must live in `data`, not new top-level fields. |
| `src/engine/hypertree/data/errors.js` | `LIMITS`, `TreeLoadError` | Existing limits include `maxNodes=100000`, `maxDepth=10000`, `maxChildren=10000`, `maxNameLength=4096`, metadata limits. Editor needs stricter policy checks before layout. |
| `src/engine/hypertree/data/metadata.js` | `cloneMetadata()` | `data` is cloned into null-prototype JSON-like objects; string metadata is supported and bounded. |
| `src/engine/hypertree/graph/graph.js` | `Graph.addNode()`, `Graph.addAdjacence()`, `Graph.replaceWith()`, `nodes`, `edges` | Graph is derived from the tree; order comes from loader insertion/adjacency. Do not make the graph a second editor authority. |
| `src/engine/hypertree/graph/node.js` | `GraphNode.name`, `kind`, `data`, `id` | Display name is graph metadata; description/link belong in `node.data`. |

### 2.2 Layout and candidate environment

| File | Symbols inspected | Planning consequence |
|---|---|---|
| `src/engine/hypertree/layout/index.js` | exports of `stageExperimentalV2Layout`, `refineExperimentalV2Layout` | Structural commands reuse the accepted v2/refinement pipeline. |
| `src/engine/hypertree/layout/experimental-v2.js` | `V2_MAX_NODES=2000`, `V2_MAX_DEPTH=64`, `stageExperimentalV2Layout()` | Stage-level bound only; downstream diagnostics reduce effective editor admission to 300. |
| `src/engine/hypertree/layout/experimental-v2-refinement.js` | `evaluateCandidate()`, `measurePreparedScene(finalScene, { viewport })` | Refinement runs by default on every structural candidate; diagnostic metric limit is a mandatory admission constraint. |
| `src/engine/hypertree/layout/experimental-metrics.js` | `DIAGNOSTIC_MAX_NODES=300`, `ensureDiagnosticBound()` | Default pairwise diagnostics reject scenes above 300 total nodes; this dominates v2/scene limits. |
| `src/engine/hypertree/render/scene.js` | `SCENE_LIMITS`, `prepareGraphScene()` | Scene/render path caps at 1,500 nodes and 1,499 edges. |
| `src/engine/hypertree/layout/experimental-v2-refinement.js` | `refineExperimentalV2Layout()` | Refinement is called exactly where current reparent candidate preparation calls it. |
| `src/engine/hypertree/layout/resolve.js` | `DEFAULT_NODE_OPTIONS`, `resolveDim()` | New nodes may omit visual `$dim/$angularWidth`; accepted defaults remain authoritative. Do not invent a second visual schema. |

### 2.3 Exploration scope, session, and frames

| File | Symbols inspected | Planning consequence |
|---|---|---|
| `src/engine/hypertree/exploration/navigation-model.js` | `parentMap()`, `deriveSubtreeView()`, `buildFilteredViewLayout()`, `createExplorationModel()`, model `.details()`, `.snapshot()`, `.restore()`, `.select()`, `.enterFolder()`, `.restoreSelection()` | Scope is derived from `baseLayout`; metadata edit can keep the existing `baseLayout`, structural edit needs a new one. |
| `src/engine/hypertree/exploration/session.js` | `createExplorationSession()`, `.run()`, `.applyCamera()`, `.getState()`, `.setCamera()`, model snapshot/restore | Installation is transaction-like. `run()` returns `{ok:false}` for frame failure rather than throwing. Camera/framing must be passed to metadata candidate sessions. |
| `src/engine/hypertree/exploration/frame.js` | `prepareExplorationFrame()`, `stageExplorationFrame()` | Draw → labels → installHit order is already the accepted frame installation order. |
| `src/engine/hypertree/exploration/transition.js` | `EXPLORATION_TRANSITION_DURATION_MS=780`, `createExplorationTransition()`, `transitionOpacity()` | Editor must not compete with transition frame ownership. |
| `src/engine/hypertree/exploration/reparent.js` | `cloneTree()`, `findTreeNode()`, `collectSubtreeIds()`, `buildReparentCandidate()`, `resolveDropTarget()` | Reuse tree cloning/lookup and move semantics; do not create a parallel clone utility unless it is generalized. |
| `src/engine/hypertree/exploration/reparent-action.js` | `performReparentInstallation()`, `isNodeGestureOwned()`, `fitBlockReason()`, `recoverAuthoritativeSession()` | This is the current candidateEnv isolation and recovery precedent. Generalize its installation core; preserve wrapper compatibility. |

### 2.4 Rendering, labels, hit geometry, navigation

| File | Symbols inspected | Planning consequence |
|---|---|---|
| `src/engine/hypertree/render/scene.js` | `prepareGraphScene()`, `presentation`, `nodeKinds` | Presentation is derived from graph names/kinds; new names flow through normal draw/label path. |
| `src/engine/hypertree/render/graph-renderer.js` | `drawGraphScene()` | No editor-specific canvas renderer should be introduced. |
| `src/engine/hypertree/render/label-overlay.js` | `createLabelOverlay()`, `.update()`, `textContent` assignment | Labels are already safe text; description/link must never use `innerHTML`. |
| `src/engine/hypertree/interaction/hit-test.js` | `createHitSnapshot()`, `hitTestNode()` | Final coherent hits are installed by the frame path. Editor save/delete must use those hits only. |
| `src/engine/hypertree/interaction/pointer.js` | `clientToCanvasCss()` | Panel actions and drop-like tests must not multiply client coordinates by DPR. |
| `src/engine/hypertree/exploration/navigator.js` | `createExplorationNavigator()`, `.enterFolder()`, `.busy`, transition lifecycle | Folder navigation and 780 ms transitions remain the accepted path. |
| `src/engine/hypertree/exploration/click-action.js` | `handleExplorationCanvasClick()` | Dirty-draft interception must occur before this shared action; no second click action. |
| `src/engine/hypertree/exploration/drag-gesture.js` | `createNodeDragGesture()` | Editor saving/editing must coordinate with node gesture ownership, not replace the pointer controller. |

### 2.5 Harness and existing tests

| File | Symbols inspected | Planning consequence |
|---|---|---|
| `tests/harness/m5-exploration/main.mjs` | `boot()`, `tree`, `graph`, `baseLayout`, `model`, `session`, `publish()`, `renderDetails()`, `onCanvasClick()`, `performReparent()`, `installFrame()`, `createDragGesture()`, `fitGraph()`, `destroy()` | This is the actual integration point. `renderDetails()` currently replaces panel children; editor draft state must live outside that replacement. |
| `tests/harness/m5-exploration/index.html` | right `aside`, `#details`, `#drag-feedback`, harness controls | Extend the existing panel. Do not add breadcrumb, back, overview, history, or product-navigation menus; the owned node action menu is allowed. |
| `tests/engine/exploration/reparent-action.test.mjs` | real `createExplorationSession`, candidate action success/failure/recovery | This is the test pattern the editor installation tests must follow. |
| `tests/engine/exploration/reparent.test.mjs` | candidate topology and frame/hit installation | Reuse for tree-order/depth/hit assertions. |
| `tests/engine/render/label-overlay.test.mjs` | safe text and label lifecycle | Add Unicode/HTML-looking-name coverage through the existing label path. |

## 3. Capability classification

### 3.1 Already implemented and reusable

- Rooted tree validation and graph derivation: `loadTree()`.
- Stable node IDs in existing data; graph keys are IDs.
- v2/refinement layout and depth computation.
- Depth-context scope and filtered layout.
- 780 ms navigation transition, fades, and stable label lifecycle.
- Final hit snapshot installation.
- Session transaction and `{ok:false}` failure reporting.
- Candidate isolation and real recovery reporting in
  `performReparentInstallation()` / `recoverAuthoritativeSession()`.
- Shared node-drag gesture and drag-busy Fit guard.
- Read-only details panel with `textContent`.
- Existing reparenting semantics and tests.

### 3.2 Requires extension

- `performReparentInstallation()` installation core: generalize to accept a
  command candidate and a `layoutMode` (`preserve` or `recompute`) while keeping
  the reparent wrapper/API compatible.
- Harness `renderDetails()` and `publish()`: preserve editor draft/input across
  status refreshes.
- Harness `onCanvasClick()`: intercept dirty drafts before
  `handleExplorationCanvasClick()`.
- Harness `fitGraph()`, node gesture enablement, and saving ownership: one shared
  ownership gate.
- `createExplorationModel().details()`: add description/link/isRoot/delete scope
  metadata (read-only fields) without exposing editor state in the model.
- `tree` storage: add `dataRevision` and history alongside `datasetToken`.

### 3.3 New components

- `src/engine/hypertree/editor/validation.js`
- `src/engine/hypertree/editor/commands.js`
- `src/engine/hypertree/editor/action.js`
- `src/engine/hypertree/editor/history.js`
- `src/engine/hypertree/editor/controller.js` (UI-agnostic draft/ownership state)
- `tests/harness/m5-exploration/editor-panel.js`


- Editor tests under `tests/engine/editor/`.

Do not put editor command semantics in `main.mjs`. The harness should wire
components, not own validation or candidate mutation rules.

## 4. Authoritative model and schema

### 4.1 Single authority

The current harness has one editable authority (`tree`) and one derived graph.
The editor keeps that arrangement:

```text
tree (plain object, ordered children)
  -> loadTree(tree) -> graph
  -> stage/refine -> baseLayout
  -> createExplorationModel -> scope
  -> prepare/stage frame -> scene/labels/hits
```

The editor must never directly mutate `graph.nodes` or `baseLayout` as a write
path. Candidate tree is cloned, loaded, laid out, framed, then committed.

### 4.2 Minimal metadata schema

No new top-level tree fields. `tree-loader.js` allows only:

```js
{ id, name, kind, data, children }
```

Use the existing `data` object:

```js
{
  id: 'fo-2-7',
  name: 'Design notes',
  kind: 'file',
  data: {
    description: 'Optional plain text',
    link: 'https://example.test/notes',
    // existing layout metadata such as $dim remains untouched
  }
}
```

Rules:

- `node.name`: existing display name, max 200 Unicode code points after trim.
- `node.data.description`: optional string, max 2,000 Unicode code points.
- `node.data.link`: optional string, max 2,048 Unicode code points.
- Missing/empty description/link normalize to `null` in editor drafts and in
  persisted in-memory metadata; display treats `null` as empty.
- Existing `$dim`, `$angularWidth`, `$color`, and all other `data` keys are
  preserved byte-for-byte through cloning.
- No `description`/`link` top-level fields, no separate metadata map, no second
  source of truth.
- IDs are never rewritten.
- `kind` never changes.

### 4.3 New node defaults

New nodes use the loader/graph/layout defaults rather than inventing visual
metadata:

```js
{ id, name, kind, data: { description: null, link: null }, children: [] }
```

The effective layout defaults are `DEFAULT_NODE_OPTIONS`/`resolveDim()`:
`dim=3`, `angularWidth=1`. No new color or shape metadata.

## 5. Validation and normalization decisions

### 5.1 Names

1. Require a string.
2. Trim leading/trailing Unicode whitespace (`String.prototype.trim()`).
3. Reject empty.
4. Count **Unicode code points** with `Array.from(name).length`; maximum 200.
5. Reject C0 controls (`U+0000`–`U+001F`) and `U+007F`, except no newlines in
   names.
6. Store the trimmed string exactly; do not NFC-normalize stored user text.
7. Display using `textContent`/label overlay text; never parse HTML.

### 5.2 Duplicate comparison

Direct siblings only, across both folder and data kinds.

```js
nameKey(name) = name.trim().normalize('NFC').toLowerCase()
```

- NFC comparison only; it does not alter stored text.
- Unicode default lowercase only; no accent folding, width folding, language
  locale tailoring, or whitespace collapsing beyond outer trim.
- Case-insensitive under that definition.
- Existing node being renamed is excluded from the duplicate set.
- Add/rename compares against all direct siblings, including both kinds.
- Reporting identifies the conflicting display name and stable ID.

### 5.3 Description

- Optional; normalize `''` to `null`.
- Maximum 2,000 Unicode code points.
- Preserve internal newlines and whitespace.
- Store exactly; render as pre-wrapped text in the panel.
- No HTML parsing or linkification.

### 5.4 Link

- Optional; trim; empty to `null`.
- Maximum 2,048 code points.
- Parse with `new URL(value)`.
- Allow only `http:` and `https:`.
- Require a non-empty hostname.
- Reject credentials? **Recommendation:** reject `username`/`password` for the
  initial slice because storage/display-only links do not need them and they
  invite misleading display.
- Store the trimmed user string, not a rewritten URL; display it as text.
- Opening links is explicitly outside this slice.

### 5.5 Stable ID generation

Use a bounded, session-local, deterministic namespace:

```js
id = `fo-${datasetToken.toString(36)}-${counter.toString(36)}`
```

- `datasetToken` is the harness dataset identity.
- Counter is monotonic within the dataset and never decremented by undo.
- Check against the complete candidate tree; if collision, increment again.
- Maximum 10,000 attempts; then fail before mutation.
- No random UUID, timestamp, locale, or filesystem-derived ID.
- Undo/redo retains the exact generated ID from history.
- IDs are display metadata keys, not filesystem paths.

### 5.6 Effective pipeline limits

The current plan must not advertise 2,000 nodes as editor-capable. The mandatory
editor pipeline has tighter limits:

| Stage | Exact source | Limit/behavior |
|---|---|---|
| Tree loader | `data/tree-loader.js`, `LIMITS` | `maxNodes=100000`, `maxDepth=10000`, `maxChildren=10000`; metadata limits. |
| v2 stage | `layout/experimental-v2.js` `V2_MAX_NODES`, `V2_MAX_DEPTH` | stage accepts up to 2,000 nodes / depth 64. |
| refinement | `layout/experimental-v2-refinement.js` `evaluateCandidate()` | Calls `measurePreparedScene(finalScene, { viewport })` with no `maxNodes`. |
| diagnostic metrics | `layout/experimental-metrics.js` `DIAGNOSTIC_MAX_NODES=300`, `ensureDiagnosticBound()` | Default rejects any prepared scene with more than 300 nodes; it counts all scene nodes, not only visible nodes. |
| scene preparation | `render/scene.js` `SCENE_LIMITS.maxNodes=1500`, `maxEdges=1499` | Scene throws above 1,500 nodes or 1,499 edges. |
| renderer | `render/graph-renderer.js` `SCENE_LIMITS` | Same 1,500/1,499 bounds. |
| exploration frame | `exploration/frame.js` calls `prepareGraphScene()` | Final frame is scene-bounded. |
| labels | `render/label-overlay.js` `LABEL_LIMITS` | Default `maxLabels=40`; independent of node admission. |

Conditional paths do not make larger structural edits admissible:

- refinement's `evaluateCandidate()` returns `{metrics:null}` early when
  `calculateFitCamera()` fails, before `measurePreparedScene()`;
- that path is a failed-fit path, not a coherent accepted layout; the final
  exploration frame still has to fit and install;
- when fit succeeds, `measurePreparedScene()` throws above 300;
- `ensureDiagnosticBound()` also rejects when only some nodes are hidden, because
  it checks total scene nodes;
- scene preparation's 1,500 limit is less strict than the mandatory 300
  diagnostic limit for any successful structural candidate.

**Editor admission policy:** `EDITOR_MAX_NODES = 300` is an admission ceiling for
every editor command (rename, metadata, add, reparent, delete, undo, redo), not a
geometric feasibility guarantee. Existing depth, numerical, layout, and fit
validation still reject infeasible candidates without mutation. This is the
conservative intersection of all mandatory stages and guarantees that structural
edits and their undo/redo can pass refinement diagnostics without raising renderer
or diagnostic limits.

- Do not silently raise `DIAGNOSTIC_MAX_NODES`, `SCENE_LIMITS`, or v2 limits.
- Do not pass a larger `maxNodes` to diagnostics.
- Datasets above 300 nodes remain view-only for editing until a separately
  approved pipeline change; E1 must disable editor admission, not merely hide a
  button.
- At 300 nodes, a successful reparent/delete/metadata/rename candidate stays at
  300; add is rejected because it would produce 301.
- Depth remains bounded by `V2_MAX_DEPTH=64`, child count by
  `LIMITS.maxChildren=10,000`, and edges by 1,499.

For add, the new node depth is parent depth + 1. For a folder add, initial
subtree depth is that node only. Reparent reuses existing subtree depth. These
checks happen before candidate preparation; candidate failures preserve the old
tree.

### 5.7 Acceptance tests at the effective boundary

- 299 + add → accepted, 300 total.
- 300 + add → rejected before candidate/session mutation.
- 300-node rename/metadata/reparent/delete candidate → accepted through real
  refinement + frame + hits.
- 300-node structural undo/redo → accepted.
- 301-node dataset/editor command → rejected with `editor-node-limit`; no
  revision/history change.
- A 301-node scene that fails fit early must still be rejected by policy, not
  treated as admitted via the refinement early return.

## 6. Common command boundary

### 6.1 Command contract

```js
{
  type: 'rename' | 'edit-metadata' | 'add-child' | 'delete' | 'reparent',
  datasetToken: 2,
  baseRevision: 17,
  targetId: 'n12',
  parentId: 'n3',       // add
  sourceId: 'n12',      // reparent
  input: {
    name: 'Renamed',
    description: '...',
    link: 'https://example.test/'
  },
  expected: {
    kind: 'file',
    deletionScopeHash: '...' // delete confirmation revalidation
  }
}
```

- `datasetToken` identifies the loaded dataset.
- `baseRevision` identifies the authoritative editable revision.
- `targetId`/`parentId`/`sourceId` are stable IDs.
- `input` is the normalized UI draft; command builders revalidate.
- Command execution returns `{ok, reason, message, error, recovered, commandId}`.

### 6.2 Revision and dataset identity

Add harness state:

```js
let dataRevision = 0;
let datasetToken = 0;
```

- `datasetToken` increments only on `boot()`/dataset replacement.
- `dataRevision` increments only after successful authoritative commit.
- A command captures both at initiation.
- Undo/redo are commands and increment revision on success.
- A stale command rejects before any candidate preparation.
- Frame `generation` remains a frame counter; it is not reused as the data
  revision.

### 6.3 Candidate preparation by layout mode

#### Metadata mode (`layoutMode: 'preserve'`)

Applies to rename and description/link edit:

1. clone tree;
2. replace only `name` or `data.description`/`data.link` on one node;
3. `loadTree(candidateTree)`;
4. reuse current `baseLayout` because topology and IDs are unchanged;
5. create candidate model with same focus/selection;
6. candidate session starts with the old camera and framing;
7. frame run uses `fit:false`;
8. draw/labels/hits;
9. commit tree/graph/model/session and increment revision.

No layout function is called. No camera reset. No transition.

#### Structural mode (`layoutMode: 'recompute'`)

Applies to add, delete, reparent:

1. clone tree and apply topology edit;
2. `loadTree(candidateTree)`;
3. `stageExperimentalV2Layout()` with current root, `current` phase, overridable
   node options;
4. `refineExperimentalV2Layout()` with current viewport, padding 24, base
   radius, current phase;
5. create candidate model;
6. restore focus if the focused folder still exists; otherwise root;
7. restore selection if visible/hittable;
8. frame run with accepted fit policy (`fit:true` for structural edits, matching
   current reparent behavior);
9. commit and increment revision.

Do not add automatic navigation into an add parent or drop target.

### 6.4 Installation lifecycle

The exact required sequence:

```text
validate command + dataset/revision
  -> prepare independently owned candidate
  -> prepare layout/scope/scene
  -> draw graph
  -> update labels
  -> install matching hits
  -> commit authoritative state
  -> publish success
```

Proposed extracted installation core:

```js
performTreeCommandInstallation({
  command,
  tree, graph, model, session,
  datasetToken, revision, structuralRootId,
  viewport, baseRadiusCss, phase,
  frame, setCandidateEnv, commit, recover
})
```

It should reuse the proven candidateEnv mechanics from
`performReparentInstallation()`:

- `setCandidateEnv(candidate)` before candidate session;
- candidate session `publish: () => {}`;
- `createExplorationSession({ frame, invalidate })`;
- `session.run(operation, prepare, {fit:false})`;
- candidate success only after frame returns `ok:true`;
- clear candidate environment;
- commit live refs once;
- on failure, clear candidate env, restore authoritative refs, and call the
  accepted recovery adapter;
- `recovered` must be `recoverAuthoritativeSession(oldSession) === true`;
- preserve the original installation error;
- if recovery fails, leave interaction inert.

`performReparentInstallation()` becomes a thin wrapper around the same core or
calls a shared internal installer. Existing exported APIs and tests remain
compatible.

## 7. Focus, selection, and camera

| Operation | Focus | Selection | Camera/framing | Layout |
|---|---|---|---|---|
| Rename | unchanged if exists | renamed node | unchanged; preserve current camera/framing | preserve |
| Metadata edit | unchanged | edited data node | unchanged | preserve |
| Add child | current focus, no navigation into parent | new node | structural accepted-fit policy | recompute |
| Reparent | current focus if exists; otherwise root | moved source if visible, otherwise cleared | structural accepted-fit policy | recompute |
| Delete | surviving parent | surviving parent | structural accepted-fit policy | recompute |
| Undo/redo metadata | recorded pre-command focus if valid | recorded selection if visible | recorded pre-command camera/framing | preserve |
| Undo/redo structural | recorded pre-command focus if valid; otherwise root | recorded selection if visible | structural accepted-fit policy; no pixel-camera claim | recompute |

Metadata edits must never call `resetCamera()` or silently clear camera/framing.
Structural edits use the existing centered-fit/camera-limit contract, not a new
animation or navigation gesture.

## 8. Draft, ownership, and failure matrix

### 8.1 Ownership state

```js
editorState = 'idle' | 'editing-clean' | 'editing-dirty'
            | 'confirm-replace' | 'saving'
            | 'inert-recovery-failed';
```

One owner token is acquired for save/install:

```text
editor-saving
node-gesture
transition
dataset-replacing
resizing
destroying
```

No frame installation is allowed unless the command owner token is current.

### 8.2 Matrix

| State | Canvas click / navigation | Pan / zoom | Node drag | Fit | Editor save | Frame replacement |
|---|---|---|---|---|---|---|
| idle | accepted shared click path | accepted | accepted | accepted | opens form | shared session |
| editing-clean | selecting another node closes draft then shared click | accepted | disabled while editor open | accepted | allowed | pan/zoom/Fit normal; selection via shared click |
| editing-dirty | intercepted; pending choice; no selection/navigation | accepted | disabled | accepted | allowed | pan/zoom/Fit normal; no pending selection frame |
| confirm-replace | prompt owns click resolution | accepted | disabled | accepted | blocked until choice | pan/zoom/Fit normal; no pending selection frame |
| saving | ignored/diagnostic | suspended | blocked | `editor-busy` | disabled/aria-busy | one candidate install |
| transition | existing transition click rules | existing | blocked | `transition-busy` | disabled | transition owns |
| node drag | existing drag ownership | blocked | active | `drag-busy` | disabled | drag cannot save |
| dataset replace | ignored | suspended | destroyed | blocked | no draft | old surface destroyed |
| resize | diagnostics | accepted after rebuild | destroyed | accepted | draft preserved if target valid | new surface |
| destroy | none | none | none | none | none | none |

### 8.3 Dirty draft replacement and pending intent

Pan/zoom and Fit remain **ordinary allowed frame installations** while a draft is
dirty. They do not replace or read draft DOM, do not change selection, and do not
consume a pending navigation. Their normal session/frame path remains active,
subject to the existing camera/fit contracts.

Only node selection, folder navigation, and background-click selection are
blocked by a dirty draft. A pending intent is stored as semantic identity, never
as pointer coordinates:

```js
pendingIntent = {
  kind: 'folder-enter' | 'node-select' | 'background-clear',
  targetId: 'n12' | null,
  datasetToken: 2,
  baseRevision: 17,
  hitKind: 'folder' | 'file' | null,
  source: 'canvas-click'
}
```

- Do not store `clientX`/`clientY` for later replay. A stale pointer location is
  meaningless after pan/zoom/Fit.
- `frameGeneration` may change because pan/zoom/Fit installed a new frame;
  generation is diagnostic only, not a reason to replay coordinates.
- On Discard, revalidate `datasetToken`, `baseRevision`, target existence,
  current graph kind, and current `visibleSet` membership for that ID.
- Folder intent executes the accepted navigator path only after validation; a
  780 ms transition begins only then.
- File intent selects through the accepted model/click path.
- Background intent clears selection through the accepted session path.
- If the target is stale, absent, or no longer visible, drop the intent and show
  a concise staleness/not-visible message. No navigation and no transition.
- Clear `pendingIntent` before executing it, so it cannot run twice.
- While the prompt is open, canvas selection is blocked until Continue editing or
  Discard changes; clicking elsewhere does not enqueue a second intent.
- **Continue editing:** clears pendingIntent; draft, focus, selection, camera,
  transition state, and revision remain unchanged. No navigation occurs.
- **Discard changes:** closes the draft, then revalidates/executes exactly one
  pendingIntent against the current coherent frame/revision.
- Cancel on a dirty form discards the draft; it does not execute pendingIntent.
- Save failure keeps all draft fields, selection, focus, and draft DOM state.

### 8.4 E1 form identity and input behavior

E1 correction: menu activation is idempotent while the editor is open and
`createEditorController.open()` is idempotent. Reopening cannot reset draft text,
dirty state, errors, composition, or pending intent. The controller captures
`datasetToken` and `baseRevision` at open and keeps them immutable; Save passes
those captured values as the request identity and compares them with the current
authoritative identity. Publish, camera movement, resize, and failed save do not
refresh the draft identity. Dataset replacement destroys the draft.

Controller-owned draft values are not sufficient. `publish()` currently calls
`renderDetails()`, which calls `detailsEl.replaceChildren()`; rebuilding the form
would destroy focus, caret, selection, and IME composition state.

E1 requirements:

- Create a stable editor form subtree once per open editor session. Ordinary
  `publish()`/status/detail updates update text nodes and attributes in place; they
  do **not** replace form inputs or buttons.
- Keep the read-only summary separate from the draft form. Re-rendering the
  summary must not recreate `#editor-form`.
- Preserve `document.activeElement`, `selectionStart`, `selectionEnd`, and
  `selectionDirection` across ordinary status publication and pan/zoom/Fit frame
  installs.
- Track `compositionstart`/`compositionend` on text controls. Korean IME
  composition must not trigger Save, candidate preparation, validation-driven DOM
  replacement, or trimming/rewriting of the composing value.
- `Enter` in a single-line name/link field saves only when not composing and the
  form is not busy; `Enter` in the description textarea inserts a newline.
  `Ctrl+Enter`/`Meta+Enter` saves from the textarea. `Escape` cancels when not
  composing. Basic keyboard behavior is E1, not deferred to E5.
- Disable Save/Cancel only during saving; preserve field values during validation
  and installation failure.
- Labels use `for`/`id`; errors use `aria-describedby`, `aria-invalid`, and
  `textContent`. Saving state uses `aria-busy="true"`; status/error uses
  `aria-live="polite"`.
- On successful Save, move focus to the panel summary/heading or the renamed
  node's edit target. On Cancel, restore focus to the summary. On dirty
  prompt open, focus Continue editing; on close, restore the prior focus.
- Close/dataset replacement/destroy removes composition listeners, key handlers,
  status timers, pending intent, and form subtree; clear the draft controller.
- No `innerHTML` for names, descriptions, links, errors, or status text.

### 8.5 E1 editor activation

The accepted implementation uses the canvas `contextmenu` event as the editor
boundary:

- initial publication shows the actual structural root name/details, without a
  fabricated click or editor open;
- left click keeps existing folder navigation, data selection, and background
  clear; it never opens the rename editor automatically;
- the normal details summary has no permanent Rename button;
- right click on a node resolves the final rendered hit snapshot through
  `clientToCanvasCss()` without DPR multiplication, then opens one owned
  Rename menu for that exact stable ID;
- choosing the menu's Rename item closes the menu and opens the form;
- the menu is clamped to the viewport; outside click and Escape dismiss it;
- right click does not select, enter a folder, center, reset camera, or change
  scope;
- right click on empty canvas is unhandled and preserves the native browser menu;
- the browser menu is prevented only for a handled node-editor action;
- editor activation is rejected during transition, drag, saving, inert state, or
  an incoherent frame;
- the listener is attached/removed with the canvas surface lifecycle.

Canonical editor target:

```js
{ kind: 'editor-target', id, hitKind, name, datasetToken, baseRevision }
```

Menu targets and pending editor intents use this same schema. Legacy `targetId`
is accepted only through `normalizeEditorTarget()`. `chooseEditorTargetFlow()`
validates dataset/revision/kind/visibility and either opens the form, prompts for
a dirty replacement, or rejects; `resumeEditorTarget()` uses the same flow after
Discard. The form captures its own immutable identity only when it actually opens.

The contextmenu helper accepts the event explicitly (`activateEditorTarget(target,
event)` / `openEditorMenu({event})`) and never reads `window.event`. Menu placement
uses only the supplied event coordinates.

The editor target is explicit and independent of navigation selection/focus.
The panel shows the edit target name and stable ID. Save renames the editor
target and preserves navigation focus, selection, layout, camera, and framing.

Dirty behavior:

- same target: preserve draft, identity, errors, and composition;
- different target: block replacement and show Continue editing / Discard
  changes;
- Continue performs no navigation or editor replacement;
- Discard clears the draft, then revalidates and performs the pending semantic
  action exactly once. For an editor-target pending action it opens the new
  editor; for a left-click pending action it executes the shared navigation path.
  No pointer coordinates are replayed.
- The new target's dataset/revision identity is captured only when its editor is
  actually opened.

`createEditorController.open()` is idempotent; menu-only activation cannot reset
an open draft. R2 identity is captured at open and remains immutable for Save.


## 9. Undo/redo design

### 9.1 Snapshot vs inverse

- Full tree snapshots are simple and restore exactly, but 20 × worst-case
  metadata could exceed a reasonable bound and duplicates all unchanged nodes.
- Inverse commands are smaller and fit the existing clone/lookup/tree-command
  path, but deletion still needs a subtree payload.
- **Chosen approach:** inverse commands with bounded subtree payloads.
  - rename: inverse old name;
  - metadata: inverse old description/link;
  - add: inverse remove generated node (redo retains added node);
  - delete: inverse insert complete subtree at parent/index;
  - reparent: inverse move source back to previous parent/index.

This approach is source-compatible because `cloneTree()`, `findTreeNode()`,
`findParent()`, and the candidate installation path already exist; no snapshot
serialization format is introduced.

### 9.2 Browser-compatible accounting

Do **not** use Node `Buffer.byteLength()` in the editor controller; the harness is
a browser page.

```js
const encoder = new TextEncoder();
function utf8Bytes(value) {
  return encoder.encode(String(value)).byteLength;
}
```

The byte count is a deterministic UTF-8 estimate used for reservation and
eviction. It is **not** a JavaScript heap-memory guarantee: object overhead,
Map overhead, string interning, retained DOM, and engine internals are outside
the count.

#### Exactly what counts

Each retained history entry counts:

- the normalized forward command descriptor;
- the inverse command descriptor;
- retained subtree payload (delete) or added-node payload (add), if present;
- retained old/new name, description, link, and any patched metadata;
- recorded `viewBefore` (focus, selection, camera, framing);
- recorded `viewAfter` (focus, selection, camera, framing);
- entry envelope fields (`id`, `kind`, timestamps/sequence, hashes, expected-state
  descriptors).

The byte count covers **both undo and redo stacks** and all retained entries. It
does not count the live authoritative tree, current graph/layout/model, session
objects, DOM, or browser caches.

#### Bounds

```text
maxEntries       = 20 total entries across undo + redo stacks
maxEntryBytes    = 2 MiB per entry
maxTotalBytes    = 8 MiB across undo + redo stacks
```

- An entry includes forward + inverse + retained payload + both view records.
- `maxEntryBytes` is checked before candidate preparation/commit.
- `maxTotalBytes` is checked with any existing entries plus the reservation.
- No serialized-byte claim is made about actual heap usage.

#### Preflight reservation without live mutation

1. Normalize command and build inverse/payload in candidate preparation.
2. Compute `entryBytes` with `TextEncoder`.
3. If `entryBytes > maxEntryBytes`, reject with `undo-capacity` **before**
   mutation, frame install, revision increment, or history change.
4. Compute a proposed history plan: `clearRedo`, ordered eviction candidates,
   and the entry to reserve. Do **not** mutate either live stack yet.
5. Confirm the plan fits `maxTotalBytes` after proposed eviction.
6. Install the candidate.
7. Only after authoritative commit succeeds, apply the plan: clear redo,
   evict proposed oldest undo entries, push the entry.
8. On failure discard the plan and preserve both stacks, pointers, entries, and
   revision exactly.

Deletion is not exposed unless this reservation path is usable. A delete whose
subtree payload exceeds `maxEntryBytes` is rejected before mutation rather than
becoming an unundoable deletion.

#### No-op commands

A no-op consumes neither revision nor history and performs no frame installation:

- rename to the same trimmed name;
- metadata values unchanged;
- add/delete/reparent that validation classifies as no-op;
- duplicate/invalid/no-permission commands are rejected without reservation.

#### Eviction and reset

- The proposed plan evicts oldest undo entries only; live eviction happens after commit.
- Eviction is reported in status (`history:evicted`), not silently hidden.
- Dataset replacement clears both stacks, reservations, and history IDs.
- Failed undo/redo does not move entries or pointers.

### 9.3 Revision binding and expected state

Stored entries capture historical revisions for audit, but they never execute
with that old revision. At execution, each inverse is wrapped as a current
command:

```js
{
  type: 'undo',
  datasetToken: currentDatasetToken,
  baseRevision: currentRevision,
  inverse: entry.inverse,
  expected: entry.expectedBeforeUndo
}
```

Rules:

- `entry.expectedBeforeUndo` is the expected state for undo;
  `entry.expectedBeforeRedo` is the expected state for redo. Neither is the
  historical base revision. The expected records include dataset token,
  target/parent IDs, kind, normalized name key, metadata values, parent/index,
  and a hash of the affected subtree/sibling set as applicable.
- Validation checks current dataset, current revision, expected state, and
  candidate result before installation.
- On success current revision increments (e.g. 13 → 14). The historical revision
  remains only history metadata.
- On failure current revision, tree, and stack position are unchanged.
- Stack transfer happens **only after successful installation**: undo entry
  moves from undo stack to redo stack; redo moves to undo stack.
- Redo wraps the inverse with `baseRevision=currentRevision` and
  `expectedBeforeRedo`; it never reuses the original forward revision.
- Both expected-state records are validated before candidate installation.
- New successful mutation clears redo before its own reservation.
- A failed new mutation does not clear redo or consume revision.
- Stable-ID allocation is monotonic and separate from history: undo of an add
  does not decrement the ID counter; redo reuses the recorded ID; a new add after
  undo uses a fresh ID. IDs are never reused by deletion/undo.

#### Before/after view records

Each entry stores distinct records:

```js
{
  viewBefore: { focus, selection, camera, framing },
  viewAfter:  { focus, selection, camera, framing }
}
```

- Undo restores `viewBefore`.
- Redo restores `viewAfter`.
- Metadata undo/redo restores the recorded camera/framing exactly.
- Structural undo/redo restores focus/selection and uses accepted structural fit;
  it does not claim exact camera restoration.
- If a recorded selection is no longer visible, selection becomes `null`; focus
  falls back to a valid parent/root.

### 9.4 Concrete sequence

Initial state: dataset token `2`, revision `10`; root `r` with folder `a`, folder
`b`, data `x`; focus/selection `r`.

1. **Rename `a` → `Alpha`** (metadata)
   - revision 10 → 11; entry U1.
   - topology/IDs unchanged; camera preserved.
   - viewBefore/after both focus `r`, selection `a` (or the prior selected node).
2. **Add `fo-2-1` "Notes" under `b`** (structural)
   - revision 11 → 12; entry U2.
   - append last; ID `fo-2-1`; focus `b`, selection `fo-2-1`.
3. **Reparent `x` from `a` to `b`** (structural)
   - revision 12 → 13; entry U3.
   - `x` is last child of `b`; sibling order of `a` preserved.
4. **Undo U3**
   - inverse is wrapped with `baseRevision=13`, expected state verifies `x` under
     `b` at its recorded index.
   - success revision 13 → 14; `x` returns to `a` at its original index.
   - U3 moves to redo; undo stack U1,U2; redo R3.
5. **Undo U2**
   - wrapped `baseRevision=14`; expected state verifies `fo-2-1` still under `b`.
   - success revision 14 → 15; `fo-2-1` removed; `b` remains last child of `r`.
   - U2 moves to redo; redo R2,R3.
6. **Undo U1**
   - wrapped `baseRevision=15`; expected state verifies `a` is named `Alpha`.
   - success revision 15 → 16; `a` name restored.
   - undo empty; redo R1,R2,R3.
7. **Redo U1**
   - wrapped `baseRevision=16`; expected state verifies `a` has the old name.
   - success revision 16 → 17; name `Alpha`; R1 moves to undo.
8. **Redo U2**
   - wrapped `baseRevision=17`; expected state verifies `fo-2-1` is absent and `b`
     is intact.
   - success revision 17 → 18; `fo-2-1` restored at last child index with same ID.
9. **Redo U3**
   - wrapped `baseRevision=18`; expected state verifies `x` under `a` at original
     index.
   - success revision 18 → 19; `x` returns to `b` last child.
   - final undo U1,U2,U3; redo empty; IDs/topology/names match the state after
     step 3.

If undo/redo installation fails at any point, the current revision remains
unchanged, the entry stays on its current stack, the original error remains
available, and recovery reports only the actual `session.run()` result.

### 9.5 Undo/redo behavior

- Undo/redo are ordinary tree commands, not direct mutations.
- They pass through the same candidate installation, draw, labels, hits, commit,
  recovery, and revision increment.
- Undo of delete restores the subtree at the exact parent/sibling index.
- Undo of add removes the generated node; redo restores the same ID/metadata.
- Undo of reparent restores the exact previous parent/index.
- Delete remains unavailable until usable undo exists.
## 10. Delete semantics

- Available only in E4, after E3 undo is available.
- Original structural root cannot be deleted.
- Data node delete: only that node.
- Folder delete: folder plus complete subtree.
- Confirmation counts:

```text
Remove from FileOrbit?
2 folders and 5 data items (7 nodes) will be removed.
No disk files are deleted.
[Remove from FileOrbit] [Cancel]
```

- Counts are computed from the current target subtree and shown before action.
- Confirmation stores `{targetId, datasetToken, baseRevision,
  deletionScopeHash}`.
- At execution, revalidate target existence, kind, root protection, revision,
  dataset token, and exact subtree ID set/hash; mismatch rejects.
- No implication of filesystem deletion; wording is "Remove from FileOrbit".
- After success: focus/select surviving parent, structural fit.
- Delete never appears in E1–E3 UI; undo support is a prerequisite.

## 11. E1–E5 implementation slices

### E1 — Editor panel foundation and rename (IMPLEMENTED — NODE/MOCK VERIFIED; RIGHT-CLICK ACTIVATION)

1. **User-visible behavior**
   - Initial load shows the actual structural root name/details without a fake
     click or editor open.
   - Normal details summary has no Rename button.
   - Right click opens a menu containing Rename; choosing it opens the form for
     that exact node target.
   - Rename form: name field, Save, Cancel; inline validation; saving/error state.
   - Stable form DOM; Korean IME composition does not save or validate prematurely.
   - Dirty target/navigation replacement prompts Continue editing / Discard changes.
   - Dirty draft survives validation/installation failure.

2. **Existing files/symbols to extend**
   - `tests/harness/m5-exploration/main.mjs`: `renderDetails()`, `publish()`,
     `onCanvasClick()`, `performReparent()`, `fitGraph()`, `createDragGesture()`,
     `destroy()`.
   - `tests/harness/m5-exploration/index.html`: existing `aside`, `#details`.
   - `src/engine/hypertree/exploration/navigation-model.js`:
     `details()` add readonly `isRoot`, `description`, `link`.
   - `src/engine/hypertree/exploration/reparent-action.js`: extract/reuse
     candidate installation core.
   - `src/engine/hypertree/exploration/index.js`: exports.

3. **New files/responsibilities**
3. **New files/responsibilities**
   - `src/engine/hypertree/editor/validation.js`: name rules, duplicate key.
   - `src/engine/hypertree/editor/commands.js`: `rename` candidate builder.
   - `src/engine/hypertree/editor/action.js`: metadata install wrapper.
   - `src/engine/hypertree/editor/controller.js`: draft, dirty, saving, pending
     choice, identity capture, ownership; no DOM.
   - `src/engine/hypertree/editor/intent.js`: semantic navigation/editor intents.
   - `src/engine/hypertree/editor/activation.js`: right-click target resolution,
     activation guards, menu-target revalidation.
   - `src/engine/hypertree/editor/context-menu.js`: canvas contextmenu binding.
- `src/engine/hypertree/editor/target.js`: canonical target schema.
- `src/engine/hypertree/editor/activation-flow.js`: shared menu/pending/open flow.
   - `tests/harness/m5-exploration/editor-panel.js`: summary/form, target label,
     Save/Cancel, inline error, `aria-live`, dirty prompt, stable form identity,
     IME and keyboard handling.
   - `tests/harness/m5-exploration/editor-context-menu.js`: owned viewport-clamped
     Rename menu, outside/Escape dismissal, exact listener cleanup.
   - `tests/engine/editor/validation.test.mjs`
   - `tests/engine/editor/draft.test.mjs`
   - `tests/engine/editor/panel.test.mjs`
   - `tests/engine/editor/intent.test.mjs`
   - `tests/engine/editor/rename-action.test.mjs`
   - `tests/engine/editor/open-save.test.mjs`
   - `tests/engine/editor/activation.test.mjs`
   - `tests/engine/editor/context-menu.test.mjs`

4. **Command/data/API contracts**

```js
renameCommand({
  datasetToken, baseRevision, targetId,
  draft: { name: 'New name' }
})
```

Returns:

```js
{ ok: true, candidateTree, layoutMode: 'preserve', targetId }
```

Installation result:

```js
{ ok: true, reason: 'installed', revision: baseRevision + 1 }
```

5. **Validation, ownership, failure/recovery**
   - Name required/trimmed/codepoint limit/duplicate rules.
   - Dataset/revision check before preparation.
   - Metadata layout preserve, current camera/framing, `fit:false`.
   - Saving owns navigation/drag/Fit; click ignored while saving.
   - Candidate `draw`/`labels`/`installHit` failure: draft preserved, old tree
     restored, original error, `recoverAuthoritativeSession(oldSession)` result
     only; failed recovery disables interaction/inert.
   - No delete, add, metadata edit, undo, or history in E1.

6. **Executable tests using actual shared action/frame path**
   - Rename file/folder/root; stable ID; layout positions/depths unchanged.
   - Camera/framing unchanged before/after rename.
   - 300-node rename accepted; 301-node rename rejected by `EDITOR_MAX_NODES` before candidate/session mutation.
   - Duplicate names under same parent across kinds, including NFC/case cases.
   - Unicode 200-codepoint boundary; HTML-looking names inserted as text.
   - Stable input identity: status/pan/zoom/Fit publication preserves focus, caret, selection, and value.
   - Korean IME composition start/update/end: no Save, no validation-driven form replacement; commit only on compositionend + explicit Save/Enter.
   - Enter/Escape/Ctrl+Enter and focus restoration pass.
   - Initial root details are populated without a click/editor open.
   - Contextmenu helper consumes the explicit event only (no window.event).
   - Canonical menu/pending target schema; Discard opens exact B once and stale pending rejects.
   - Right-click opens menu only; choosing Rename opens explicit target; left
     folder/data/background clicks never open editor/menu.
   - Background context menu remains native; menu is clamped and removed on
     outside/Escape/resize/dataset/destroy; exact listeners are cleaned.
   - Right-click target differs from navigation selection/focus and saves without navigation.
   - Save failure after draw/label/hit preserves draft and authoritative tree.
   - Recovery success/failure uses real `createExplorationSession`.
   - Dirty selection prompt: Continue editing performs no navigation/frame;
     Discard then executes pending shared click exactly once.
   - Saving blocks Fit/drag/navigation.
   - Cancel/destroy removes form/status listeners and timer.

7. **Manual browser verification**
   - Select file, rename, Save; label updates, node/camera do not move.
   - Rename root; gold root remains; scope unchanged.
   - Edit a name to duplicate sibling; inline error, draft remains.
   - Rename dirty, click another folder; Continue keeps panel/camera; Discard
     then applies normal folder navigation/780 ms transition.
   - Resize/destroy while editing; no stale form/listener.
   - Browser status separate and **NOT RUN** until executed.

8. **Acceptance criteria**
   - Initial details show actual structural root name/details.
   - No permanent Rename button; menu-only activation.
   - Rename works for root/other folders/data; stable ID.
   - No layout/camera/topology change.
   - Editor disabled at >300 nodes; 300/301 boundary tests pass.
   - Stable form DOM preserves focus/caret/selection/IME.
   - Draft/error/ownership rules pass.
   - At the E1 slice boundary, no add/delete/undo was exposed; E2 now exposes add/metadata only.
   - All existing transitions/fades/labels/drag/pan/zoom/fit tests pass.

9. **Dependencies**
   - None beyond current accepted code; E1 is the starting slice.

### E2 — Add child folder/data item and edit description/link (IMPLEMENTED — NODE/MOCK VERIFIED)

1. **User-visible behavior**
   - Folder menu: Rename, Add folder, Add data item.
   - Data menu: Rename, Edit details.
   - Add folder form: name only.
   - Add data form: required name, required description, required File/Web link type;
     file picker or URL field conditionally shown.
   - Edit details form: description/link only; legacy/file/web-link behavior is explicit;
     attachment replacement/type conversion remains deferred.
   - New child appends last; focus stays on focused folder; new node selected/
     details shown when visible; structural fit; no navigation into the child.

2. **Existing files/symbols**
   - E1 controller/panel/command/action/target/flow/context menu.
   - `tree-loader.js` `data` support; accepted v2/refinement and frame/hit code.
   - `navigation-model.js` readonly description/link details.
   - `main.mjs` boot/tree, allocator, editor save dispatch.
   - `editor/index.js` exports.

3. **Files/APIs**
   - `editor/attachment-classification.js`: bounded prefix classification.
   - `editor/attachments.js`: session-local registry and budgets.
   - `editor/validation.js`: description/link rules, add/metadata validation,
     `createEditorIdAllocator`.
   - `editor/commands.js`: `buildAddChildCommand`, `buildMetadataCommand`,
     existing `buildRenameCommand`.
   - `editor/action.js`: shared `performEditorCommandInstallation`,
     `performAddChildInstallation`, `performMetadataInstallation`, rename wrapper.
   - `editor/controller.js`: action + name/description/link draft state.
   - `editor/target.js`: canonical target and semantic action schemas.
   - `editor/activation-flow.js`: menu/open/pending coordinator for all actions.
   - `tests/harness/m5-exploration/editor-panel.js`: stable add/details fields.
   - `tests/harness/m5-exploration/editor-context-menu.js`: folder/data actions.
   - Tests `attachments.test.mjs`, `e2-add-metadata.test.mjs`, `e2-flow.test.mjs`, panel/context tests.

4. **Contracts**

```js
buildAddChildCommand({ parentId, kind, draftName, draftDescription, draftLink, allocator })
buildMetadataCommand({ targetId, description, link })
performAddChildInstallation({ ..., parentId, kind, draftName, draftDescription, draftLink, allocator })
performMetadataInstallation({ ..., targetId, description, link })
```

IDs: `fo-${datasetToken.toString(36)}-${counter.toString(36)}`; monotonic
allocator, full-tree collision check, bounded attempts, dataset replacement reset.

5. **Validation/ownership/failure**
   - Reuses E1 name trim/control/code-point/duplicate rules.
   - Typed file/web data edits require non-whitespace description; typed web links
     also require a valid non-empty URL; legacy nodes retain optional policy.
   - Description max 2000 code points; entered whitespace/newlines preserved;
     empty string becomes null.
   - Link max 2048 code points; trimmed; absolute http/https; hostname required;
     credentials rejected; displayed as text only.
   - Metadata lives only in `node.data.description`/`node.data.link`.
   - Add/metadata enforce 300 nodes, depth, child count, name uniqueness, and
     candidate loading/layout/render/frame/hit acceptance.
   - Metadata preserves navigation selection (including null), baseLayout, camera,
     framing, focus, topology, and does not call layout.
   - Add recomputes accepted layout/depths/scope and uses structural fit.
   - No-op metadata writes nothing and increments no revision.
   - Candidate/frame failures preserve authoritative tree/model/session and draft.
   - Failed file installation retains the accounted pending reservation for retry;
     success transfers it to committed ownership.

### E2 attachment schema and classification

`node.data` fields:

```js
{
  dataType: 'file' | 'web-link',
  description: string | null,
  link?: string,                 // web-link only
  attachmentId?: string,         // file only
  originalName?: string,         // file only
  sizeBytes?: number,            // file only
  mime?: string,                 // reported MIME
  classification?: {             // file only, bounded JSON
    format, badge, confidence, needsReview, reason,
    extension, mime, classifier
  }
}
```

Folders keep no description/link/attachment. Legacy data nodes remain
`dataType` absent and use the previous name/link edit behavior. No migration or
type inference is performed. Attachment replacement/type conversion is deferred.

Session-local registry policy:

- explicit user file picker; one attachment per data item;
- 20 MiB per file; 100 MiB pending + committed retained bytes per dataset;
- pending reservation occurs at file selection before classification; replacement
  releases the previous reservation; Save reuses it without double-counting;
- registry owns File/Blob references; tree/graph/status never contain them;
- stage/reserve before candidate installation, commit only after authoritative commit,
  release on failure/cancel/replacement, clear on dataset/destroy;
- no upload, disk write, object URL, localStorage, IndexedDB, preview, or open.

Classification precedence:

| Extension/MIME/prefix evidence | Result |
|---|---|
| PDF signature and PDF extension/MIME | PDF, signature confidence |
| PDF signature with text/Markdown extension | unknown, needs review |
| `.pdf` or PDF MIME without signature | unknown `?`, needs review |
| Markdown extension, empty/octet MIME | Markdown, extension confidence |
| Markdown/text extension with binary MIME | unknown, needs review |
| Plain-text extension, empty/octet MIME | text, extension confidence |
| Text MIME, no recognised extension | text, MIME confidence |
| Unknown extension, inconclusive MIME | generic with safe extension badge |
| Extensionless/inconclusive | generic/unknown, honest confidence |
| Unsupported binary MIME for text | needs review, no text claim |

Only the first 1,024 bytes are read for signature classification. Classification
identifies presentation format only; it does not certify safety or content
validity.

6. **Tests**
   - Add folder/data under root and non-root folders; explicit parent differs from
     selection/focus; last-child append; sibling order; stable IDs; depths.
   - ID collision/exhaustion; 299→300 accepted; 300→301 rejected.
   - New data description/link, fixed-glyph render/hit, visibility/selection.
   - Duplicate/empty/Unicode names; description/link boundaries; unsafe links.
   - Metadata no-op and legacy-missing behavior; unknown metadata preserved.
   - Metadata layout/camera/framing preservation and fit:false.
   - Metadata edit of B while A or null is selected preserves selection, B details,
     focused folder, matching hit, and full camera/framing.
   - Draw/label/hit failures preserve authoritative data.
   - Menu → add/edit form → shared action → installation; dirty Continue/Discard
     across actions; stale pending identity.
   - Stable form DOM, textarea Enter/Ctrl+Enter, IME, focus/caret.
   - File picker, conditional type fields, bounded prefix classification, A→B
     race, type switch/cancel/destroy, budget cleanup, attachment ownership.
   - File/Web badges, review indicator, transition labels, safe filenames.
   - Attachment failure leaves no orphan registry record; rename preserves format.
   - Existing E1/reparent/navigation/transition/render/label regressions.

7. **Manual browser verification**
   - Right-click folder → Add folder → Save.
   - Add data item with description/link.
   - Right-click data → Edit details → Save/Cancel.
   - File item Markdown/PDF/TXT; web-link item; switch type; replace/cancel file.
   - Rename attached item and confirm badge/format persists; reload → attachment lost.
   - Duplicate name/invalid link; Korean input; multiline description.
   - Dirty replacement across actions; pan/zoom/Fit while editing.
   - Close editor and verify drag/navigation; resize/dataset replacement.
   - Browser status separate and **NOT RUN** until executed.

8. **Acceptance/non-goals**
   - Add folder/data and edit description/link work through one shared path.
   - No type conversion, delete, undo, history, persistence, or filesystem work.
   - No automatic navigation into added child; no limit increases.
   - File attachments are session-local, bounded, and never uploaded or serialized.
   - Delete/undo/history/persistence/preview/parsing/link opening remain deferred.
   - All existing E1/presentation/regression tests pass.

9. **Dependencies**
   - E1 controller/panel/action/rename rules.

### E3 — Bounded undo/redo, including existing reparenting (PLANNED / NOT IMPLEMENTED)

1. **User-visible behavior**
   - Undo/Redo controls in panel/header, enabled by history.
   - Undo rename, metadata edit, add, and drag/drop reparent.
   - History bounded; status indicates operation skipped/evicted.
   - No browser Back/Forward.

2. **Existing files/symbols**
   - E1/E2 command builders/action.
   - `performReparent()`/`performReparentInstallation()` to record reparent.
   - `main.mjs` boot/dataset replacement.
   - `m5-exploration` header/panel.

3. **New files**
   - `src/engine/hypertree/editor/history.js`.
   - Extend `editor/action.js` to execute undo/redo through the same install.
   - Extend controller/panel for buttons/status.
   - Tests `history.test.mjs`, `history-action.test.mjs`,
     `history-bounds.test.mjs`, `reparent-history.test.mjs`.

4. **Contracts**

```js
const reservation = history.reserve({
  forward, inverse, payload, viewBefore, viewAfter, expectedBeforeUndo, expectedBeforeRedo
});
// -> {ok:false, reason:'undo-capacity'} before mutation, or {ok:true,entry,bytes}
history.commit(reservation);   // apply redo-clear/eviction only after commit
history.release(reservation);  // discard plan; both stacks unchanged on failure
history.undo();                // -> command descriptor; no pointer move yet
history.redo();
history.reset({ datasetToken });
```

Only successful commits record; `undo()`/`redo()` return candidate commands; the
harness executes them through the command action and moves pointers only on
success.

5. **Validation/ownership/failure**
   - Undo/redo are serialized with save/drag/transition.
   - New mutation clears redo.
   - Failed undo/redo preserves pointers/current tree.
   - Dataset replacement clears history.
   - Stale inverse rejects by revision/token.
   - Bounds/failure use the same recovery path.
   - `EDITOR_MAX_NODES=300` applies to undo/redo; >300 is rejected before candidate.

6. **Tests**
   - TextEncoder UTF-8 counts; no Buffer dependency.
   - Counts include forward + inverse + payload + both view records + envelope;
     bounds span undo and redo stacks.
   - 20-entry bound; 8 MiB total; 2 MiB entry; eviction order.
   - Reservation plan rejected before mutation when entry >2 MiB; live undo/redo stacks unchanged.
   - No-op consumes no revision/history and installs no frame.
   - Redo cleared by new mutation.
   - Failed undo/redo leaves revision, tree, stack pointers, and entry unchanged.
   - Reparent undo restores old parent and sibling index; redo restores target.
   - Dataset reset rejects old history.
   - Original tree objects isolated from history payload mutation.
   - Actual frame/label/hit installation for undo/redo.
   - Concrete rename→add→reparent→undo×3→redo×3 revisions 10→19 pass.
   - Existing reparent regression remains green.

7. **Manual browser**
   - Rename/add/reparent then undo/redo; verify focus/selection/camera.
   - Create >20 operations; verify oldest eviction.
   - Perform a new edit after undo; verify redo disabled.
   - Reload dataset; verify history disabled.

8. **Acceptance/non-goals**
   - Bounded session-local undo/redo incl. reparent.
   - No browser history, persistence, or cross-dataset history.
   - No new graph/layout algorithm.

9. **Dependencies**
   - E1/E2 command and install path.

### E4 — Confirmed subtree/data deletion with undo (PLANNED / NOT IMPLEMENTED)

1. **User-visible behavior**
   - Non-root folder/data nodes show Delete.
   - Confirmation with exact folder/data counts and "Remove from FileOrbit".
   - Data node deletes one node; folder deletes complete subtree.
   - Root has no delete action.
   - Success focuses/selects surviving parent; undo restores subtree.

2. **Existing files/symbols**
   - E1–E3 controller/panel/action/history.
   - `collectSubtreeIds()`/`findParent()`/`cloneTree()`.
   - `navigation-model.js` details.
   - Harness `tree`, model, session, install.

3. **New files**
   - Extend `editor/commands.js`: `delete`.
   - Extend `editor/controller.js`: confirmation state, counts.
   - Extend panel: delete confirmation.
   - Tests `delete.test.mjs`, `delete-action.test.mjs`,
     `delete-history.test.mjs`, `delete-root.test.mjs`.

4. **Contracts**

```js
deleteCommand({
  targetId,
  draftConfirmation: { targetId, datasetToken, baseRevision, deletionScopeHash }
})
```

Candidate removes target; history inverse contains parent/index/subtree payload.

5. **Validation/ownership/failure**
   - Reject root, missing/stale target, mismatched scope hash, stale revision.
   - `EDITOR_MAX_NODES=300` policy applies; >300 editor is disabled and command rejects.
   - Counts must match confirmation.
   - Enforce undo capacity before mutation; reject if inverse exceeds cap.
   - Structural layout/scope rebuild; focus parent, selection parent, fit.
   - Failure preserves target tree and draft/confirmation; recovery via actual
     result; failed recovery inert.

6. **Tests**
   - Data delete exact node; folder delete exact subtree; root protection.
   - Counts folders/data/nodes exact.
   - Parent/index restore on undo; redo removes again.
   - Scope/focus/selection after delete; depths/layout/hits coherent.
   - Stale/mismatched confirmation rejects without mutation.
   - Draw/label/hit failure preserves original tree.
   - Delete not exposed before E3 (static/UI test).
   - Listener/timer cleanup.

7. **Manual browser**
   - Delete data with count `0 folders and 1 data item`; undo.
   - Delete folder with descendants; verify counts, parent focus, undo restore.
   - Attempt root delete; no control and command rejection.
   - Stale confirmation after another edit; reject.

8. **Acceptance/non-goals**
   - Exact subtree/data deletion with explicit confirmation and undo.
   - No disk deletion, no root deletion, no cascading filesystem action.
   - No persistence.

9. **Dependencies**
   - E3 undo must be available before Delete is exposed.

### E5 — Browser integration and usability verification (PLANNED / NOT IMPLEMENTED)

1. **User-visible behavior**
   - Final panel UX, keyboard/focus handling, aria-live, validation/error states.
   - Dirty prompt integrated with pending navigation.
   - Responsive resize and cleanup.
   - No new menus/breadcrumb/back/overview.

2. **Existing files/symbols**
   - All E1–E4 editor/harness files.
   - `tests/harness/m5-exploration/index.html`.
   - `docs/engine/FILEORBIT-NODE-EDITOR-IMPLEMENTATION-PLAN.md`.

3. **New files**
   - Only test/helper additions if needed; no new architecture.
   - `tests/engine/editor/harness-static.test.mjs` if not already.

4. **Contracts**
   - No new public API; verify existing command/action/controller APIs.

5. **Validation/ownership/failure**
   - Re-run full ownership matrix under resize/dataset/destroy/transition/drag.
   - Verify failed recovery inert state cannot accept saves.
   - Verify no stale frame/pending click executes after dataset replacement.

6. **Tests**
   - Browser static harness assertions (labels, no menus, aria).
   - Full Node regression matrix; editor action/frame tests.
   - Event/listener/timer cleanup tests.
   - Manual browser sequence separately reported; no native claim from mocks.

7. **Manual browser**
   - Full sequence below.
   - Keyboard focus, dirty prompt, duplicate error, invalid link.
   - 780 ms transition after Discard, no animation while prompt open.
   - Resize, dataset switch, destroy during form.
   - Reparent, add, delete, undo/redo compatibility.

8. **Acceptance/non-goals**
   - All E1–E4 acceptance; no functional regressions.
   - No persistence, filesystem, native drag, link opening, browser history.

9. **Dependencies**
   - E1–E4 complete.

## 12. E1–E5 table

| Slice | Scope | Main existing surfaces | New surfaces | Gate |
|---|---|---|---|---|
| E1 | Rename panel + dirty/ownership foundation | harness main/panel, model details, action core | validation, commands, controller, panel, rename action tests | no add/delete/undo |
| E2 | Add child/data, description/link | E1, loader data, limits | add/metadata validation, ID generator, forms | no delete/undo |
| E3 | Undo/redo incl. reparent | reparent action/history, controller | bounded history, history commands | Delete still hidden |
| E4 | Confirmed data/subtree delete | controller/action/history | delete command/confirmation | E3 required |
| E5 | Browser usability/regression | all | test/static helpers only | no architecture change |

## 13. Required executable tests

Use actual shared action/frame paths, not isolated tree assertions alone.

### 13.1 Editor validation and command tests

- `name` required/trim/200 codepoints; `EDITOR_MAX_NODES=300` boundary.
- NFC/case duplicate matrix; cross-kind siblings; excluded edited node.
- description 2,000; link 2,048; invalid/valid schemes.
- HTML-like text retained as text.
- ID uniqueness/collision loop/reset token; no reuse after undo.
- add last-child and sibling order.
- root protection and subtree counts.
- `EDITOR_MAX_NODES=300` (299→300 add accepted, 300→301 rejected); depth 64/child 10,000/edge 1,499 checks before revision/history mutation.

### 13.2 Installation/frame tests

For each command family:

- success: tree/graph/baseLayout/model/session commit once;
- candidate refs not published before success;
- labels explicitly updated, hits installed;
- metadata: layout coordinates/depths and camera/framing unchanged;
- structural: depths/scope recalculated, focus preserved, selection restored;
- draw failure, label failure, hit failure;
- recovery success and `{ok:false}` failure via real session;
- original error retained; recovered only `true` from result;
- failed recovery inert;
- 300-node structural candidate passes real refinement + frame + hit installation;
- 301-node candidate is rejected before refinement/frame, including the fit-early-return case.

### 13.3 Draft/ownership tests

- save/cancel with dirty/clean state;
- validation/install failure retains all fields and focus;
- dirty selection prompt no click/navigation/frame;
- Continue editing: focus/selection/camera/generation unchanged;
- Discard: pending click executes once, folder transition starts only then;
- pending intent stores IDs/kind/token/revision, not pointer coordinates;
- pan/zoom/Fit install normal frames while dirty; pending selection never executes from stale coordinates;
- stable form/input identity at 300 nodes; focus/caret/selection and Korean IME survive ordinary publish and pan/zoom/Fit;
- Enter/Escape/Ctrl+Enter and focus restoration;
- stale pending intent after dataset/revision change is dropped;
- saving blocks Fit/nav/drag; failed recovery inert;
- close/resize/dataset/destroy draft, composition, listener, timer cleanup.

### 13.4 History/delete tests

- TextEncoder accounting; bounds span undo+redo; 20 entries, 8 MiB total, 2 MiB entry, eviction;
- no-op consumes no revision/history;
- new edit clears redo;
- failed undo/redo doesn't consume;
- reparent inverse exact parent/index;
- delete counts/subtree/undo/redo;
- dataset reset clears history;
- original data isolated from recorded payload mutation;
- 300-node structural undo/redo passes; 301-node history command rejects without revision/pointer change.

### 13.5 Regression suites

- Existing exploration tests: 780 ms, fades, labels, click, drag, reparent,
  recovery, Fit ownership.
- Existing M4 render/label tests.
- Layout/refinement and fixture-freeze checks.
- Browser static assertions; browser visual/FPS/native drag remains separate.

## 14. Failure and ownership matrix (full)

| Failure/owner | Tree | Draft | Frames | Recovery | UI |
|---|---|---|---|---|---|
| validation | unchanged | retained | none | not needed | inline field error |
| stale dataset/revision | unchanged | retained | none | not needed | stale message |
| candidate preparation | unchanged | retained | none | not needed | original error |
| draw failure | unchanged | retained | candidate failed; no commit | real old-session recovery | inert if recovery fails |
| label failure | unchanged | retained | same | real | same |
| hit-install failure | unchanged | retained | same | real | same |
| commit success | candidate | clears on close | coherent target | no recovery | success status |
| recovery success | old authoritative | retained | coherent old frame | `recovered:true` | error status |
| recovery `{ok:false}` | old authoritative | retained | no active hits | inert | interaction disabled |
| transition active | unchanged | read-only | transition owns | n/a | editor disabled |
| drag active | unchanged | disabled | drag owns | n/a | editor disabled |
| dataset replace | new reset | discarded | new session | history reset | editor reset |
| resize | unchanged | retained if valid | surface rebuilt | n/a | form re-render |
| destroy | n/a | cleared | destroyed | n/a | cleanup |

No pixel rollback is claimed. Recovery is a coherent reinstall, not an undo of
pixels.

## 15. Manual browser sequence

1. **File rename**
   - Select data node → Rename → Save.
   - Verify label/name updates; node positions, camera, focus unchanged.
2. **Root rename**
   - Rename root; verify gold root remains gold and scope unchanged.
3. **Folder subtree move**
   - Drag folder subtree → folder.
   - Verify append-last, focus/selection, depth scope, labels/hits.
4. **Data target**
   - Hover folder then release on data node.
   - Verify exact `이것은 데이터 노드입니다.` and no topology change.
5. **Invalid cycle/root**
   - Attempt root source and descendant target; verify rejection.
6. **Ordinary click/background pan**
   - After drag, one generated click suppressed; next genuine click works.
   - Background pan and wheel zoom still work.
7. **Dirty draft**
   - Edit name; click another folder.
   - Continue editing: no navigation/animation.
   - Repeat and Discard: standard folder transition starts after choice.
8. **Validation**
   - Duplicate sibling across folder/data; empty name; overlong name/description;
     `javascript:`, `ftp:`, malformed link.
9. **Add**
   - Add folder/data; verify last child, stable ID, depths, scope.
10. **Delete**
    - Confirm exact counts; root has no delete; undo restores parent/index.
11. **Undo/redo**
    - Rename/add/reparent/delete; undo/redo; verify bounds and focus/selection.
12. **Resize/destroy**
    - Resize while dirty; verify draft retained or safely discarded.
    - Destroy/dataset replacement; verify no listeners/timers/ghost forms.

Browser verification is **NOT RUN** in this planning task. Mocked Node tests do
not establish native browser behavior.

## 16. Remaining design decisions and recommendations

1. **Unicode duplicate key:** recommend `NFC + Unicode toLowerCase()`; do not
   casefold accents/width. Revisit only with explicit product policy.
2. **Undo memory cap:** recommend 20 entries / 8 MiB total / 2 MiB entry. If a
   delete payload exceeds entry cap, reject before mutation with
   `undo-capacity`.
3. **Description trimming:** recommend preserving internal/outer text as entered
   except normalizing empty to null; names are trimmed.
4. **Link credentials:** recommend rejecting username/password in initial slice;
   opening links remains out of scope.
5. **New node visual metadata:** omit `$dim/$angularWidth` and rely on accepted
   defaults. Do not copy arbitrary source node visuals.
6. **Add camera:** recommend structural accepted-fit for add/delete; metadata
   preserves camera. If product wants camera preservation for add, make it an
   explicit follow-up, not a silent change.
7. **Undo camera:** metadata exact; structural refit only. Do not claim camera
   pixel restoration.
8. **Delete confirmation:** inline panel confirmation, not `alert()`/modal; the
   wording "Remove from FileOrbit" is required.
9. **Keyboard shortcuts:** defer Ctrl+Z/Y to E5; ensure not browser history.
10. **Description rendering:** pre-wrap text in panel; no rich text/link opening.

## 17. Exact E1 starting scope

Implement only:

- rename for root, other folders, and data nodes;
- right-panel rename form;
- Save/Cancel, inline error, aria-live status;
- dirty draft replacement prompt with Continue editing / Discard changes;
- dataset/revision stale rejection;
- metadata candidate installation preserving layout, camera, topology;
- draft retention on validation/installation failure;
- save ownership blocking nav/drag/Fit; pan/zoom/Fit still allowed while dirty;
- stable form/input DOM with IME and focus/selection preservation;
- cleanup on resize/dataset/destroy.

E1 must **not** add:

- add child/data;
- description/link editing;
- delete;
- undo/redo;
- browser history;
- persistence/filesystem behavior;
- new layout/renderer/transition algorithms.

### E1 file checklist

Modify:

- `tests/harness/m5-exploration/main.mjs`
- `tests/harness/m5-exploration/index.html`
- `src/engine/hypertree/exploration/navigation-model.js` (read-only details fields)
- `src/engine/hypertree/exploration/reparent-action.js` (extract/reuse install core)
- `src/engine/hypertree/exploration/index.js` (exports)

Create:

- `src/engine/hypertree/editor/validation.js`
- `src/engine/hypertree/editor/commands.js`
- `src/engine/hypertree/editor/action.js`
- `src/engine/hypertree/editor/controller.js`
- `tests/harness/m5-exploration/editor-panel.js`


- `tests/engine/editor/validation.test.mjs`
- `tests/engine/editor/rename.test.mjs`
- `tests/engine/editor/draft.test.mjs`
- `tests/engine/editor/rename-action.test.mjs`

### E1 acceptance check

- Rename updates names but never IDs, topology, positions, depths, camera, or
  transition/fade behavior.
- Editor admission is capped at 300 nodes; 301 is rejected before mutation.
- Form DOM identity, focus/caret/selection, Korean IME, Enter/Escape/
  Ctrl+Enter, aria-busy/status, and focus restoration pass.
- Dirty draft prompt does not navigate or animate until Discard.
- Continue editing leaves session/generation/camera/selection unchanged.
- Save failure retains draft and original installation error.
- Recovery reports only actual `session.run()` success.
- No editor feature outside rename is visible or callable.

## 18. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `renderDetails()` replaces draft DOM | Stable form subtree; summary-only in-place updates; controller draft plus DOM focus/caret/IME ownership. |
| Metadata edit resets camera | Candidate session starts with old camera/framing; `fit:false`. |
| Structural edit silently mutates live tree | Candidate tree only; candidateEnv; commit after frame. |
| Duplicate criteria disagree | Single `nameKey()` in validation module. |
| New IDs collide | Prefix + dataset token + monotonic counter + full-tree collision check. |
| Undo memory unbounded | Inverse payload caps and eviction; reject over-cap before mutation. |
| Editor/transition/drag frame competition | One owner token and shared gates; no second session/installer. |
| Recovery false positive | Reuse `recoverAuthoritativeSession()` actual result. |
| Delete mistaken for disk deletion | Exact wording and counts; no filesystem APIs. |
| Dirty click starts animation behind prompt | Intercept before `handleExplorationCanvasClick()`; pending click only executes after Discard. |

## 19. Definition of done

The editor plan is implemented only when E1–E5 acceptance tests and the manual
browser sequence pass, without regression to accepted layout, navigation,
transition, fade, label, drag/drop, fit, or recovery behavior. Until then this
document and the updated implementation-plan entry must remain **PLANNED — NOT
IMPLEMENTED**.
















































































































































