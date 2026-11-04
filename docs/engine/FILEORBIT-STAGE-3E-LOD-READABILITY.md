# FileOrbit Stage 3E — isolated LOD readability and direct interaction

> Corrected candidate: see FILEORBIT-STAGE-3E-CORRECTION.md. The correction fixes folder/overview/cluster page history restoration and applies bounded paging to ordinary folders and proxy overviews.

## Baseline

Reviewed Stage 3D corrected candidate:
`fileorbit-stage3d-isolated-lod-corrected-r169.zip`
SHA-256: `CB190BF27E3D314B5F30FAF5454046409E5E7AF51EA1AB3B92943F91A3A1A268`

Baseline preserved. Stage 3E is a separate candidate.

Stage 3D correction report totals corrected from retained logs to
**1,246 tests, 1,245 passed, 1 skipped, 0 failed** (report-only correction, no extra run claimed).
Stage 3E actual full run is reported separately below.

## Before: why 41 nodes showed four labels

Stage 3D expanded a 40-member cluster into one scene of 41 nodes (folder + 40 members), with a 900px projection but an actual 813px host. Observed label metrics:

- 41 candidates
- 18 measured/created (label budget)
- 4 visible
- 23 budget-excluded
- 13 overlap-suppressed
- root-protection rectangle around the center node
- node obstacles and long Korean names with 180px maximum width
- high ring density (24+ items across rings), so placement attempts collided
- projection width 900 exceeded the measured host width 813, so label/scene density was evaluated against a wider canvas than was actually displayed

This was a documented limitation, not completed usability.

## Bounded solution

### Cluster paging

`LodPresentationModel` supports `clusterPageSize`. The isolated bridge uses **8 members per cluster page**.

- 40-member cluster → 5 pages of 8.
- The scene contains the current folder + 8 members (9 nodes), not 41.
- All 40 cluster members remain in the complete document and are reachable page by page and by ID.
- `clusterPage`, `clusterPages`, `clusterTotal`, `clusterNext`, `clusterPrev` are exposed.
- Search/reveal sets the page containing the target.
- Selection changes labels/ring only; scene membership is unchanged.
- No filename text below the existing 11px.
- Ellipsis remains at 180px max width; full name/path are in selection details.

### Actual host dimensions

The adapter now measures the host at render time and resizes the canvas surface when needed:

- Projection width/height = actual measured host.
- Canvas CSS/backing metrics = actual host.
- Label overlay measurement = actual host.
- No fixed 900px projection against a narrower host.

## After: measurements

Actual browser, repository-loaded 1,000-node document, 8-member cluster page:

| Viewport | Host / canvas / surface | Presented nodes | Label candidates | Visible labels | Suppressed | Overlap | Selected label | Search label |
|---|---:|---:|---:|---:|---:|---:|---|---|
| 1600×1000 | 978×600 | 9 | 9 | 9 | 0 | 0 | visible | visible |
| 1280×800 | 658×600 | 9 | 9 | 9 | 0 | 0 | visible | visible |
| 1024×768 | 402×600 | 9 | 9 | 5 | 4 | 4 | visible | visible |

At 1024 the label budget is not the limiter; overlap at 402px width suppresses four labels. Selected and search-target labels remain visible. Root protection remains active. No labels are clipped in the recorded cases. The 4-of-41 problem is replaced by a bounded 5-of-9 narrow-host result with explicit paging.

## Direct graph interaction

Actual canvas/host clicks, not list-only:

- Folder node click `folder-big` → navigates into folder.
- Proxy node click → expands cluster page 1 (8 members, 5 pages).
- Visible filename label click → selects `big-0`; details ID `big-0`.
- Visible document label click `doc-1` → selects `doc-1`; details ID `doc-1`.
- Page Next → page 2 of 5, different 8 member IDs; Page Previous → page 1.
- Breadcrumb return → root.
- Search `big-8` → result reveal lands on page 2/5; selected/search filename visible.
- Search clear → target and rendered target null immediately; no old blue ring.
- Search change → target and rendered target null; page resets to 1.
- List remains available as an alternative navigation path.

