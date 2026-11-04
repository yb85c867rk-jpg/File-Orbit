# FileOrbit Stage 3D correction — preview ownership, search redraw, evidence integrity

## Baseline

Original Stage 3D candidate: `fileorbit-stage3d-isolated-lod-r169.zip`
SHA-256: `ABFA457AA5FD531B1A9085C7612C2820AA254838333901FC532748CACDAB226F`
Original archive preserved. This is a separate corrected candidate.

## 1. Preview URL ownership

The bridge is the sole owner of candidate preview blob URLs.

- `bridge.preview(id)` caches one URL per attachment and returns it repeatedly.
- The app no longer revokes preview URLs.
- Repeated preview of the same attachment returns a usable URL.
- A → B → A returns the original usable URL.
- `bridge.dispose()` revokes all remaining URLs and clears the cache; repeated dispose is idempotent.
- After dispose, `fetch(url)` fails and further bridge access throws disposed.

Tests use actual content reads:

- text: exact `텍스트 첨부`;
- image: valid 1×1 PNG, nonzero natural dimensions, 68-byte payload;
- PDF: bytes begin `%PDF-1.7`;
- repeated image and A → B → A;
- unmount/remount resets preview output;
- disposal revokes remaining URLs.

PDF browser *rendering* is not overclaimed; bytes/embed presence are verified separately.

## 2. Search redraw consistency

`bridge.search()` now changes the model and immediately rerenders the graph when an adapter exists. This is the single rendering owner for query changes.

- Reveal big-8: model target and rendered target are big-8.
- Clear query: model target and rendered target immediately become null.
- Change query after reveal: model and rendered target become null immediately; result page resets to 1.
- The app search handler updates result/list UI; it does not perform a second graph render.
- Search result list, pagination, details, and model/render target state are asserted through actual controls.

## 3. Browser evidence integrity

`browser-evidence.mjs` now collects real:

- `Runtime.exceptionThrown`
- console errors
- `Log.entryAdded` error entries
- non-cancelled `Network.loadingFailed`

The JSON `errors` array is populated from these collectors; it is not an initialized empty claim. The final corrected run had **0 collected errors**.

The evidence also exercises:

- repeated image preview and A → B → A;
- text content and PDF byte prefix;
- search → result → clear;
- search → result → changed query;
- immediate `bridge.dispose()` cleanup measurement before app DOM cleanup: hostChildren 0, canvas 0, DOM nodes 0, preview output 0;
- remount state reset: search null, page 1, results 0, empty input, empty preview.

Screenshots: 7 (`01`–`07`, including search-cleared).

## 4. Report totals

Stage 3C report totals corrected to retained-log figure:
**1,235 tests, 1,234 passed, 1 skipped, 0 failed.** Report-only correction; no extra Stage 3C run claimed.

Stage 3D corrected full run:
**1,246 tests, 1,245 passed, 1 skipped, 0 failed.**

Focused corrected tests:
**110 tests, 109 passed, 1 skipped, 0 failed.**
Stage 3D bridge tests: **11/11 PASS**.

## Label limitation

The label-readability limitation remains: the 41-node expanded cluster shows 4 labels, 0 clipped, 0 priority collisions, 11px text; 13 were overlap-suppressed. This is not completed usability validation.

## Changed files

- `analysis/stage3d/bridge.mjs` — rendering owner for search
- `analysis/stage3d/app.mjs` — preview URL owner, mount reset
- `analysis/stage3d/browser-evidence.mjs` — real error collection, repeated preview, search reset/change, immediate cleanup
- `analysis/stage3d/index.html` — favicon suppression for resource-error accounting
- `analysis/stage3d/fixture.mjs` — valid PNG payload
- `tests/engine/persistence/stage3d-lod-bridge.test.mjs` — preview ownership/A-B-A/dispose test
- `docs/engine/FILEORBIT-STAGE-3D-ISOLATED-LOD-BRIDGE.md` — totals/evidence correction
- this report

No normal-app LOD activation, editor expansion, Upload, cloud, payments, Upgrade UI, Tauri, enterprise, deployment, publishing, or OntoMap access.

## PASS / FAIL / NOT RUN

**PASS**
- Repeated same-attachment preview.
- A → B → A preview.
- Text/image/PDF content reads.
- Close/reopen and unmount/remount reset.
- Dispose revokes URLs and is idempotent.
- Search reveal → clear removes model/rendered target immediately.
- Search reveal → query change removes target immediately.
- Actual browser error collectors produce 0 errors.
- Immediate disposal cleanup leaves no canvas/DOM.
- Existing Stage 3D topology/proxy/attachment protections.
- Full free regression.

**FAIL**
- None in executed corrected checks.

**NOT RUN / LIMITATIONS**
- PDF browser rendering fidelity; bytes/embed only.
- Paid 1,000 full V2 rendering remains geometry-blocked; LOD path unaffected.
- FPS not measured.
- Native IndexedDB concurrency/durability not established.
- Label readability remains limited (4 visible of 41).
- Main-app LOD activation/editor/Upload/cloud/payments/Upgrade/Tauri/enterprise/deployment/publishing.

