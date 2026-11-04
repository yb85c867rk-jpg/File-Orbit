# FileOrbit viewport-edge eligibility — r158

## Identity
| Artifact | r157 baseline | r158 current |
|---|---|---|
| label-overlay.js | `DB10BAB88FB0D9143E6AEF83C004D47EB0A5A4C650C2C7758B4212D6316AFB3B` | `43D7AF083A4871BE7FD983AF88D21CF7909BCD94B09A93A487231C4824073B1C` |
| viewport-label-eligibility.test.mjs | `5F6F7A6FEB371E2391DAB78E16B7D257A7790E49EBD06168C2F6AD695D7A58C1` | `0C03EF92848F3FA19381B8876298ED7A9DB8489CF5AC9FD1AE3F828705D851CF` |
| label-overlay.test.mjs | `C6E26A7C2CEB8BB3EBB3DB1B24C9D7F138D2DABECC6526299997BBB75DBE225B` | unchanged |
| main.mjs / embed-viewer.mjs / index.html | unchanged | unchanged |

## Baseline
- r157 archive preserved: `9E5934D03C4F653A4BBC88F2BB8C8D434BF2816E1F5CAFAE4007AABF8F1A3788`.
- r156 archive preserved: `6728023E4CB2AC87CDD081CDBD283111524498C6E7080FDC1B50ECCE0C0E2171`.
- No Git repository; identity by hashes and archives.

## Reproduced defect
The r157 prefilter used node center plus gap. A file at `(-10, 300)` with radius 12 has a glyph extending 2 px into a 500×400 viewport and a feasible right-side label at x=7, but it was rejected before placement.

Before/after real-browser edge harness:

| Case | Eligible | Created | Edge labels displayed | Distant controls |
|---|---:|---:|---:|---:|
| r157 center+gap | 2 | 2 | 0/4 | excluded |
| r158 glyph intersection | 6 | 6 | 4/4 | excluded |

The four edge labels in the fixed browser check:
- left `x=-10`, right label starts x=7;
- right `x=510`, left label;
- top `y=-10`, below label;
- bottom `y=410`, above label.
The four truly off-screen controls remained absent.

## Fix
- Eligibility now uses projected glyph bounds:
  - include only when any glyph pixel could be visible in the viewport;
  - no label measurement for ineligible nodes;
  - final measured placement still enforces viewport padding, collision, root, and leader rules.
- Applied consistently in update, beginTransition, updateTransition, and completeTransition.
- Preserved viewport-before-budget filtering, folder-context priority, maxLabels 40, and existing layout.

## Regression
- 50-node viewport case still: 50 candidates, 10 eligible, 40 ineligible, 10 created, 10 visible, all eight on-screen filenames.
- Four-edge case: centers just outside, visible glyphs, feasible labels; all four displayed; four distant controls not created.
- Transition begin/complete use the same edge policy.
- Pan/zoom simulation remains covered.

## Evidence
- Before: `evidence/native-r121/r158-edge-before.png`
- After: `evidence/native-r121/r158-edge-after.png`
- Browser audit: `evidence/native-r121/r158-edge-browser.json`
- 50-node before/after: `r157-viewport-before.png`, `r157-viewport-after.png`
- Technical fixture: `r156-after-technical-selected.png`, `r156-after-technical.png`, `r156-after-technical-zoom.png`, `r156-after-technical-narrow.png`

## Tests
- Viewport eligibility: **4/4 PASS** (edge case added).
- Label-overlay: **48/48 PASS**.
- Folder-context: **2/2 PASS**.
- Focused label/main/search/navigation: **72/72 PASS**.
- Full serial suite: p1b-main 69/69; remaining 1,068 tests = 1,067 pass, 1 skip, 0 fail; both exit 0. Aggregate **1,137 tests, 1,136 pass, 1 skip, 0 fail**. The persistent skip is the existing fake IndexedDB concurrency limitation.

## PASS / FAIL / NOT RUN
**PASS**
- Glyph-visible edge eligibility before budget.
- All four edge labels displayed; distant controls excluded.
- 50-node sparse filenames; no off-screen label measurement/creation.
- Transition and normal paths share policy.
- Root/selection/search/collision/leader/opacity and folder priority preserved.
- 300-node, attachments, #E74C3C, icons/badges, stored data unchanged.

**FAIL**
- None observed.

**NOT RUN**
- 300-node technical local embedded browser.
- Actual Android/iOS devices.
- Dedicated hover acceptance.
- Background-click selection-clearing.
- Independent native Save/Open after this change.

## Delivery
Report: `docs/engine/FILEORBIT-VIEWPORT-EDGE-ELIGIBILITY-r158.md`
Archive to be built after final regression.