Hit areas use the rendered node shapes and label rectangles; no enlarged overlapping invisible targets were introduced.

## Preview and evidence integrity

- Repeated image preview: same usable URL, naturalWidth 1.
- A → B → A: image → PDF → image; image URL remains fetchable.
- Text content exact `텍스트 첨부`.
- PDF bytes start `%PDF-1.7`; browser PDF rendering fidelity is not claimed.
- Bridge owns and revokes preview URLs; dispose idempotent.
- Browser error collectors (exceptions, console errors, log errors, network failures) collected **0 errors**.
- Immediate cleanup after `bridge.dispose()`: host children 0, canvases 0, DOM nodes 0, preview output 0.
- Remount resets search/page/results/input/preview.

## Tests

- Focused Stage 3E/runtime/persistence: **112 tests, 111 pass, 1 skip, 0 fail**, exit 0
  - Stage 3E paging: 2/2 PASS
  - Stage 3D bridge: 11/11 PASS
  - Skip: pre-existing fake-IndexedDB overlapping-readwrite case; native IndexedDB concurrency/durability NOT RUN.
- `p1b-main`: **69/69 PASS**, exit 0
- Complete free regression: **1,248 tests, 1,247 pass, 1 skip, 0 fail**, exit 0 (retained-log correction; no extra run claimed)
- Stage 3E correction actual execution is reported separately.
  - Remaining: 1,179 tests, 1,178 pass, 1 skip

## Model-level reachability

For flat/wide/balanced/mixed/deep at 300 and 1,000 nodes, repository load/admission and bridge tests verify:

- complete original ID set;
- every original node accessible by ID;
- reveal places a target in the bounded scene;
- paging covers all cluster members;
- selection does not alter scene membership;
- exact tree/topology/metadata and attachment SHA-256 unchanged;
- proxies disjoint from document IDs and persistence;
- re-save/reload preserves IDs/topology/metadata.

## Changed files

- `analysis/stage2b2/model.mjs` — bounded cluster pages
- `analysis/stage2b2/adapter.mjs` — actual host projection/surface sizing
- `analysis/stage3d/bridge.mjs` — cluster page bridge API
- `analysis/stage3d/app.mjs` — page controls, direct graph click, graph/label hit helpers
- `analysis/stage3d/index.html` — responsive host and page controls
- `analysis/stage3d/browser-evidence.mjs` — direct clicks, paging, three viewports, error collection
- `analysis/stage3d/browser-evidence.json` + 9 screenshots
- `tests/engine/persistence/stage3e-lod-presentation.test.mjs`
- `docs/engine/FILEORBIT-STAGE-3E-LOD-READABILITY.md`
- Stage 3D report totals correction.

No normal-app LOD activation, editor expansion, Upload, cloud, payments, Upgrade UI, Tauri, enterprise, deployment, publishing, or OntoMap access.

## PASS / FAIL / NOT RUN

**PASS**
- Bounded cluster paging (8/page) with every member reachable.
- 9-node scene labels 9/9 at 1600 and 1280; 5/9 at 1024 with explicit overlap suppression.
- Selected/search labels visible at all three viewports.
- Actual host dimensions used for projection/canvas/labels.
- Direct graph folder/proxy/label/file clicks select/navigate correctly.
- Page controls, breadcrumb, search reveal/reset/change.
- Repeated preview/A-B-A/text/image/PDF bytes.
- Immediate cleanup and real error collection.
- Model reachability across five fixtures × two sizes.
- Exact topology/metadata/attachment preservation.
- Full free regression.

**FAIL**
- None in executed checks.

**NOT RUN / LIMITATIONS**
- Label readability at 1024 remains overlap-limited: 5 of 9 labels visible; 4 suppressed. This is improved and bounded but not full readability.
- PDF browser rendering fidelity; bytes/embed only.
- Paid 1,000 full V2 rendering remains geometry-blocked; LOD path unaffected.
- FPS not measured.
- Native IndexedDB concurrency/durability not established.
- Main-app LOD activation/editor/Upload/cloud/payments/Upgrade/Tauri/enterprise/deployment/publishing.




