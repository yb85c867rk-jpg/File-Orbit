# FileOrbit Stage 2B-2 — search pager correction

Status: isolated harness correction. No production source change. Normal application remains free-only at 300 nodes.

Baseline: `fileorbit-stage2b2-renderer-lod-r169.zip`
Baseline SHA-256 verified:
`9D945413755186229305123BB7A03263352DEE654202BD11CEDAF4679E75C981`

## 1. Finding and fix

The model stores the active query at `state.query`. `updatePager()` incorrectly read `state.searchQuery`, which exists only in `context()`, not in `state`.

Effects:
- Previous/Next remained disabled after search.
- Search summary stayed empty.
- Direct `api.search(query, page)` calls masked the UI pager defect.

Correction:
- Stage 2B-2 `analysis/stage2b2/app.mjs` uses `s.query` for both pager disabled states and summary.
- Stage 2B-1 active harness shares the same defect and was corrected:
  - `analysis/stage2b1/app.mjs`
- Both harness pages now show a visibly disabled button state via CSS:
  - `analysis/stage2b2/index.html`
  - `analysis/stage2b1/index.html`
- `state()` in both harness APIs now exposes the documented `query` property consistently.
- Model behavior and search-reset protections are unchanged.

No direct search API call is used for the new UI paging evidence.

## 2. Browser UI regression

Fresh Edge headless run, actual input and button clicks:

1. Load flat-1000.
2. Type “파일” and click Search.
3. Page 1:
   - query `파일`
   - page `1/20`
   - summary `“파일” · 999개 · 1/20 페이지`
   - Previous disabled, Next enabled
   - 50 rendered result buttons
4. Click Next 19 times:
   - page 20
   - summary `“파일” · 999개 · 20/20 페이지`
   - **49 result buttons**
   - Next disabled, Previous enabled
5. Click Previous:
   - page 19
   - 50 results
   - both pager directions enabled
6. Click the last page-19 result:
   - selected `n950`
   - search target `n950`
   - containing cluster `proxy:root:920:40`
   - details contain the full name/path/ID
   - exactly 1 red `#E74C3C` label
7. Clear input and click Search:
   - query empty
   - search target cleared
   - Previous and Next disabled
   - summary empty
   - red labels 0
   - ordinary selection `n950` retained
8. No-match query:
   - total 0
   - page 1/1
   - both pager directions disabled
   - “일치하는 노드가 없습니다.”
9. Changed query:
   - before: page 2
   - after changing to “노드”: page 1
   - summary reflects the new query
   - Previous disabled, Next enabled

Raw UI results: `analysis/stage2b2/evidence/browser-measurements.json`, `uiPaging`.

Screenshots:
`search-ui-page1.png`, `search-ui-page20.png`, `search-ui-page19.png`, `search-ui-target.png`, `search-ui-cleared.png`, `search-ui-no-match.png`, `search-ui-changed-query.png`.

## 3. Model/API versus UI evidence

- **Model/API paging**: existing direct `search()` tests/results remain separately represented in the `search` measurement block.
- **UI paging**: the `uiPaging` block records the actual Search/Next/Previous/result/clear/no-match/changed-query controls. Direct API calls were not used for that block.

## 4. Cleanup evidence

Remount check strengthened:
- `remount(8)` fixed documented repetition count.
- After each `dispose()`, before `host.replaceChildren()`, DOM state was:
  - canvases **0**
  - label overlays **0**
  - label groups **0**
  for all 8 iterations.
- Final state after remount: 1 canvas, 1 overlay, 7 label groups.
- This confirms immediate DOM removal and absence of stale label groups in the tested path. It is not a memory-leak proof.

## 5. Tests

- Stage 2B-2 model/adapter tests: **6/6 PASS**
- Combined Stage 2B-1 + 2B-2 focused tests: **17/17 PASS**, exit 0
- Full free regression: **NOT rerun**
  - No shared production source changed.
  - Retained Stage 2B-1 baseline evidence: 1,186 tests, 1,185 pass, 1 skip, 0 fail.
  - Retained result predates this correction and the additional tests; it does not cover them.

## 6. PASS / FAIL / NOT RUN

**PASS**
- Correct `state.query` contract in both active harnesses.
- Actual Search button enables Next and disables Previous on page 1.
- Actual Next clicks reach page 20 with 49 results and Next disabled.
- Actual Previous returns to page 19 with 50 results.
- Later-page result click reveals scene, selection, details, and red target.
- Search clear removes target red and disables both pager controls.
- No-match behavior.
- Changed query resets to page 1.
- Immediate dispose cleanup at fixed 8 repetitions.
- Focused tests.

**FAIL**
- None in executed focused/UI checks.

**NOT RUN**
- Fresh complete free regression.
- Native PC Chrome/Edge acceptance beyond headless Edge.
- Memory-leak proof.
- Full ordinary-label readability/FPS.
- Production LOD, paid lifecycle, mobile/enterprise/cloud/deployment.

## 7. Preservation

- Accepted free baseline: `E7608F387E5A9676CEF8F908B77241A26469ADCFB5889D00B4795FFDD6ADA441`
- Previous Stage 2B-2 candidate: `9D945413755186229305123BB7A03263352DEE654202BD11CEDAF4679E75C981`
