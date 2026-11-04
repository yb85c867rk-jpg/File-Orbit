# FileOrbit Stage 2B-1 — navigation and readability correction

Status: isolated prototype correction. No shared production module changed. The normal application remains free-only at 300 nodes.

Baseline: `fileorbit-stage2b1-lod-prototype-r169.zip`
Baseline SHA-256 verified:
`DE516D9CA8DE595F8B45266D835222BF5B963A43A3641B23869CA66ED59DD23F`

## 1. Findings and corrections

### FIX 1 — Breadcrumb navigation

Defect: `app.mjs` assigned `state.folderId` directly for the root breadcrumb. From an expanded cluster, the incompatible `expandedClusterId` remained, so `buildScene()` threw.

Correction:
- Added `LodPresentationModel.navigateToFolder(id)`.
- Every document breadcrumb now calls that model method.
- It validates the folder, pushes history, clears cluster, selection, and search-target together, then builds the scene.
- `enterFolder()` delegates to the same method.
- Back restores the previous folder/cluster/selection state.

Regression tests cover root breadcrumb from a root-level cluster and root breadcrumb from a non-root folder containing clusters.

### FIX 2 — Search reset

Defect: `search('')` retained `searchTargetId`; the UI search action did not redraw graph highlighting.

Correction:
- Clearing search now clears `searchTargetId` while retaining ordinary selection.
- Changing the query clears the previous search target.
- `runSearch()` and the prototype API redraw after search changes.
- Search-target red is removed; ordinary selection remains gold/distinct.
- Details remain available for the selected node.

Browser verification:
- actual input set to empty + actual Search button click
- `searchTargetId` null
- `.search-target` DOM count 0
- `.selected` DOM count 1 (ordinary selection preserved)

### FIX 3 — Hit-test consistency

Defect: `hitTestLayout()` iterated `layout.nodes`, excluding `layout.centerNode`.

Correction:
- Hit testing now iterates every interactive displayed node, including the center folder.
- Deterministic nearest-centre rule: within hit radius, the shortest distance wins; centre-first ordering resolves exact ties consistently.
- SVG pointer behavior and the common hit-test helper agree.

Verification:
- selected/search target `n999` hit-tests to `n999`
- center folder hit-tests to `root`
- empty background returns `null`
- proxy actual pointer click expanded the cluster
- document actual pointer click selected `n1`

### FIX 4 — Readability and label scheduling

Correction:
- Balanced local rings instead of 36 inner + 4 outer: 40-item focus now uses **2 rings of 20**.
- Ordinary labels are sampled across all nodes/rings rather than consumed by the inner ring.
- Ordinary simultaneous labels are bounded to **12**; every full name/path remains in Details.
- Selected/search-target labels are priority labels:
  - always rendered,
  - drawn last,
  - truncated only at 48 characters,
  - given a background halo via `paint-order`,
  - marked with a distinct priority class.
- Ordinary labels truncate at 24 characters; font size is unchanged.
- Center folder label is priority.
- No icons were introduced; file badges and `#E74C3C` search targeting remain.

Actual-browser priority-label measurement at 1600×1000:
- priority labels: 2
- clipped priority labels: **0**
- priority-label collisions: **0**
- total labels in the measured focus/search scene: 14

This validates priority labels only. Ordinary labels are bounded but are not guaranteed collision-free; screenshots and the label rule are retained rather than claiming full filename readability.

## 2. Changed files

Prototype:
- `analysis/stage2b1/model.mjs`
- `analysis/stage2b1/layout.mjs`
- `analysis/stage2b1/app.mjs`
- `analysis/stage2b1/browser-evidence.mjs`
- `analysis/stage2b1/index.html` (priority-label styling)
- `analysis/stage2b1/evidence/` (corrected screenshots and measurements)

Tests:
- `tests/engine/layout/stage2b1-lod.test.mjs` (11 tests)

Docs:
- this report

No `src/` file changed. No cluster is serialized. No production LOD or paid integration was added.

## 3. Evidence accuracy

The browser `revealAll()` routine is an **all-ID model reachability loop** and renders once afterward. It is not per-node visual rendering.

