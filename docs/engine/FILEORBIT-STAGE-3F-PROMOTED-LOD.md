# FileOrbit Stage 3F — promoted LOD modules without application activation

## Baseline

Reviewed Stage 3E corrected candidate:
`fileorbit-stage3e-lod-readability-corrected-r169.zip`
SHA-256: `639B7AB0200818BF095D485BC332FBEE5DCC18C6CB34E8A82C4B9535C2D0D818`

Baseline preserved. Stage 3F is a separate candidate.

## Report-fact corrections

Stage 3E corrected report full total is corrected to retained-log figure
**1,253 tests, 1,252 passed, 1 skipped, 0 failed** (report-only; no extra Stage 3E run claimed).

Cleanup ownership is corrected explicitly:

- Immediately after `bridge.dispose()`: graph host children 0, canvas 0, graph DOM nodes 0; **previewOutput = 2** because the app-owned preview DOM is not bridge-owned.
- After full harness unmount: graph 0/0/0 and previewOutput 0.
- Bridge owns canvas/labels/listeners, attachment registry, and preview URLs. The app owns the preview DOM elements.

## Module boundaries

Promoted production modules under `src/engine/hypertree/lod/`:

| Module | Responsibility | Dependencies |
|---|---|---|
| `presentation-model.js` | document index, bounded folder/cluster/overview paging, history, search/selection | none |
| `render-adapter.js` | host-dimension-aware projection, canvas surface, labels, hit testing, direct target rendering | `src/.../render/*`, `src/.../interaction/hit-test.js` |
| `saved-document-bridge.js` | trusted admission → attachment adoption → model/adapter lifecycle | `src/.../persistence/runtime.js`, the two LOD modules |

No production LOD module imports `analysis/`, test helpers, fixtures, evidence scripts, or paid test-context creation.

Compatibility wrappers retain old import paths:

- `analysis/stage2b1/model.mjs`
- `analysis/stage2b2/model.mjs`
- `analysis/stage2b2/adapter.mjs`
- `analysis/stage3d/bridge.mjs`

Each wrapper re-exports the single production implementation. Stage 2B-1 and Stage 2B-2 applications now import production modules directly. Isolated fixtures, paid test-context construction, evidence collection, and experimental UI controls remain under `analysis/`, `tests/helpers/`, and harness files.

Default `clusterPageSize = clusterSize` preserves legacy Stage 2B behavior; the Stage 3D/3E bridge explicitly uses 8 members/page.

## Ownership and teardown

| Owner | Resources | Teardown |
|---|---|---|
| Document/load record | tree, IDs, metadata, attachment refs | not mutated by presentation; held by harness |
| Bridge | adopted attachment registry | `dispose()` clears registry |
| Adapter | canvas, label overlay, listeners, hit snapshot | `dispose()` destroys adapter |
| Bridge | preview blob URLs | `dispose()` revokes all and clears cache |
| App | preview `<img>/<iframe>/<embed>` and labels | full harness `unmount()` |
| Harness | controls, search/page state, loaded record | remount resets controls; unmount clears graph and preview DOM |

Browser measurements confirm both stages:

- `cleanupImmediate`: graph 0/0/0, previewOutput 2, bridge disposed true.
- `unmountCleanup`: graph 0/0/0, previewOutput 0.

## Preserved behavior

- Trusted admission before attachment adoption/presentation.
- Free 300; explicit internal paid 1,000.
- Complete tree/IDs separate from proxies; no proxy persistence.
- Bounded paging for folders, expanded clusters, proxy overviews.
- Complete Back restoration and later-page search reveal.
- Direct graph/label/proxy/file interaction.
- Actual host projection/canvas/label dimensions.
- Preview URL ownership, idempotent disposal, error collection.
- Exact topology/metadata/attachment hashes and re-save/reload integrity.
- Stage 3B protections, limits, colors, formats, database version.

## Tests

- Focused Stage 3F/LOD/persistence suite: **136 tests, 135 pass, 1 skip, 0 fail**, exit 0
  - Production-module boundary test: 1/1 PASS
  - Stage 2B-1/2B-2 compatibility tests: 33/33 PASS
  - Stage 3D bridge and Stage 3E paging tests: 18/18 PASS
  - Skip: pre-existing fake-IndexedDB overlapping-readwrite case; native IndexedDB concurrency/durability NOT RUN.
- `p1b-main`: **69/69 PASS**, exit 0
- Complete free regression: **1,254 tests, 1,253 pass, 1 skip, 0 fail**, exit 0
  - Remaining: 1,185 tests, 1,184 pass, 1 skip

Browser evidence: 11 screenshots, 0 collected page errors.

## Browser evidence

Promoted harness, real Edge, repository-loaded 1,000-node document:

- Page 2 cluster folder entry/Back restores page 2/5.
- Ordinary 40-child folder page 1/5, Next page 2/5.
- Direct graph folder/proxy/file and label selection.
- Search later-page reveal, clear/change.
- Repeated preview/A-B-A/text/image/PDF bytes.
- Actual host 978/658/402px at 1600/1280/1024 viewports.
- Label visibility 9/9, 9/9, 5/9; narrow-host overlap remains.
- Errors 0; cleanup and unmount values above.

11 screenshots and `browser-evidence.json` under `analysis/stage3d/`.

## Changed files

- `src/engine/hypertree/lod/presentation-model.js` (promoted)
- `src/engine/hypertree/lod/render-adapter.js` (promoted)
- `src/engine/hypertree/lod/saved-document-bridge.js` (promoted)
- compatibility wrappers listed above
- Stage 2B-1/2B-2/3D harness imports updated
- `tests/engine/layout/stage3f-lod-modules.test.mjs`
- `tests/engine/exploration/lod-color-consistency.test.mjs` reads production adapter
- `docs/engine/FILEORBIT-STAGE-3F-PROMOTED-LOD.md`
- Stage 3E correction report totals/cleanup fact correction

No main.mjs paid admission or LOD activation; no editor expansion; no commercial policy change.

## PASS / FAIL / NOT RUN

**PASS**
- Production modules contain the single LOD model/adapter/bridge implementation.
- No production LOD dependency on analysis/tests.
- Compatibility wrappers preserve prior import paths and identity.
- Stage 2B-1 and 2B-2 tests pass against promoted model/adapter.
- Stage 3D/3E tests pass through the promoted bridge.
- All five fixture shapes at 300/1,000 with every-ID reveal.
- Paging, history, search, direct interaction and preview behavior retained.
- Graph cleanup vs app preview DOM ownership verified.
- Browser errors 0; full regression PASS.

**FAIL**
- None in executed focused/full/browser checks.

**NOT RUN / LIMITATIONS**
- 1024px label overlap remains: 5/9 visible; 4 suppressed.
- PDF rendering fidelity; bytes/embed only.
- Paid 1,000 V2 geometry limit; LOD path unaffected.
- FPS not measured.
- Native IndexedDB concurrency/durability not established.
- Main-app LOD activation/editor/Upload/cloud/payments/Upgrade/Tauri/enterprise/deployment/publishing.



