# FileOrbit viewport-aware label eligibility — r157

## Identity
| Artifact | r156 baseline | r157 current |
|---|---|---|
| label-overlay.js | `1AE87251C89E798C9D8299EF4E660897A7A4666AC8D6152333371D384EAB89CF` | `DB10BAB88FB0D9143E6AEF83C004D47EB0A5A4C650C2C7758B4212D6316AFB3B` |
| viewport-label-eligibility.test.mjs | new | `5F6F7A6FEB371E2391DAB78E16B7D257A7790E49EBD06168C2F6AD695D7A58C1` |
| label-overlay.test.mjs | `B06E1DAE5158015A7274A475C457D648B8EB816D6D3BD3613CA84ABFF978A7B4` | `C6E26A7C2CEB8BB3EBB3DB1B24C9D7F138D2DABECC6526299997BBB75DBE225B` |
| main.mjs | `CBDD2744D933775398EEA3DCF3231A558070AFAD973E26133517214B770C98A5` | unchanged |
| embed-viewer.mjs | `219DC819E4A7D7372E4F35C45EDF98FF86CE83AF6FE7CA68F4F32D9C13B73508` | unchanged |
| index.html | `7F7D2B5A4E01EDED877A27C3C52B63984AB87BF6EF63E46E2A3128E3CC4B2BA2` | unchanged |

## Baseline
- r156 archive preserved: `6728023E4CB2AC87CDD081CDBD283111524498C6E7080FDC1B50ECCE0C0E2171`.
- r155 archive preserved: `B0A1A18D38703411F5790F8F03F6D65A5EF6F93C699B0798B6F5E0D2028618BA`.
- No Git repository; identity by hashes and archives.

## Reproduced cause
The label budget was allocated before any viewport check. With 50 nodes (root, technical, 48 children), first 40 children off-screen and last 8 on-screen:

- Before: `candidateCount=50`, `createdCount=40`, `visibleCount=2`, `viewportSuppressedCount=38`; **none** of `child-40`…`child-47` existed in the DOM.
- After: `candidateCount=50`, `viewportEligibleCount=10`, `viewportIneligibleCount=40`, `createdCount=10`, `visibleCount=10`, `viewportSuppressedCount=0`; all eight on-screen filenames displayed with TXT badges.
- The off-screen entries were removed **before** label creation/measurement; no labels were created or measured for them.
- No viewport-edge labels were rejected when a placement was feasible.

## Fix
- Added geometry-only viewport eligibility before candidate truncation, using projected node center plus `gap` margin. No label measurement is done for ineligible candidates.
- Applied in normal update, beginTransition, updateTransition, and completeTransition.
- Retained-anchor fallback now also checks node eligibility and the final label rectangle against viewport bounds.
- Added diagnostic metrics:
  - `candidateCount`: all view candidates
  - `viewportEligibleCount`
  - `viewportIneligibleCount`
  - `budgetExcludedCount`
  - existing `createdCount`, placement suppression counts.
- Priority order preserved:
  - root/focus/ancestors/selection
  - search results
  - inspected folder’s visible direct children
  - hovered node.
- `maxLabels` remains 40. No layout algorithm change.

## Regression
- 50-node synthetic case: first 40 off-screen, last 8 on-screen/late IDs; asserts actual visible filenames, not only membership.
- All eight on-screen labels display; off-screen labels are absent.
- Edge children at `x=5` and `x=795` display when placement is feasible.
- Pan/zoom simulation moves different children into/out of the viewport and asserts names become/cease eligible; stale labels removed.
- Transition begin/complete use the same filter.
- Existing folder-context, root, selection, search, leader, opacity, collision tests retained.

## Real-browser evidence
A real DOM browser harness ran the 50-node case before (r155 archive) and after (current):

- Before: 40 labels created, 2 visible, 38 viewport-suppressed, none of the 8 on-screen files present.
- After: 10 labels created for 10 eligible nodes, 10 visible, zero viewport-suppressed, all eight filenames visible.

Screenshots: `evidence/native-r121/r157-viewport-before.png`, `r157-viewport-after.png`.
Audit: `evidence/native-r121/r157-viewport-browser.json`.

Technical fixture browser checks after the fix:
- selected technical at root: children labels present within the 40 budget;
- navigation: children labels present;
- camera zoom: placement recomputed;
- narrow: bounded visible subset, no exceptions;
- root protection true.

## Tests
- Viewport eligibility: **3/3 PASS**.
- Label-overlay: **48/48 PASS**.
- Folder-context: **2/2 PASS**.
- Focused label/main/search/navigation: **71/71 PASS**.
- Full serial suite: p1b-main 69/69; remaining 1,067 tests = 1,066 pass, 1 skip, 0 fail; both exit 0. Aggregate **1,136 tests, 1,135 pass, 1 skip, 0 fail**. The persistent skip is the existing fake IndexedDB concurrency limitation.

## PASS / FAIL / NOT RUN
**PASS**
- Viewport eligibility before budget.
- On-screen direct children prioritized over off-screen/unrelated candidates.
- Sparse 50 case: all eight names visible.
- Edge feasibility, pan/zoom simulation, transition completion.
- Root/selection/search/collision/leader/opacity preservation.
- Standalone and embedded share the overlay filter.
- 300-node limits, #E74C3C, icon-free labels, badges, stored data unchanged.

**FAIL**
- None observed.

**NOT RUN**
- 300-node technical local embedded browser.
- Actual Android/iOS devices.
- Dedicated hover acceptance.
- Background-click selection-clearing.
- Independent native Save/Open after this change.

## Evidence
- Before: `evidence/native-r121/r157-viewport-before.png`
- After: `evidence/native-r121/r157-viewport-after.png`
- Browser audit: `evidence/native-r121/r157-viewport-browser.json`
- 50-node fixture description: `evidence/native-r121/r157-fixtures/viewport-50.json`
- Technical before/after: `r156-before-root.png`, `r156-after-technical-selected.png`, `r156-after-technical.png`, `r156-after-technical-zoom.png`, `r156-after-technical-narrow.png`.
