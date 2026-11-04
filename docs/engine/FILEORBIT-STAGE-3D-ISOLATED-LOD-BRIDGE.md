# FileOrbit Stage 3D — isolated saved-document LOD runtime bridge

> Corrected candidate: see FILEORBIT-STAGE-3D-CORRECTION.md. The corrected archive owns preview URLs in the bridge, rerenders on search changes, and collects browser errors rather than assuming none.

## Baseline

Reviewed Stage 3C candidate:
`fileorbit-stage3c-isolated-runtime-r169.zip`
SHA-256: `ADB9F849CC3B1FE3485EEF349A7323E82FD22CA004CE379D39459CB9B8E02CBB`

Baseline archive preserved. Stage 3D is a separate isolated harness/candidate.

Stage 3C report totals corrected per review to
**1,235 tests, 1,234 passed, 1 skipped, 0 failed**.
This is a report correction from retained logs; no extra Stage 3C run is claimed.

## Bridge

`analysis/stage3d/bridge.mjs` connects:

repository `save` → repository `load` → Stage 3C `admitSavedMapRuntime`
→ attachment adoption
→ Stage 2B-2 `LodPresentationModel`
→ existing renderer/label/hit-test adapter.

Properties:

- Admission occurs before attachment adoption or presentation setup.
- No full-document V2 refinement is required; the bridge does not call Stage 3B runtime reconstruction.
- The complete document tree, graph, identity, attachments, and original IDs are held separately from bounded scenes and proxy IDs.
- The model indexes every original node by ID; proxies live only in `proxyById`.
- Navigation/search operate on presentation state only and do not alter the tree or metadata.
- Proxies are never inserted into the document tree, persistence, attachment refs, or dirty state.
- Dispose destroys the adapter (canvas/labels/listeners), revokes candidate preview URLs, and clears candidate-owned attachment registry.
- Construction failure clears the adopted registry and disposes any adapter created before the failure.
- No live map/session/history/editor state is touched.

## Model-level validation

`tests/engine/persistence/stage3d-lod-bridge.test.mjs` covers five fixtures at 300 and 1,000 nodes:

- flat
- wide
- balanced
- mixed
- deep

Each fixture is saved through a real persistence repository and loaded before bridging. Coverage includes:

- Exact original ID set and every ID reachable through `documentRecord`.
- Proxy IDs disjoint from document IDs.
- Complete parent-child topology and metadata unchanged after construction, navigation, and search.
- Folder navigation, cluster expansion, breadcrumb, search pagination/reveal.
- Re-save/reload after navigation with exact tree equality, generation increment, and reloaded IDs.
- Mixed fixture: Korean/long/duplicate names, empty folder, text/image/PDF/zero-byte attachments, proxy-like original ID.
- Attachment SHA-256 equality before/after re-save.
- Repeated dispose and disposed-access guard.

## Browser evidence

Real Edge headless, native browser IndexedDB, repository save/load, actual UI controls:

- Seed/load a 1,000-node paid-context document.
- Mount bridge; render 5 root items; 1,000 original IDs.
- Enter `큰-폴더`; 25 proxies presented.
- Expand first cluster; 41 presented nodes (folder + 40 members), label count 4.
- Breadcrumb `Stage 3D 문서 > 큰-폴더 > 묶음 1 (40개)`.
- Return via breadcrumb.
- Select image attachment and preview blob image.
- Unmount: host children 0, preview cleared.
- Remount: 1,000-node model again.
- Search `파일`: 985 results, 20 pages; actual Next/Previous moves 1/20 → 2/20 → 1/20.
- Result click reveals `big-8` cluster target.
- Every original ID reachable; proxies disjoint.
- Live sentinel unchanged.

Screenshots: `analysis/stage3d/01-initial.png` … `06-search-revealed.png`; raw JSON: `browser-evidence.json`.

Label measurement in expanded cluster: 4 visible labels, 0 clipped, 0 priority collisions, 11px labels. This is readability-limited by the existing label budget/placement (`maxLabels=18`; 41 candidates, 18 measured, 4 visible, 13 overlap-suppressed). No clipping/overlap is hidden; the small visible count is the honest limit. No FPS measurement was made and no FPS claim is made.

## Operation boundary

| Operation | Document tree | Presentation | Persistence |
|---|---|---|---|
| Mount/admission | read-only | creates bounded scene | no write |
| Folder navigation | unchanged | folder state updated | no write |
| Cluster expansion | unchanged | proxy scene only | proxies absent |
| Breadcrumb return | unchanged | history restored | no write |
| Search Next/Previous | unchanged | page state only | no write |
| Result reveal/select | unchanged | selection/expanded state | no write |
| Preview | unchanged | candidate blob URL | no document change |
| Unmount/dispose | unchanged | canvas/labels/listeners removed; URLs revoked | no write |

## Changed files

- `analysis/stage3d/bridge.mjs`
- `analysis/stage3d/fixture.mjs`
- `analysis/stage3d/app.mjs`
- `analysis/stage3d/index.html`
- `analysis/stage3d/browser-evidence.mjs`
- `analysis/stage3d/browser-evidence.json`
- six screenshots under `analysis/stage3d/`
- `tests/engine/persistence/stage3d-lod-bridge.test.mjs`
- `docs/engine/FILEORBIT-STAGE-3D-ISOLATED-LOD-BRIDGE.md`
- `docs/engine/FILEORBIT-STAGE-3C-ISOLATED-RUNTIME.md` (totals correction only)

No production application, main.mjs, repository/recovery, format, database version, styling, or LOD harness changes.

## Tests

- Focused Stage 3D/runtime/persistence suite: **110 tests, 109 pass, 1 skip, 0 fail**, exit 0
  - Stage 3D bridge tests: 11/11 PASS
  - Skip: pre-existing fake-IndexedDB overlapping-readwrite case; native IndexedDB concurrency/durability NOT RUN.
- `p1b-main`: **69/69 PASS**, exit 0
- Complete free regression: **1,246 tests, 1,245 pass, 1 skip, 0 fail**, exit 0
  - Remaining: 1,177 tests, 1,176 pass, 1 skip

Browser evidence: 7 screenshots, 0 collected page errors.

## PASS / FAIL / NOT RUN

**PASS**
- Repository-loaded document → admission → LOD model.
- Five fixture shapes at 300 and 1,000 nodes.
- Every original node reachable by ID.
- Exact topology/metadata/attachment SHA-256 through navigation and re-save.
- Proxies disjoint from document/persistence.
- Folder/cluster/breadcrumb/search/select/preview.
- Unmount and repeated mount/dispose cleanup.
- Search pagination and result reveal.
- Label clipping/overlap measurement.
- Stage 3C admission and Stage 3B protections retained.

**FAIL**
- None in executed focused/full/browser checks.

**NOT RUN / LIMITATIONS**
- Paid 1,000 full-document V2 rendering remains blocked by Stage 3C angular-clearance geometry; the Stage 3D LOD bridge does not require it.
- Natural FPS not measured.
- Native IndexedDB concurrency/durability not established; browser evidence is a single real browser session.
- PDF/text preview UI controls were implemented but browser evidence exercised the image preview; model checks cover all attachment hashes.
- Main-app LOD activation, editor/creation UI, Upload, cloud, payments, Upgrade UI, Tauri, enterprise, deployment, publishing.







