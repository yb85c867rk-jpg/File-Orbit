# Executable PC integration checks

Requires the local server on port 8164 and Edge.

- `paid-edit-check.mjs`: opens paid-test 1,000, activates a folder, edits a file via the ordinary editor, saves through a deterministic Save As handle, asserts tree and presentation agreement, Undo and Redo. Run:

```powershell
node tests/harness/m5-exploration/integration-checks/paid-edit-check.mjs
```

- `tests/harness/large-map/admission.test.mjs`: free 300 edit allowed, free 301 rejected, paid 1,000 edit allowed, 1,001st child rejected.

```powershell
node --test --test-isolation=none tests/harness/large-map/admission.test.mjs
```

These use test hooks/picker stubs, not native OS acceptance.

- `breadcrumb-check.mjs`: paid-test 1,000, expands `cat-1`, opens nested folder, clicks middle ancestor `01_기획`; asserts focus returns to `cat-1`. Evidence: `integration-breadcrumb.json`.

- `search-check.mjs`: actual app search controls for root file, first-level folder, nested folder and nested file; asserts focus, selected ID and Details. Evidence: `integration-search-routing.json`.
- `blocked-navigation-check.mjs`: dirties an editor form, clicks Back and Root, asserts focus/selection/history/camera unchanged. Evidence: `integration-blocked-navigation.json`.

- `save-reopen-check.mjs`: complete paid-test 1,000 edit, actual toolbar Undo/Redo, current-handle Save and reopen; asserts IDs/topology/attachments/Details. Evidence: `integration-save-reopen.json`.
- `save-as-cancel-check.mjs`: Save As `AbortError`; asserts destination hash/handle unchanged and dirty edits retained. Evidence: `integration-saveas-cancel.json`.


- Per-node attachment bindings are checked using the node's attachment reference; the 1,000 fixture has two same-named files with different bytes.

- `automatic-save-check.mjs`: fresh writable session; actual Undo/Redo; waits for write count and revision to settle; decodes bytes to verify undone/redone content. Evidence: `integration-automatic-save.json`.
- `automatic-save-blocked-check.mjs`: proves manual Save As cancellation leaves automatic saving blocked with dirty state and no write resumption until explicit recovery. Evidence: `integration-automatic-save-blocked.json`.

- `transition-check.mjs`: 750 ms geometry/camera transition, zoom-in/out, nested, background category, Back/Root/breadcrumb, wheel interruption, repeated clicks, replacement, reduced motion, label hit target. Evidence: `integration-transition.json`.
- `transition-cat1.gif` plus six intermediate frames: visual transition evidence.

- `transition-check.mjs` also asserts normalized endpoint opacity/positions, final painted pixels, global 22/22 folder visibility, direct larger/background click, and pan interruption.

- `transition-check.mjs` now also checks default labels for every immediate child, label collision/viewport bounds, PDF label color, no central background nodes, aria-current breadcrumb navigation and same-name path distinction.

- `renderer-comparison-check.mjs`: custom 1,000 renderer vs `?paidTest=1&hypertreeCompare=1` base renderer; verifies identical 1,000-byte hash, custom count/focus, renderer badges, base 300 preservation and the exact base 1,000 layout failure. Evidence: `integration-renderer-comparison.json`.

- `hypertree-r480-check.mjs`: existing Hypertree comparison at 1,000 nodes with projection radius 480; records layout time, focus, displacement, camera, label budget, wheel/pan and search behavior.

- `hypertree-wheel-check.mjs`: real wheel at 300 and R480 1,000 root/cat-12, both zoom directions, spacing, and post-wheel hit focus. Evidence: `integration-hypertree-wheel.json`.

- `hypertree-wheel-1600-check.mjs`: real-wheel 300/1,000 at 1600×900. Evidence: `integration-hypertree-wheel-1600.json`.
- `integration-hypertree-viewport-trace.json`: graph/canvas/controller dimensions through 1600/1900, resize and Details collapse.

- `hypertree-search-check.mjs`: actual same-name result buttons in R480; asserts parent focus, exact selected ID, Details, transition completion. Uses one debugger port, actual result buttons, cat-12 precondition, parent/selection/Details/hit assertions and finally cleanup.


- `hypertree-search-check.mjs` also records focused label counts and the measured f-0/f-80 glyph overlap before activating both same-name results.

- Active-branch framing: comparison focus fits/centers ancestor+descendant bounds; ordinary framing remains all-visible.

- `hypertree-wheel-1600-check.mjs` records the post-wheel cat-13 target bounds, containment, elementFromPoint and installed hit before clicking.

- `hypertree-capacity-check.mjs`: measures 1000→400 distributed fixtures plus wide/dense/deep 400 cases at 1900 and 1600; records child counts, visible child labels, label hits, overlaps and import time. Evidence: `integration-hypertree-capacity.json`.

- `hypertree-reflow-check.mjs`: controlled 1000-node cat-12 comparison for fresh 1900/1600 loads and same-session resize orders; records camera, controller, transition, placement policy, visible/suppressed IDs and label hits.

- `hypertree-search-pagination-check.mjs`: full-tree `보고서` pagination, union/duplicate checks, page activation, clear and replacement.
- `hypertree-animation-check.mjs`: rapid retarget, resize during transition, wheel during transition, search activation from cat-12.

- `hypertree-search-pagination-check.mjs`: 198-match pages, later-page activation, invalid-query stale controls, clear and replacement.
- `hypertree-animation-check.mjs`: resize deferral, folder retarget from displayed state, search activation; wheel/pan/continuity limitations are recorded separately.

- `hypertree-ui-check.mjs`: approved role colors, hidden/dev badge, notification timing/replacement/navigation clearing, light/dark label tokens.
- `hypertree-search-pagination-check.mjs`: centered pagination geometry, boundary states, invalid-query cleanup and 1600px layout.
