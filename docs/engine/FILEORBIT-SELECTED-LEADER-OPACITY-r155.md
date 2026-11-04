# FileOrbit selected-leader opacity correction — r155

## Identity
| Artifact | r154 baseline | r155 current |
|---|---|---|
| label-overlay.js | `D04C29344683370AE64A549E47E307940725822F49BF21C2E58FB128746B3A3C` | `1AE87251C89E798C9D8299EF4E660897A7A4666AC8D6152333371D384EAB89CF` |
| label-overlay.test.mjs | `DD0799CA034438E33B911658D000071A3AC92EBDC849656562770065DC909598` | `B06E1DAE5158015A7274A475C457D648B8EB816D6D3BD3613CA84ABFF978A7B4` |
| main.mjs | `984C8F2A678036E1446705BD599EEEAACEE2CB22BAC88694C39A74778C399983` | unchanged |
| embed-viewer.mjs | `44ABA8C3A9F79ECE56EE0319383ED6A3EFFBF199D08F639FCA252E87A8894A18` | unchanged |
| index.html | `7F7D2B5A4E01EDED877A27C3C52B63984AB87BF6EF63E46E2A3128E3CC4B2BA2` | unchanged |

## Baseline
- r154 archive preserved: `F2C7F5B3806246B8CA77346C63EE36C60AB832686F98393508E0E789B00231FB`.
- r153 archive preserved: `E9E843859815E4FB67175D01DA5A7EF499F853844594E231DD86A3D5375E9F02`.
- No Git repository; identity by hashes and archives.

## Reproduced defect
A selected label at opacity 0 still produced a selected leader at opacity 0.7. `selectedLabelVisible` reported true because it checked layout presence only. The floating leader remained visible through normal updates and transition completion.

## Fix
- Added `effectiveNodeOpacity(node)` with 0..1 normalization (undefined → 1).
- `addSelectedLeader` now:
  - clears old owned leaders first;
  - installs no leader when the node/label is absent, suppressed, or fully transparent;
  - sets leader opacity to `0.7 × effectiveNodeOpacity`.
- Normal update, beginTransition, updateTransition, and completeTransition pass the selected node’s effective opacity.
- Leader geometry is recreated on transition updates/completion using current displayed position and opacity.
- `selectedLabelVisible` is now actual visibility: final label rectangle plus effective opacity > 0.
- Added `selectedLabelOpacity` metrics for normal and transition frames.
- At-most-one leader and DOM-collection cleanup behavior remain unchanged.

## Regressions
- Opacity 1 → 0.5 → 0 → 1: leader count/opacity and selected visibility metrics.
- Transition opacity 1 → 0.5 → 0: leader opacity 0.7 → 0.35 → absent; metrics false at 0.
- Selection cleared during transition: leader removed; selected visibility null.
- Suppressed selected label in a tiny viewport: no leader, selected visibility false.
- Existing 44 label tests continue to pass; label-overlay now **48/48**.

## Real browser evidence
A real DOM overlay harness (not Array fakes) ran in Chromium:

| Step | Before leader | Before opacity | Before metric | After leader | After opacity | After metric |
|---|---:|---:|---|---:|---:|---|
| opacity 1 | 1 | 0.7 | true | 1 | 0.7 | true |
| opacity 0.5 | 1 | 0.7 | true | 1 | 0.35 | true |
| opacity 0 | 1 | 0.7 | true | 0 | — | false |
| opacity 1 again | 1 | 0.7 | true | 1 | 0.7 | true |
| begin 1 | 1 | 0.7 | true | 1 | 0.7 | true |
| transition 0.5 | 1 | 0.7 | true | 1 | 0.35 | true |
| transition 0 | 1 | 0.7 | true | 0 | — | false |
| complete 0 | 1 | 0.7 | true | 0 | — | false |

Before/after screenshots show the floating line at opacity 0 before, and no line after.

Root protection remained true in every state.

## Tests
- Label-overlay: **48/48 PASS** (four new opacity/selection regressions).
- Focused label/main/search/navigation subset: PASS (66/66 in the focused run).
- Full serial suite: p1b-main 69/69; remaining 1,062 tests = 1,061 pass, 1 skip, 0 fail; both exit 0. Aggregate **1,131 tests, 1,130 pass, 1 skip, 0 fail**. The first remainder attempt had one existing copy-map timing failure; the isolated rerun and full remainder rerun passed.
- Existing fake IndexedDB skip remains.

## PASS / FAIL / NOT RUN
**PASS**
- No leader for absent/suppressed/opacity-0 selected labels.
- Leader opacity synchronized during partial fading.
- Normal/begin/update/complete consistency.
- Selection visibility metrics include opacity.
- At-most-one/cleanup behavior preserved.
- Real browser before/after.
- 300 nodes, attachment limits, #E74C3C, icon removal, badges preserved.

**FAIL**
- None observed.

**NOT RUN**
- Background-click selection-clearing interaction remains NOT RUN (not demonstrated in this pass).
- Actual Android/iOS devices.
- 300-node local embedded viewer.
- Dedicated hover acceptance.
- Screen-reader/touch.
- Independent native Save/Open after this change.

## Evidence
- Before opacity 0 (floating line): `evidence/native-r121/r155-opacity-before.png`
- After opacity 0 (no line): `evidence/native-r121/r155-opacity-browser.png`
- Before/after audit: `evidence/native-r121/r155-opacity-before.json`, `evidence/native-r121/r155-opacity-browser.json`
