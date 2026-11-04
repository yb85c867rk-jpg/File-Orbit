> Search-pager correction: see `FILEORBIT-STAGE-2B-2-PAGER-CORRECTION.md`.

# FileOrbit Stage 2B-2 — LOD scenes on the existing renderer stack

Status: isolated renderer-integration harness. The normal application remains free-only at 300 nodes. No production source module changed.

Baseline: `fileorbit-stage2b1-lod-correction-r169.zip`
Baseline SHA-256 verified:
`BD0DCB6B773EE16FE5D23DF24004FAAC18DB845B901F31FBB5A528D5C20A3EE7`

## 1. Architecture and data flow

Authoritative document:
`LodPresentationModel` indexes the complete document, preserving IDs, hierarchy, metadata, attachment references, paths, and document order.

Presentation scene:
`model.buildScene()` returns the current bounded local view: current folder plus document children or temporary cluster proxies. It never mutates or serializes the document.

Adapter:
`analysis/stage2b2/adapter.mjs` converts that presentation scene into a normalized staged layout (`presentationStaged`) with deterministic radial positions, then feeds the existing stack:

1. `createProjection` (existing coordinates)
2. `prepareGraphScene` (existing scene/edge/geometry)
3. `drawGraphScene` (existing Canvas renderer)
4. `createLabelOverlay` with `placement: 'around'` (existing measured label overlay)
5. `createHitSnapshot` + `hitTestNode` (existing hit-test contract)

The adapter imports the reusable model; it does not import analysis fixtures or browser globals. Fixtures are loaded by the isolated harness only.

Proxy IDs remain presentation-only. They are collision-checked against document IDs and never enter persistence, document commands, or Undo/Redo.

## 2. Interaction carried forward

- Overview, cluster expansion, folder navigation, breadcrumbs, Back.
- Root/ancestor breadcrumb navigation through `navigateToFolder`; incompatible cluster/selection/search state cleared.
- Selection/details; proxy details refuse preview/edit.
- Full-document search with 50-result pages and later-page reveal.
- Search clear removes target red while ordinary selection remains.
- Search reveal opens the containing scene.
- Rapid navigation and repeated Back exercised in the browser harness.
- All navigation is synchronous/model-owned; no stale asynchronous scene result can replace newer state in this prototype.

### Hit-test contract and file nodes

The existing production hit snapshot intentionally rejects file diamonds; file activation is routed through the existing label overlay, while folder/proxy glyphs use the canvas hit snapshot. The adapter preserves both paths:
- canvas pointer: current folder and cluster proxies
- label pointer: file labels
- hit helper: center, folder, proxy, empty background

No production hit-test or renderer module was changed.

## 3. Readability assessment

Existing label overlay used with:
- `maxWidth: 180`
- `maxLabels: 18`
- measured `placement: 'around'`
- selected/search-target IDs passed as priority IDs
- no font-size reduction

Actual browser dimensions:
- viewport 1600×1000
- canvas host 1200×700
- rendered label font **11px / 13.2px system-ui, sans-serif**

Search-target measurement at actual browser dimensions:
- 8 visible labels
- 1 priority label (selected and search target same node)
- clipped priority labels: **0**
- priority collisions with any visible label: **0**
- `#E74C3C` label color present before clear: 1; after clear: 0

This is a priority-label guarantee, not a claim that all ordinary filenames are readable simultaneously. Ordinary labels are bounded and may be suppressed. Full names/paths remain in Details.

## 4. Browser evidence

Environment:
- Microsoft Edge 156.0.4314.58, headless
- Windows x64, viewport 1600×1000, DPR 1
- Node 24.12.0 CDP runner
- This is automated headless browser evidence, not native PC Chrome/Edge acceptance.

Fresh results:
- Prototype load: 864 ms
- All-ID model reachability: 10/10 fixture-total combinations, **0 failures**, **0 source mutations**
- Proxy canvas pointer click: mode `cluster`
- File label pointer click: selected `n1`
- Center folder hit: `root`; background: null
- Deep reveal: `n101`, parent `n50`, 19-node local scene, 14 labels, 15 ms
- Search: 999 matches, 20 pages, 50/49 results; 60 ms page 1, 17 ms page 20, 9 ms target reveal
- Search target label click selected `n999`; canvas glyph hit is null for the file diamond by existing contract\n- Center-folder pointer click selected `root`
- Search clear: red label count 1 → 0; selected `n999` retained
- Rapid navigation: 40 cycles, **0 errors**; 10 repeated Backs, **0 errors**
- Remount: 1 canvas, 1 label overlay; cleanup state 1 canvas, 1 overlay, 13 label groups

Screenshots at actual dimensions:
`overview-flat/wide/balanced/mixed/deep-1000.png`, `proxy-details.png`, `focus-flat-cluster.png`, `selected-flat.png`, `center-current.png`, `breadcrumb-root.png`, `breadcrumb-ancestor.png`, `deep-focus.png`, `search-page-1.png`, `search-page-20.png`, `search-target.png`, `search-cleared.png`.

Raw measurements: `analysis/stage2b2/evidence/browser-measurements.json`.

## 5. Tests

Focused model/adapter/navigation tests:
- Stage 2B-2 suite: **5/5 PASS**
- Combined Stage 2B-1 + 2B-2 focused set: **16/16 PASS**, exit 0

Coverage includes:
- all-ID reachability for all five shapes at 300/1,000;
- source non-mutation;
- production staged scene and edge counts;
- production hit snapshot for center/proxy/background;
- proxy-like document ID collision;
- breadcrumb/search reset;
- deep-300 bounded local scene;
- final partial cluster mapping (carried from model tests).

Shared production modules untouched:
- Full free regression **not rerun** for this delivery.
- Retained Stage 2B-1 baseline result: 1,186 tests, 1,185 pass, 1 skip, 0 fail.
- That retained result predates the Stage 2B-1 correction and Stage 2B-2 tests and does not cover them. No fresh full-suite claim is made.

## 6. PASS / FAIL / NOT RUN

**PASS**
- LOD model/adapter separated from fixtures and browser globals.
- Authoritative document preserved; proxies presentation-only.
- Existing coordinate, scene, canvas renderer, label overlay, and hit snapshot used.
- Overview, expansion, folder navigation, breadcrumbs, Back.
- Search reveal, paging, later page, clear/reset.
- Proxy no-preview/no-edit behavior.
- Actual browser all-ID reachability and zero source mutations.
- Actual pointer proxy/file-label/center clicks; background hit-helper check.
- Priority-label clipping and collision checks against all visible labels.
- Rapid navigation, repeated Back, remount/cleanup.
- Focused tests.

**FAIL**
- None in focused tests or browser scenarios.
- Ordinary labels may still be suppressed/overlap; this is a documented readability limit, not hidden.

**NOT RUN**
- Fresh complete free regression (no shared production change).
- Full ordinary-label readability metric and FPS.
- Native PC Chrome/Edge acceptance beyond headless Edge.
- Normal-app LOD activation, paid admission, format, cloud, phone/tablet, enterprise, deployment.

This is an isolated interaction prototype, not paid-edition acceptance.

## 7. Preservation

- Accepted free baseline: `E7608F387E5A9676CEF8F908B77241A26469ADCFB5889D00B4795FFDD6ADA441`
- Previous Stage 2B-1 correction candidate: `BD0DCB6B773EE16FE5D23DF24004FAAC18DB845B901F31FBB5A528D5C20A3EE7`


