# FileOrbit graph-label improvements — r152

## Baseline identity
- Workspace: `C:\Users\openw\Documents\Projects\visual-directory` (no Git repository).
- Baseline: r151 native desktop archive `review/fileorbit-native-desktop-r151.zip`, SHA-256 `E028738E66AD069DFCE94FF442B8890D0B0F4C7974091974EDD5EC15A12F3649`.
- Previous accepted review archive preserved: r150 `review/fileorbit-pdf-verification-r150.zip`, SHA-256 `926EE9AE123100543C6882E9AD9EE44685F00C1627E5D188EB91C55467278063`.
- No OntoMap files were opened or modified. No paid/enterprise, external Embed hosting, publishing, or deployment work was performed.

## User-reported manual acceptance
The user reports, from manual Chrome verification:

- native Save completed;
- the saved map displayed **300 nodes**;
- native Open File reopened the map;
- the reopened map retained **300 nodes** and file contents;
- no error message occurred.

These are recorded as **USER-REPORTED MANUAL PASS**, not as independently executed acceptance. This revision did not re-run native Save/Open.

## Identity
| Artifact | Baseline r151 | Current r152 |
|---|---|---|
| label-overlay.js | 6452BF2C47807F58A6B1AB8FA9A10AC1C8505BAE8796A1B838DF3C833216B44C | A12ABC88824C7FB00F7CB70418B3E9C4BAC183DBAFF9ADC6C4CE84E4690DBD5C |
| main.mjs | 6F04F2BC72A1622075ED6548551476E19C04A3605F3F47BCBE5B869C12D2E138 | EC531F6787191373B9DC398838ECCB11809C9DCFF4840CF31C395E3028676AF0 |
| embed-viewer.mjs | baseline r151 | 44ABA8C3A9F79ECE56EE0319383ED6A3EFFBF199D08F639FCA252E87A8894A18 |
| index.html | 7F7D2B5A4E01EDED877A27C3C52B63984AB87BF6EF63E46E2A3128E3CC4B2BA2 | 7F7D2B5A4E01EDED877A27C3C52B63984AB87BF6EF63E46E2A3128E3CC4B2BA2 (unchanged) |

No Git commit exists in this workspace; identity is by file hash and preserved archives.

## Changed files
- `src/engine/hypertree/render/label-overlay.js`
- `tests/harness/m5-exploration/main.mjs`
- `tests/harness/m5-exploration/embed-viewer.mjs`
- `tests/engine/render/label-overlay.test.mjs`
- `tests/engine/exploration/main-harness-init-runner.mjs`

Presentation-only changes; no stored map, topology, metadata, attachment, or persistence schema change.

## Implementation
### Labels
- Removed the leading folder/file SVG icon from graph labels for root, folders, and files.
- Removed the icon’s reserved text width. Text now uses the configured label width; the icon wrapper and its margins/gap contribution are gone.
- Folder labels show only the folder name.
- File labels retain filename/extension and show a trailing type badge. Stored classification badges remain; unclassified files derive a badge from their extension (`TXT`, `PDF`, `MD`, `FILE`, etc.).
- Existing accessible labels/titles now include the visible badge; file hit targets, file-name activation, badge activation, folder non-interaction, and selection behavior are retained.
- Toolbar, menu, navigation, and search-result icons are untouched.

### Root protection
- The overlay accepts `rootId`; callers supply the structural root when the scene has no root identity.
- Root label placement is first and is not dropped for overlapping a child node, so the root remains readable at narrow sizes.
- A root exclusion rectangle is built from rendered root geometry: the root marker plus the nearest visible node radius, capped at 96 CSS px, unioned with the measured root label bounds, then padded.
- The same rectangle is used for placement/collision decisions and reported as `rootProtectionRect` for verification. There is no separate invisible hit target; interaction still uses final label DOM bounds.
- Root metrics: `rootProtection`, `rootProtectionRect`, `rootLabelVisible`.

### Selection
- `selectedId` is supplied by the standalone and embedded callers.
- The selected label is marked `data-vd-selected` and gets a bounded fallback placement outside the root protection area if normal adjacent positions are unavailable.
- The existing canvas selection styling is unchanged. Selection remains distinct from red search highlighting.
- Recreated labels do not retain stale selected/temporary state when selection or map changes.

### Density and priority
- Label budget remains bounded at 40 (`maxLabels: 40` in both harnesses).
- Priority order is root first, then focused/ancestors/selected priority IDs, then the canvas-hovered node, then search-result IDs within the budget.
- Hidden labels remain discoverable through search, selection, keyboard navigation, and the details/results UI.
- Search and Clear trigger label-priority refresh without changing the map or dirty state.
- Root protection can suppress lower-priority labels; this is intentional and recorded in metrics.

