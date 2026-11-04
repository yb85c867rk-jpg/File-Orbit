# FileOrbit Stage 2B-1 — isolated cluster/focus LOD interaction prototype

Status: **analysis/demo prototype only**. The application remains free-only at 300 nodes. No paid lifecycle, Upgrade UI, entitlement, format, layout default, deployment, or commercial work was added.

Baseline: `fileorbit-stage2a-layout-feasibility-r169.zip`
Baseline SHA-256 verified:
`B27285FDC2F0FD532BD19FCA66BD308CA535BF131229E3B50EE4C97EE43E8A27`

## 1. Result

Every node in every 300 and 1,000-node fixture can be revealed by document ID in the browser prototype:

| Fixture | 300 nodes | 1,000 nodes |
|---|---:|---:|
| flat | 300/300, 0 failures | 1,000/1,000, 0 failures |
| wide | 300/300, 0 failures | 1,000/1,000, 0 failures |
| balanced | 300/300, 0 failures | 1,000/1,000, 0 failures |
| mixed | 300/300, 0 failures | 1,000/1,000, 0 failures |
| deep | 300/300, 0 failures | 1,000/1,000, 0 failures |

All browser reachability runs also reported **source tree unchanged**. Deep-300 is reachable through bounded local scenes even though the Stage 2A global V2 layout remains infeasible for that fixture.

## 2. Isolation

Added under `analysis/stage2b1/` only:
- `model.mjs` — authoritative-document index and presentation/navigation/search model.
- `layout.mjs` — bounded local radial scene layout and hit testing.
- `app.mjs` — browser UI and test API.
- `index.html` — static prototype page.
- `browser-evidence.mjs` — CDP browser runner.
- `evidence/` — screenshots and raw measurements.

No `src/` file changed. No production module imports the prototype. No presentation tree is fed to persistence or serialized. Normal create/open/edit/save/recovery remains limited to 300 nodes.

## 3. Presentation model

- The complete document remains authoritative with original IDs, hierarchy, metadata, names, and attachment references.
- Clusters are presentation-only proxy objects; they are never real folders.
- Proxy IDs use a separate `proxy:` namespace and collision-check against every document ID. A document ID such as `proxy:root:0:40` forces the cluster proxy to `~1`; no collision occurs.
- Grouping is deterministic: child order is preserved and chunks are deterministic, including the final partial cluster.
- `clusterSize` is validated as an integer 2–500 in model construction/overview/focus. Invalid values throw immediately; no loops.
- Deep navigation uses the selected node's immediate parent and a bounded local scene. It never requires the entire ancestor chain to pass global V2 layout.
- Search pagination is bounded at 50/page; every page is reachable and the 50-result cap never permanently hides matches.

## 4. Interaction

Implemented:
- overview of folders/clusters;
- cluster expansion and return;
- document folder navigation and back;
- breadcrumb/current path;
- selection and details;
- complete-document search by name, ID, or path;
- paging of search results;
- search-result reveal, opening the containing folder/cluster;
- duplicate names resolved by ID and full path;
- selected and search-target filenames prioritized; search target uses `#E74C3C`;
- icon-free graph labels and file-type badges;
- proxy details explicitly say visual grouping, with no preview/edit action.

Browser hit testing is actual SVG pointer input; the selected item resolves to the displayed ID.

## 5. Browser evidence

Environment:
- Microsoft Edge **156.0.4314.58** (`HeadlessChrome/156.0.0.0 Edg/156.0.0.0`)
- Windows x64, 1600×1000 viewport, DPR 1
- Language `en-US`
- Node 24.12.0 for the CDP runner
- No FPS/Chrome/Edge native acceptance is inferred from synthetic tests.

