# FileOrbit graph-label corrections — r154

## Identity
| Artifact | r153 baseline | r154 current |
|---|---|---|
| label-overlay.js | `A890556751E4004530FFB408D9B3ECA0E65E4BAF3BCDD33820527271B43A09C4` | `D04C29344683370AE64A549E47E307940725822F49BF21C2E58FB128746B3A3C` |
| main.mjs | `984C8F2A678036E1446705BD599EEEAACEE2CB22BAC88694C39A74778C399983` | unchanged |
| embed-viewer.mjs | `44ABA8C3A9F79ECE56EE0319383ED6A3EFFBF199D08F639FCA252E87A8894A18` | unchanged |
| label-overlay.test.mjs | `12926D897CD540DC8083E2F8825733D96436304FDB6E7B38681762DA4319A020` | `DD0799CA034438E33B911658D000071A3AC92EBDC849656562770065DC909598` |
| index.html | `7F7D2B5A4E01EDED877A27C3C52B63984AB87BF6EF63E46E2A3128E3CC4B2BA2` | unchanged |

## Baseline
- r153 archive preserved: `E9E843859815E4FB67175D01DA5A7EF499F853844594E231DD86A3D5375E9F02`.
- r152 defective archive preserved: `111A4E134A270D3AA3A3424BCC4418CC1DB832BF7AC500D8BC90D2AC54CAABDF`.
- r151/r150 archives preserved.
- No Git repository; identity by hashes and archives.

## Reproduced defects
1. **Selected candidate ordering.** All call sites passed `(snapshot, priorityIds, snapshot.rootId, selectedId)` while `orderCandidates` accepted only `(snapshot, priorityIds, selectedId)`. Root identity was therefore passed as selected identity and the actual selected ID was ignored. With `maxLabels=2` and nodes root/A/B, selected B could lose its slot to A.
2. **Leader cleanup on real DOM.** `clearSelectedLeaders` returned early unless `container.children` was an Array. A real DOM `HTMLCollection` is not an Array, so stale leaders were not removed. Array-backed test fakes did not cover this.

## Fixes
### Candidate ordering
- Signature remains `orderCandidates(snapshot, priorityIds = [], selectedId = null)`.
- Every call now passes `selectedId` as the third argument. Root identity is read from `snapshot.rootId`.
- Selected IDs are ranked ahead of unranked labels; root remains first.
- Added update, beginTransition, and completeTransition regressions with `maxLabels=2`, root/A/B, no priority IDs, selected B. They assert B is displayed, A is not, and B is collision-free.

### Leader cleanup and synchronization
- Added collection normalization supporting Array, iterable `HTMLCollection`/`NodeList`, and indexed array-like collections.
- Cleanup removes only elements with the owned `data-vd-selected-leader` marker; unrelated host/container children remain.
- `addSelectedLeader` clears old owned leaders before adding, so at most one current leader exists. No leader is added for absent, hidden, or adjacent selections.
- `updateTransition` now clears and recreates the leader from current displayed geometry; `completeTransition`, `beginTransition`, and normal `update` follow the same rule.
- Cancel/destroy remove the overlay element; map replacement and selection changes rebuild or clear leaders.

## Browser verification
Actual headless Chromium 156:

- Distributed fixture: import → folder North transition → file selection → narrow resize → selection change → root transition → flat replacement → resize → search/Clear.
- Leader counts observed: `0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0` at those stages — never more than one, and no stale line after transition/root replacement/map replacement.
- Root protection stayed true after transition and resize; selectedLabelVisible true.
- Narrow selected leader count 1; wide adjacent selection count 0.
- No runtime exceptions.
- Search/Clear preserved `#E74C3C` behavior.

Explicit background-click clear-selection did not change `selectedId` through the automated input path; this browser step is NOT RUN. Selection-null leader cleanup is covered by the non-Array DOM-like regression and by completing transitions with `selectedId:null`.

## Tests
- Label-overlay: **44/44 PASS** (two new regressions).
- Focused main/search/navigation checks: PASS.
- Full serial suite: p1b-main 69/69; remaining 1,058 tests = 1,057 pass, 1 skip, 0 fail; both exit 0.
- Aggregate: **1,127 tests, 1,126 pass, 1 skip, 0 fail**.

## PASS / FAIL / NOT RUN
**PASS**
- Signature/call-site alignment; tight-budget selected slot in update/begin/complete.
- Real DOM-like leader cleanup; at most one leader; no stale lines after transition, selection changes, resize, map replacement.
- Root protection/selected visibility preserved.
- Focused and full regression.
- `#E74C3C`, 300-node limits, selected styling.

**FAIL**
- None observed.

**NOT RUN**
- Explicit background-click clear-selection in browser automation (input path did not alter selection).
- Actual Android/iOS devices.
- 300-node local embedded viewer.
- Dedicated hover acceptance.
- Screen-reader/touch.
- Independent native Save/Open after this change.

## Evidence
Before/after:
- Transition: [before](../../evidence/native-r121/r153-before-transition-complete.png) / [after](../../evidence/native-r121/r154-transition-complete.png)
- Selected after transition: [before](../../evidence/native-r121/r153-before-selected.png) / [after](../../evidence/native-r121/r154-selected-after-transition.png)
- Narrow transition: [before](../../evidence/native-r121/r153-before-narrow.png) / [after](../../evidence/native-r121/r154-transition-narrow.png)
- Leader cleanup end state: [r154](../../evidence/native-r121/r154-leader-cleanup.png)
- Current fixtures: [flat](../../evidence/native-r121/r153-after-flat-dark.png), [distributed](../../evidence/native-r121/r153-after-distributed-dark.png), [mixed](../../evidence/native-r121/r153-after-mixed-dark.png)
- Audits: [transition](../../evidence/native-r121/r154-transition-audit.json), [leader cleanup](../../evidence/native-r121/r154-leader-cleanup.json)
- Callsite audit: [r153](../../evidence/native-r121/r153-callsite-audit.txt)
