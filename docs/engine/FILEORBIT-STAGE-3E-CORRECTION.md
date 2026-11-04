# FileOrbit Stage 3E correction — paging/history consistency

## Baseline

Original Stage 3E candidate: `fileorbit-stage3e-lod-readability-r169.zip`
SHA-256: `D22B97B79F1F533941F13D97EB0EAD8185F88243979EA543846D37A47C081F9C`
Original archive preserved. This is a separate corrected candidate.

Stage 3E report totals corrected from retained logs to
**1,248 tests, 1,247 passed, 1 skipped, 0 failed**. Report-only correction; no extra run claimed there.

## 1. Page state through history

The presentation state now includes:

- `folderPage` for ordinary folders and proxy overviews;
- `clusterPage` for expanded clusters;
- folder, expanded cluster, selected ID, search target.

`_pushHistory` stores the complete location. `back()` restores folder, folderPage, expanded cluster, clusterPage, selected ID, and search target. Stale selections that are not in the restored page are cleared rather than causing the page to silently jump.

Validated with the actual model:

- page-2 folder entry → Back restores page 2;
- selected folder on page 2 remains selected and visible after Back;
- breadcrumb/overview → Back restores cluster page;
- search reveal → Back restores the prior location;
- nested folder navigation and repeated Back;
- page controls, details, and displayed membership agree after restoration.

## 2. Bounded ordinary folders and overviews

Paging now applies to all presentation modes, not only expanded clusters:

| Scene | Policy |
|---|---|
| Ordinary folder | 8 children/page; empty folder = 1 page, 0 items |
| Expanded cluster | 8 members/page |
| Proxy overview (>clusterSize children) | 8 proxies/page |
| Oversized proxy overview (400 children, 10 proxies) | 2 pages of 8 + 2 |
| 41 children | 2 proxies on overview page; expanding a 40-member cluster yields 5 pages |

Document topology is untouched. Ordering is deterministic, full counts are shown, partial final pages are handled, and search reveal selects the page containing the target.

Boundary coverage:

- 0, 1, 8, 9, 18, 39, 40, 41 children;
- partial final pages;
- 400 children / 10 proxies / 2 pages;
- empty folders;
- selection stability across page changes;
- all members reachable across pages.

No fonts are reduced below 11px.

## 3. Evidence and claim scope

All five shapes at 300 and 1,000 nodes now execute reveal-scene-membership checks for every original ID, not only ID lookup. The mixed fixture retains extended paging/search tests.

Actual browser controls verified:

- Page 2 of a cluster → enter `folder-page2` → Back lands on page 2 with page controls showing 2/5 and a bounded 8-item scene.
- Ordinary 40-child folder → page 1/5 of 8 items → Next → page 2/5 of 8.
- Direct graph folder/proxy/file clicks; direct label selection.
- Search `big-8` reveal on page 2/5; clear and query-change immediately remove model + rendered target.
- Repeated image preview/A-B-A/text/PDF bytes.
- Three desktop viewports with actual host/projection dimensions.
- Immediate disposal cleanup and actual browser error collectors: 0 errors.
  - Immediately after `bridge.dispose()`: graph host/canvas/DOM = 0/0/0, but previewOutput = 2 (app-owned preview elements).
  - After full harness unmount: graph host/canvas/DOM = 0/0/0 and previewOutput = 0.
  - Bridge-owned cleanup (canvas/labels/listeners/URLs/registry) is separate from app-owned preview DOM cleanup.

## Measurements after correction

| Viewport | Host/canvas | Presented | Label candidates | Visible | Suppressed | Overlap | Selected label | Search label |
|---|---:|---:|---:|---:|---:|---:|---|---|
| 1600×1000 | 978×600 | 9 | 9 | 9 | 0 | 0 | visible | visible |
| 1280×800 | 658×600 | 9 | 9 | 9 | 0 | 0 | visible | visible |
| 1024×768 | 402×600 | 9 | 9 | 5 | 4 | 4 | visible | visible |

The initial Stage 3E 4-of-41 limitation is replaced by bounded 9/9 at 1600/1280 and 5/9 at 1024. The narrow-host label overlap remains a documented limitation, not completed usability.

## Tests

- Focused corrected suite: **117 tests, 116 pass, 1 skip, 0 fail**, exit 0
  - Paging consistency: 5/5 PASS
  - Stage 3E presentation: 2/2 PASS
  - Stage 3D bridge (all five shapes, full reveal membership): 11/11 PASS
- `p1b-main`: **69/69 PASS**, exit 0
- Complete free regression: **1,253 tests, 1,252 pass, 1 skip, 0 fail**, exit 0
  - Remaining: 1,184 tests, 1,183 pass, 1 skip

## Changed files

- `analysis/stage2b2/model.mjs` — folder/overview/cluster paging, complete history restore, stale-selection pruning
- `analysis/stage3d/bridge.mjs` — generic page next/previous
- `analysis/stage3d/app.mjs` — generic page controls
- `analysis/stage3d/fixture.mjs` — page-2 folder and 40-child folder
- `analysis/stage3d/browser-evidence.mjs` — page-2 Back, ordinary 40, three viewports
- `analysis/stage3d/browser-evidence.json` + 11 screenshots
- `tests/engine/persistence/stage3e-paging-consistency.test.mjs` (new)
- `tests/engine/persistence/stage3d-lod-bridge.test.mjs` — every-ID reveal for all shapes
- `docs/engine/FILEORBIT-STAGE-3E-CORRECTION.md`
- Stage 3E report totals correction.

No production LOD activation, editor expansion, Upload, cloud, payments, Upgrade UI, Tauri, enterprise, deployment, publishing, or OntoMap access.

## PASS / FAIL / NOT RUN

**PASS**
- Folder/overview/cluster paging consistency.
- Page-2 folder entry/Back restores page 2.
- Selected page-2 folder retained; stale selection pruned safely.
- Breadcrumb, search reveal/back, nested navigation, repeated Back.
- Ordinary 40-child folder bounded at 8/page.
- Oversized proxy overview bounded at 8/page.
- Boundaries 0/1/8/9/18/39/40/41 and partial pages.
- All-shape every-ID reveal membership.
- Direct graph/label/proxy/file interactions.
- Search later-page reveal, clear/change.
- Repeated preview and cleanup/error collection.
- Three-viewport host/projection/label measurements.
- Full free regression.

**FAIL**
- None in executed checks.

**NOT RUN / LIMITATIONS**
- 1024px remains overlap-limited at 5 of 9 labels; 4 suppressed, 0 clipped.
- PDF browser rendering fidelity; bytes/embed only.
- Paid 1,000 full V2 rendering geometry remains blocked; LOD path unaffected.
- FPS not measured.
- Native IndexedDB concurrency/durability not established.
- Main-app LOD activation/editor/Upload/cloud/payments/Upgrade/Tauri/enterprise/deployment/publishing.