Fresh browser measurements:
- Page load to prototype-ready: ~241 ms
- All-node reveal loops: 0 failures in every fixture; 0 source mutations
- Proxy click: 130 ms, mode changed to cluster
- Document click: selected ID `n1`, displayed scene member
- Deep reveal: `n101`, parent folder `n50`, 19 scene nodes/labels, 8 ms; breadcrumb contains the 50-node ancestor path
- Folder navigation: enter `g0` 7 ms; back returns to root
- Search: 999 matches, 20 pages; page 1 = 50 results, page 20 = 49; 96 ms / 7 ms; target reveal 7 ms
- Search target `n999` hit-tests to `n999`; target is rendered with `#E74C3C`
- Flat overview: 26 scene nodes/labels, 25 proxies
- Cluster focus: 40 scene nodes/labels

Screenshots retained in `analysis/stage2b1/evidence/`:
`overview-mixed-1000.png`, `overview-flat-1000.png`, `proxy-details.png`, `focus-flat-cluster.png`, `selected-flat.png`, `deep-focus.png`, `folder-navigation.png`, `search-page-1.png`, `search-page-20.png`, `search-target.png`.

Raw measurements: `analysis/stage2b1/evidence/browser-measurements.json`.

## 6. Correctness tests

- Every document ID revealed across all five shapes at 300 and 1,000 nodes.
- Cluster mapping covers every grouped child exactly once, in original order.
- Final partial cluster (39 members) verified.
- Duplicate names return distinct IDs/paths.
- Proxy-like document IDs cannot collide with proxy IDs.
- Invalid cluster sizes fail immediately.
- Scene bounds and hit testing resolve displayed IDs.
- Folder navigation/breadcrumb/back preserve source.
- Search pagination covers every match and reveals a later-page result.
- Browser all-node loops report 0 failures and unchanged source.

## 7. Limitations

- Full 1,000-node global V2 layout remains infeasible; this is a LOD prototype.
- Deep-300 global staging remains a known Stage 2A limitation; bounded local navigation works.
- Zero glyph overlap is **not** proof of filename readability. Browser screenshots show cluster labels can overlap at overview scale; no label-readability metric was established.
- The optimized Stage 2A diagnostic reports exact glyph overlap/min-centre separation but does **not** implement production `minimumShapeBoundarySeparationCss`.
- Browser measurements are active-operation timings, not idle FPS.
- Production LOD, focus navigation integration, labels/search/hit integration, and paid admission are out of scope and NOT RUN.

## 8. Tests

- Targeted mapping/navigation/layout tests: **38/38 PASS**, exit 0.
- Stage 2B-1 model/navigation tests: **7/7 PASS**.
- Complete free regression (fresh): **1,186 tests, 1,185 pass, 1 skip, 0 fail**, exit 0.
  - p1b-main: 69/69
  - Remaining: 1,117 tests, 1,116 pass, 1 skip
  - Skip: pre-existing fake-IndexedDB recovery serialization; native IndexedDB NOT RUN

## 9. PASS / FAIL / NOT RUN

**PASS**
- All-node ID reachability across all fixture shapes at 300 and 1,000.
- Browser all-node reachability with 0 failures.
- Complete source non-mutation.
- Presentation/document separation and proxy collision handling.
- Overview, cluster focus, folder navigation, back, breadcrumb.
- Complete search with 50-result paging; page 20 accessible.
- Duplicate-name ID/path resolution.
- Proxy labeling and disabled preview/edit action.
- Selection/details and hit-test consistency.
- Actual browser screenshots and raw measurements.
- Targeted and full free regression.

**FAIL**
- None in this prototype’s automated/browser validation.

**NOT RUN**
- Paid lifecycle, Upgrade UI, entitlement, accounts/payments/cloud.
- Production LOD integration and persistence of clusters.
- Full 1,000-node layout readability, label readability metrics, and FPS.
- Phone/tablet, enterprise, deployment, publishing.
- Native IndexedDB serialization.

This is an interaction prototype, not paid-edition acceptance.

## 10. Preservation

- Accepted free baseline: `E7608F387E5A9676CEF8F908B77241A26469ADCFB5889D00B4795FFDD6ADA441`
- Previous Stage 2A candidate: `B27285FDC2F0FD532BD19FCA66BD308CA535BF131229E3B50EE4C97EE43E8A27`
