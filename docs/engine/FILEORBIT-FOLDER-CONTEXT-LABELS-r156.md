# FileOrbit folder-context label priority — r156

## Identity
| Artifact | r155 baseline | r156 current |
|---|---|---|
| label-priority.js | prior r155 | `2DF50529D802C7BC30DD042A356F661000E38CF7B2C3F684FD612D4FBA73D79F` |
| exploration/index.js | prior r155 | `EE7988BE65DBF53CDC5F4FBE7BDB24C766B62B61C8DBDAFD0AA5C09D6B99565C` |
| main.mjs | `984C8F2A678036E1446705BD599EEEAACEE2CB22BAC88694C39A74778C399983` | `CBDD2744D933775398EEA3DCF3231A558070AFAD973E26133517214B770C98A5` |
| embed-viewer.mjs | `44ABA8C3A9F79ECE56EE0319383ED6A3EFFBF199D08F639FCA252E87A8894A18` | `219DC819E4A7D7372E4F35C45EDF98FF86CE83AF6FE7CA68F4F32D9C13B73508` |
| folder-context-priority.test.mjs | new | `923AD766C877A08703633BE945FEB4E5BDC3295777D1216CF01DC13CF4A9F2E5` |
| label-overlay.test.mjs | `B06E1DAE...78A7B4` | unchanged |
| index.html | `7F7D2B5A...4B2BA2` | unchanged |

## Baseline
- r155 archive preserved: `B0A1A18D38703411F5790F8F03F6D65A5EF6F93C699B0798B6F5E0D2028618BA`.
- r154 archive preserved: `F2C7F5B3806246B8CA77346C63EE36C60AB832686F98393508E0E789B00231FB`.
- No Git repository; identity by hashes and archives.

## Reproduced cause
The supplied observation reproduces as **candidate-budget exclusion before placement**, not a viewport exclusion:

- Root view of the new 300-node fixture: `candidateCount=300`, `createdCount=40`, `visibleCount=11`; technical child labels are absent.
- Diagnostics on that root frame: `overlapSuppressedCount=3`, `nodeObstacleSuppressedCount=26`, `viewportSuppressedCount=0`.
- After making technical the selected folder while retaining the root view: still `candidateCount=300`, `createdCount=40`, and now six of the eight technical child labels are present. This is the same 40-label truncation point; the child IDs were previously outside the selected candidate set.
- After navigating into technical: `candidateCount=15`, all 15 labels are candidates and technical children are displayed. This is not the missing-label state.
- A delayed re-read after 1.2s was identical, so the root-view absence was not transition staleness.

The limiting mechanism is candidate truncation, with ordinary collision/node suppression inside the remaining created set. Viewport exclusion was zero.

## Fix
- Added `folderContextLabelPriorityIds` (visible direct children of the inspected folder, stable tree order).
- Standalone priority order now:
  - folder inspection/ancestors/root/selection (existing);
  - search-result IDs;
  - visible direct children of the inspected folder;
  - hovered node.
- Inspected folder resolution:
  - selected visible folder, otherwise
  - current exploration focus.
  - Camera zoom alone does not redefine the folder; it recomputes placement against the current frame.
- Transition label input uses the same resolver for the target view, so refresh is consistent through transition completion.
- Local embedded viewer uses the same helper and resolver.
- `maxLabels` remains 40. No global limit increase; existing collision rules remain.

## Fixture
`evidence/native-r121/r156-fixtures/technical-late-300.orbit`:
- 300 nodes total.
- root + 5 unrelated branches (57 files each = 285 unrelated nodes) + `technical` + 8 child files.
- technical is a late root child, after every unrelated branch in traversal order.
- technical child IDs are `technical-00`…`technical-07`; all eight labels fit when prioritized in the sparse case.
- Manifest: `evidence/native-r121/r156-fixtures/manifest.json`.

## Verification
**PASS**
- Unit helper: visible direct children returned in stable tree order; hidden child filtered.
- Fixture budget test: technical children are present with 40 labels created while unrelated nodes exhaust the budget.
- Actual browser root selection (technical selected, focus root): six of eight technical labels displayed, all eight created, root protection active.
- Actual browser navigation into technical: technical child labels displayed; selected folder label visible at narrow.
- Actual camera zoom after navigation: placement recomputed, four visible child labels, root protection active.
- Search/Clear, root protection, selected leader/opacity behavior, and existing flat/distributed/mixed screenshots remain valid.
- No viewport exclusion in the reproduced root frame.
- 300 nodes and existing limits unchanged.

**FAIL**
- None observed.

**NOT RUN**
- Actual 300-node technical local embedded browser (the embedded policy uses the same helper; existing embedded sample only).
- Actual Android/iOS devices.
- Dedicated hover acceptance.
- Background-click selection-clearing remains separately NOT RUN.
- Independent native Save/Open after this change.

## Evidence
- Before root context (technical children absent): `evidence/native-r121/r156-before-root.png`
- After selecting technical at root: `evidence/native-r121/r156-after-technical-selected.png`
- After navigating into technical: `evidence/native-r121/r156-after-technical.png`
- After camera zoom: `evidence/native-r121/r156-after-technical-zoom.png`
- Narrow: `evidence/native-r121/r156-after-technical-narrow.png`
- Audit: `evidence/native-r121/r156-after-technical.json`; before audit: `evidence/native-r121/r156-before-technical.json`.

## Tests
- Folder-context unit/integration: **2/2 PASS**.
- Label-overlay: **48/48 PASS**.
- Focused label/main/search/navigation: **68/68 PASS**.
- Full serial suite: p1b-main 69/69; remaining 1,064 tests = 1,063 pass, 1 skip, 0 fail; both exit 0. Aggregate **1,133 tests, 1,132 pass, 1 skip, 0 fail**. The persistent skip is the existing fake IndexedDB concurrency limitation.
