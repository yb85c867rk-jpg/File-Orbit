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

- `hypertree-notification-actual-check.mjs`: actual README-root.md search-result + graph-filename activation, visible message bounds and timed dismissal.

- `hypertree-map-library-check.mjs`: unconnected Map Library visibility/Choose, synthetic connected list, Refresh placement and picker cancellation.

- `hypertree-open-error-check.mjs`: actual Map Library clicks for 300, deep-400, 300, and 1000; fails if deep-400 replaces 300, stale error survives/reappears, or unrelated actionable status is cleared.

- `hypertree-map-library-persistence-check.mjs`: native OPFS handle stored in IndexedDB, same-profile reload, no auto-open/permission request, explicit reconnect, denied state, storage failures, cancellation, and slow-restore/race protection.

- `hypertree-save-permission-check.mjs`: read-only Library picker/open, centered write dialog, deferred Continue request, cancel/deny preservation, already-granted and automatic-save no-prompt behavior.

- `hypertree-permission-startup-check.mjs`: clean startup with computed hidden backdrop, light/dark checks, controls clickable, populated dialog, Cancel/Continue, refresh cleanup.

- Library connect explanation tests cover Cancel/no picker, Choose Folder/read mode, picker cancellation, and no explanation on Refresh.
- Reconnect tests cover inline guidance, granted-without-new-request, request denial and preserved directory.

- `hypertree-create-map-form-check.mjs`: actual Create Map controls for Map Information/description, collapsed/expanded source folder, no file/drop controls, destination guidance, Unicode multiline create/save/reopen, Details display, cancel preservation, themes and small height.

- Collection storage tests (`tests/engine/persistence/map-library-settings.test.mjs`) and OPFS structured-clone evidence (`map-library-collection-opfs-check.mjs`) cover Phase A1 only; application integration is Phase A2.

- Phase A2 controller tests and integration checks cover migration/empty authority, A/B retention, reload, dedupe, active-document preservation and failure paths while retaining the existing sidebar.

- `library-collection-ui-check.mjs`: actual B1 sidebar collection/empty/selected views, linking, duplicate reuse, cancel, refresh, reconnect, narrow/light presentation and reload.

- `sidebar-scroll-check.mjs`: sole sidebar scroll owner, no inner vertical/horizontal scroll, many files/Libraries, short/normal/narrow layouts, collapsed rail, light theme, and last-entry/Settings reachability.

- `library-edit-ui-check.mjs`: B2 icon/modal, draft, picker cancel, Apply/Cancel/Escape, same-folder no-op, already-linked selection, persistence failure, document preservation and reload.


The Phase C test also covers the compact collapsible Library controls, + New, actual B destination writes, 499/500/501 code-point descriptions and 1600×900/700 fit.

- Upload preparation tests: `tests/engine/exploration/upload-preparation.test.mjs` covers file/folder structure, empty folders, collisions, Unicode/zero-byte metadata, exact bindings, 300/1000 boundaries, attachment limits, stale cancellation, source immutability and cleanup. D1 has no Upload UI.

- `upload-d2-check.mjs`: actual folder context Upload menus, Local Files/Folder path normalization, preview/cancel, collision, repeated/duplicate-name folders, stale/double Add, layout-failure attachment rollback, one-action undo/redo, save failure, and save/reopen.

- `upload-structure-diagnostic.test.mjs`: verifies failure export contains synthetic structure/layout data only.
- `upload-installation-diagnostic.test.mjs`: verifies the actual Upload preparation failure records effective configuration and failing parent.

- `upload-anonymized-492-check.mjs`: actual Local Folder Upload of the anonymized 85-folder/407-file hierarchy (492 nodes), descendant-aware R480 layout, full diagnostics, navigation/label, wheel/pan, one-action undo/redo, failed-install preservation, and save/reopen.

- `library-unlink-check.mjs`: actual Library-level Unlink controls, cancel/Escape, storage failure/retry, open-map/save preservation, draft invalidation, authoritative empty reload and no-deletion checks.

- `delete-folder-ordinary-check.mjs`: actual rendered non-root Delete Folder, exact subtree counts, single-action Undo/Redo, root protection and forced installation failure.
- `delete-large-r480-check.mjs`: actual paid R480 492-node Upload followed by focused nested Delete Folder, layout diagnostics, attachment-aware Undo/Redo, failed-delete preservation and save/reopen.

Deletion failure confirmation remains open with a privacy-safe `Export structure diagnostic` action. The export covers anonymized before/candidate topology and the deleted target ID.

Sidebar Library tests use only the visible Map libraries toggle and adjacent +; no legacy list/link controls remain.