Separated evidence:
1. **All-ID model reachability**: every ID revealed and selected; scene membership checked in the model loop; source unchanged. Browser runs report 0 failures across flat/wide/balanced/mixed/deep at 300 and 1,000.
2. **Rendered scene membership**: screenshots for every shape at 1,000; cluster focus, deep focus, folder navigation, search pages and clearing.
3. **Actual pointer/navigation behavior**: CDP mouse clicks for proxy and document nodes; UI breadcrumb and Search button clicks.
4. **Label readability**: measured priority-label clipping/collisions at actual viewport; ordinary labels are bounded, not claimed collision-free.

## 4. Browser scenarios and measurements

Environment:
- Microsoft Edge 156.0.4314.58, headless
- Windows x64, viewport 1600×1000, DPR 1
- Node 24.12.0 CDP runner

Fresh browser results:
- Prototype load: ~209 ms
- All-ID reachability: 10/10 fixture-total combinations, 0 failures, 0 source mutations
- Breadcrumb root from expanded root-level cluster: mode `overview`, folder `root`, cluster cleared
- Breadcrumb root from expanded non-root cluster: mode `folder`, folder `root`, cluster cleared
- Search clear: target cleared; red target DOM count 0; ordinary selected DOM count 1
- Priority label stats: 2 priority labels, 0 clipped, 0 priority collisions
- Hit test: target `n999`, center `root`, background null
- Cluster focus: 40 scene nodes, 14 labels, 2 rings
- Deep reveal: `n101`, parent `n50`, 19 scene nodes/labels
- Search: 999 matches, 20 pages, 50/49 results; page 1 22 ms, page 20 4 ms, reveal 4 ms

Screenshots retained:
`overview-flat/wide/balanced/mixed/deep-1000.png`, `breadcrumb-root.png`, `breadcrumb-ancestor.png`, `proxy-details.png`, `focus-flat-cluster.png`, `selected-flat.png`, `deep-focus.png`, `folder-navigation.png`, `search-page-1.png`, `search-page-20.png`, `search-target.png`, `search-cleared.png`.

Raw measurements: `analysis/stage2b1/evidence/browser-measurements.json`.

## 5. Tests

- Fresh targeted model/layout/navigation tests: **42/42 PASS**, exit 0.
- Stage 2B-1 model/navigation suite: **11/11 PASS**.
- Full free regression: **NOT rerun for this correction**.
  - No shared production module changed.
  - Retained Stage 2B-1 baseline result: 1,186 tests, 1,185 pass, 1 skip, 0 fail.
  - That retained result predates these four new tests and does not cover them.
  - A fresh full run would currently be expected to contain 1,190 tests, but that is not claimed as executed.

## 6. PASS / FAIL / NOT RUN

**PASS**
- Root and ancestor breadcrumb navigation through the model.
- Expanded-cluster state cleared coherently; Back restores prior state.
- Search clearing removes red target highlighting.
- Ordinary selection remains visually distinct.
- Actual UI Search control and breadcrumb clicks tested.
- Center folder, proxies, node centers, and empty background hit-tested.
- Balanced two-ring focus placement.
- Priority selected/search labels not clipped or colliding in actual browser measurement.
- Full names/paths available in Details.
- Browser UI scenarios for every fixture shape.
- Deep local navigation and final partial cluster.
- Later-page search result and search clearing.
- All-ID model reachability across all shapes and totals.
- Targeted tests.

**FAIL**
- Ordinary labels can still overlap; no claim of full ordinary-label readability.
- Full free regression not rerun; retained result only.

**NOT RUN**
- Fresh complete free regression after this correction.
- Production LOD integration, cluster persistence, paid admission.
- Full 1,000-node label readability metric, FPS, native Chrome/Edge acceptance.
- Phone/tablet/enterprise/cloud/deployment.

This is an interaction prototype correction, not paid-edition acceptance.

## 7. Preservation

- Accepted free baseline: `E7608F387E5A9676CEF8F908B77241A26469ADCFB5889D00B4795FFDD6ADA441`
- Previous Stage 2B-1 candidate: `DE516D9CA8DE595F8B45266D835222BF5B963A43A3641B23869CA66ED59DD23F`