## Fixtures — exact node counts
| Fixture | Total | Folders | Files | Composition |
|---|---:|---:|---:|---|
| Flat | **300** | 1 | 299 | root + 299 file children |
| Distributed | **300** | 6 | 294 | root + 5 folders + 294 files |
| Mixed | **300** | 38 | 262 | reused r150 deep/wide 300-node map |

Fixture files and SHA-256 values are in `evidence/native-r121/r152-fixtures/manifest.json`.

## Verification
Environment: Windows `10.0.26300.0`; Chromium `156.0.8078.76` (headless for screenshots), local origin `http://127.0.0.1:8099`; before screenshots from the preserved r151 archive served at `http://127.0.0.1:8100`.

### PASS
- Leading graph-label icons: before **40/40 labels had SVG icons**; after **0/40** in standalone screenshots and **0/10** in the local embedded sample.
- Trailing badges remain/added: `TXT`, `PDF`, `MD`; no leading file/folder glyphs.
- Root protection: `rootProtection=true` and `rootLabelVisible=true` at dark/light desktop and narrow for all three fixtures; other visible labels do not overlap the final root protection rectangle.
- Narrow root readability: root label visible at 390×844 emulated viewport.
- Selection: selected node, label, and parent connection remain; selected label visible in all projected checks, marked selected, and placed outside root protection when required.
- Density: only **20/15/19** labels visible from 300 in the three desktop fixtures; a hidden `file-150.txt` was found by search, selected successfully, and its label became visible. Clear search removed highlights and retained selection/label.
- Search highlight preserved: `#E74C3C` fill on the highlighted root folder; clear removed highlight IDs/colors.
- No runtime exceptions in the browser audit.
- Standalone vs local embedded: icon removal and trailing badges are consistent in both; embedded sample reports 10 nodes.
- Themes/layouts: dark and light desktop, and narrow dark after screenshots for each fixture.
- Presentation does not alter node counts: all fixtures report `300 visible / 300 total`; no topology/metadata/attachment changes were made.

### FAIL
- None observed in the executed checks.

### NOT RUN
- Actual phone/tablet devices (Android/iOS); the 390×844 results are **viewport emulation**, not device testing.
- Independent native headed Save/Open after this presentation change; the native result above is **user-reported**, not independently rerun.
- A 300-node local embedded viewer (the embedded check used the shipped 10-node sample; it uses the same overlay).
- Dedicated hover-priority acceptance (the standalone canvas path is wired; a reliable pointer-hit check over overlapping flat nodes was not completed, and the local embedded viewer has no pointer-hover priority path).
- Assistive-technology screen-reader/touch acceptance.
- Firefox/Safari/Edge native acceptance.

## Screenshots
Before/after pairs (dark desktop):
- Flat: [before](../../evidence/native-r121/r152-label-before-flat-dark.png) / [after](../../evidence/native-r121/r152-after-flat-dark.png)
- Distributed: [before](../../evidence/native-r121/r152-label-before-distributed-dark.png) / [after](../../evidence/native-r121/r152-after-distributed-dark.png)
- Mixed: [before](../../evidence/native-r121/r152-label-before-mixed-dark.png) / [after](../../evidence/native-r121/r152-after-mixed-dark.png)

After themes/layouts:
- Flat: [light](../../evidence/native-r121/r152-after-flat-light.png), [narrow](../../evidence/native-r121/r152-after-flat-narrow.png)
- Distributed: [light](../../evidence/native-r121/r152-after-distributed-light.png), [narrow](../../evidence/native-r121/r152-after-distributed-narrow.png)
- Mixed: [light](../../evidence/native-r121/r152-after-mixed-light.png), [narrow](../../evidence/native-r121/r152-after-mixed-narrow.png)
- Hidden-label search: [selected file-150](../../evidence/native-r121/r152-after-flat-hidden-search.png)
- Embedded: [before](../../evidence/native-r121/r152-embed-before.png) / [after](../../evidence/native-r121/r152-embed-after.png)

## Test results

The 69-test `p1b-main` file spawns 69 actual main-entry runners and takes about four minutes; the remaining 1,052 tests were run as the rest of the same serial suite. Both serial parts exited 0.

| Run | Tests | Pass | Skip | Fail |
|---|---:|---:|---:|---:|
| Full suite, `p1b-main` serial part | 69 | 69 | 0 | 0 |
| Full suite, remaining serial part | 1,052 | 1,051 | 1 | 0 |
| **Aggregate** | **1,121** | **1,120** | **1** | **0** |

Focused label/main/search subset: **52/52 PASS** (38 label-overlay tests, 9 actual main-entry init tests, search/highlight tests). The skipped test is the existing fake IndexedDB concurrency limitation, not a label failure.

Logs: `evidence/native-r121/r152-p1b-main.txt` and `evidence/native-r121/r152-full-suite-remainder.txt`. Review archive: `review/fileorbit-graph-labels-r152.zip` with a SHA-256 manifest.
