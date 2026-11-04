# FileOrbit graph-label corrections — r153

## Identity
| Artifact | r152 baseline | r153 current |
|---|---|---|
| label-overlay.js | `A12ABC88824C7FB00F7CB70418B3E9C4BAC183DBAFF9ADC6C4CE84E4690DBD5C` | `A890556751E4004530FFB408D9B3ECA0E65E4BAF3BCDD33820527271B43A09C4` |
| main.mjs | `EC531F6787191373B9DC398838ECCB11809C9DCFF4840CF31C395E3028676AF0` | `984C8F2A678036E1446705BD599EEEAACEE2CB22BAC88694C39A74778C399983` |
| embed-viewer.mjs | `44ABA8C3A9F79ECE56EE0319383ED6A3EFFBF199D08F639FCA252E87A8894A18` | `44ABA8C3A9F79ECE56EE0319383ED6A3EFFBF199D08F639FCA252E87A8894A18` (unchanged) |
| label-overlay.test.mjs | r152 baseline | `12926D897CD540DC8083E2F8825733D96436304FDB6E7B38681762DA4319A020` |
| index.html | `7F7D2B5A4E01EDED877A27C3C52B63984AB87BF6EF63E46E2A3128E3CC4B2BA2` | unchanged |

## Baseline
- r152 review archive: `review/fileorbit-graph-labels-r152.zip`, SHA-256 `111A4E134A270D3AA3A3424BCC4418CC1DB832BF7AC500D8BC90D2AC54CAABDF` (defective baseline preserved).
- r151 archive preserved: `E028738E66AD069DFCE94FF442B8890D0B0F4C7974091974EDD5EC15A12F3649`.
- r150 PDF archive preserved: `926EE9AE123100543C6882E9AD9EE44685F00C1627E5D188EB91C55467278063`.
- No Git repository; identities are file hashes and archives.

## Reproduced defects
1. **Transition completion lost protection identity.** `main.mjs` completed transitions without `rootId`/`selectedId`; the overlay had no retained root identity, and its no-blink retained-anchor fallback could restore a label inside the final root exclusion. Transition metrics also hardcoded root protection as false.
2. **Selected fallback ignored collisions.** The selected-label fallback checked viewport and root protection, but not occupied labels or other node glyphs. A selected label could occupy exactly the same rectangle as another visible label. `data-vd-selected` alone was not enough to make the selection visible.

## Fixes
### Transition identity and protection
- `main.mjs` now forwards `rootId` and `selectedId` through normal `update`, `beginTransition`, `updateTransition`, and `completeTransition`.
- The overlay stores transition root/selection identity and accepts explicit overrides at any stage.
- `completeTransition` uses the effective root/selection for candidate ordering and placement.
- The retained-anchor no-blink fallback now rejects any candidate that intersects the final root protection rectangle, an already displayed label, a target-visible label, or another node glyph. It is a no-blink convenience, never a protection bypass.
- Transition groups are re-synchronized for `data-vd-selected`; stale selection markers are removed from reused groups, and the current selected group is marked.
- `transitionMetrics` reports actual `rootProtection`, `rootProtectionRect`, `rootLabelVisible`, and `selectedLabelVisible` instead of hardcoded false values.
- Standalone call sites audited. The local embedded viewer has no begin/complete transition path; its normal `update` already forwards root/selection.

### Selected fallback collisions
- All normal and fallback candidate placements now use one collision policy: viewport, occupied labels with overlap padding, root protection, and other node glyphs.
- Selected labels are promoted in candidate order before unranked labels, so lower-priority labels are placed later and yield to the selection.
- Fallback offsets try collision-free adjacent positions first, then bounded further positions. A fallback that cannot satisfy all rules is not installed.
- If the selected label is displaced beyond adjacency, a visible leader line (non-interactive, indigo selection color) connects its node to the label. The final DOM label remains the hit target; no invisible old position is used.
- `data-vd-selected` is accompanied by actual final geometry/collision checks and, when displaced, the leader.

## Regression tests
- Root override with a scene that has **no rootId**, explicit structural root, and nearby child: final displayed rectangles, not just metrics, are checked against root protection and each other.
- Retained-anchor transition fallback: final root region remains clear.
- Dense selected case with competing labels and node obstacles: selected visible, no displayed-label overlaps, no root intrusion.
- Transition group reuse: selection marker moves from A to B, stale marker removed.
- Existing label, transition, search/highlight, and main tests retained.

## Browser verification
Actual headless Chromium 156 navigation: distributed fixture → search result folder `North` → transition completion; then file selection, resize, search/Clear, and selection change.

Observed:
- after transition: **rootProtection=true**, root label visible, selectedLabelVisible=true, **0** root-area label overlaps, **0** visible-label overlaps;
- file selection: selected label visible, no overlaps;
- narrow 390×844: root protection true, selected label visible, **1** leader (displaced selection);
- search/Clear: `#E74C3C` highlights applied and cleared; no runtime errors.
- Fixtures remained 300/300.

## Status
PASS: regression tests, focused label/main/search/navigation tests, actual transition/narrow/selection browser checks.
FAIL: none observed.
NOT RUN: actual Android/iOS devices; 300-node local embedded viewer; dedicated hover acceptance; screen-reader/touch; independent native Save/Open after this change (user-reported native acceptance remains separate).

## Test results

The 69-test p1b-main file spawns 69 actual main-entry runners (about four minutes); the remaining 1,056 tests were run as the rest of the same serial file set. Both exited 0.

| Run | Tests | Pass | Skip | Fail |
|---|---:|---:|---:|---:|
| p1b-main serial part | 69 | 69 | 0 | 0 |
| Remaining serial part | 1,056 | 1,055 | 1 | 0 |
| **Aggregate** | **1,125** | **1,124** | **1** | **0** |

Focused label/main/search/navigation subset: **60/60 PASS**. The label-overlay file is **42/42**, including the four new regressions. The one skip is the existing fake IndexedDB concurrency limitation.

## Evidence
Before/after:
- Transition completion: [before](../../evidence/native-r121/r153-before-transition-complete.png) / [after](../../evidence/native-r121/r153-transition-complete.png). Defective r152 metrics: rootProtection=false, rootProtectionRect=null. Fixed: rootProtection=true, root label visible, no root-area label overlaps.
- Selected file after transition: [before](../../evidence/native-r121/r153-before-selected.png) / [after](../../evidence/native-r121/r153-selected-after-transition.png).
- Narrow transition: [before](../../evidence/native-r121/r153-before-narrow.png) / [after](../../evidence/native-r121/r153-transition-narrow.png). Fixed narrow shows the selected leader and root protection.
- Current fixtures: [flat dark](../../evidence/native-r121/r153-after-flat-dark.png), [distributed dark](../../evidence/native-r121/r153-after-distributed-dark.png), [mixed dark](../../evidence/native-r121/r153-after-mixed-dark.png); light/narrow variants use the same r153-after prefix.
- Exact audit: evidence/native-r121/r153-transition-audit.json; defective before audit: evidence/native-r121/r153-before-transition-audit.json.
- Call-site audit: evidence/native-r121/r153-callsite-audit.txt.

## Data preservation
- All three fixtures remained 300 visible / 300 total.
- Label-only presentation did not change topology, stored metadata, attachments, document dirty state, or saved bytes. The browser audit's import was already dirty before/after (dataRevision 0); selection/search/resize did not save or write.
- 300-node and attachment limits untouched.
