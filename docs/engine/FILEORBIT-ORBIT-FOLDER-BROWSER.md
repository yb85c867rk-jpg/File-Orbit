# FileOrbit — Orbit Folder browser + search/PDF color correction

## Baseline and isolation

Latest reviewed candidate used: `fileorbit-stage2b2-pager-correction-r169.zip`
SHA-256 verified:
`3B7DC3896BBE5BC6F242AA66181C546A88C9BC7F8667EF35DC59309BF712D7E2`

Stage 3A has passed review within its defined scope and is integrated in this combined candidate. This work uses the reviewed Stage 2B-2 pager-correction baseline plus reviewed Stage 3A. Accepted free baseline and previous archives are preserved.

The Orbit Folder browser is separate from paid folder Upload. No normal-app LOD activation, paid lifecycle, accounts, cloud, deployment, or publishing was added.

## Orbit Folder behavior

Open Orbit → Orbit Folder now opens an application modal:

- Connected authorized folder: browse it directly.
- Otherwise: clear **Choose Folder** state.
- Native directory picker obtains only the directory handle.
- Modal lists subfolders and `.orbit` files together; unrelated files are hidden.
- Current folder name, breadcrumb, Parent, Refresh, Choose Another Folder, Connect This Folder, Open, Cancel.
- Folder rows navigate; file rows select; Open is explicit. Double-click file also opens.
- Connect is explicit; browsing never connects or replaces the current map.
- Open routes through the existing `openOrbitEntry`/`importBackupFile` protected pipeline.
- Open Orbit → Orbit File remains the direct native file flow.
- Cancel at the modal/native picker preserves the current map and connection.
- Directory permission failures and stale listing requests are fail-closed.
- No access is implied above the authorized directory boundary.

Native picker limitation: `showDirectoryPicker()` is used only for directory authorization. No attempt is made to make it show files. Browser evidence uses a stubbed filesystem picker/handle tree; native OS acceptance is **NOT RUN**.

## UI evidence

Real Edge headless, actual DOM controls. Screenshots in `evidence/orbit-folder/`:

- `01-open-initial.png`: Choose Folder state.
- `02-root-contents.png`: folders + `.orbit` file, unrelated file absent.
- `03-projects.png`: nested folder navigation.
- `04-nested.png`: deeper folder.
- `05-connected-sidebar.png`: explicit Connect; sidebar lists `team.orbit`; current map unchanged.
- `06-reopened-connected.png`: connected folder reopened in modal.
- `07-picker-cancel.png`: native picker cancel keeps current folder and map.
- `08-denied.png`: permission denial is explicit and leaves current state intact.
- `09-file-selected.png`: file selection enables Open.
- `10-opened-document.png`: existing document-open pipeline.
- `11-unsaved-cancel.png`: Save/Discard/Cancel prompt; Cancel preserves map and dirty state.
- `12-search-path.png`: blue folder outlines, blue path edge, stronger active outline.
- `13-pdf-search.png`: PDF preview open; red filename/badge.
- `13b-pdf-after-preview.png`: PDF identification survives closing preview.
- `14-search-cleared.png`: stale highlighting removed; PDF identification remains.
- `15-light-pdf.png`: light-theme PDF red.
- `16-small-viewport.png`: 800×600 containment.

Raw results: `evidence/orbit-folder/ui-evidence.json`.

Key results:
- root rows: `Empty/Projects/root.orbit`; `notes.txt` absent.
- Projects breadcrumb: `Orbit Root › Projects`.
- Connect status: `Connected Projects. The current map was not changed.`
- sidebar Refresh: `Projects`, `team.orbit`, `●` current marker.
- file Open: document `team.orbit`, status `Opened team.orbit.`
- unsaved Cancel: `team.orbit`, dirty true, modal closed.
- native picker cancel/denial statuses preserve Projects.
- 800×600 overlay contained; focus starts on Choose, Escape restores `#open-orbit-action`.

### Stubbed picker versus native acceptance

`window.showDirectoryPicker` and directory/file handles were deterministic stubs with permission query/request methods. This validates routing and UI behavior, not OS picker/OS permission prompts. Native acceptance remains **NOT RUN**.

## Search path and PDF colors

Search path:
- `SEARCH_HIGHLIGHT_COLOR = '#60A5FA'`.
- Path edges between highlighted folders use `#60A5FA` at `opacity 0.55`.
- Folder outlines use blue; file fill/color is preserved.
- Active search folder draws a solid 3.5 px blue outline with larger gap.
- Clearing/changing query removes path IDs, edge tint, folder outline, and active ring.
- PDF/non-PDF appearance is not recolored by search.

Measured in the real app:
- highlighted edge: `{"fromId":"root","toId":"folder-node","stroke":"#60A5FA","opacity":0.55}`.
- canvas stroke: `#60a5fa`, `globalAlpha 0.55`.
- folder outlines: `stroke #60A5FA`.
- active stroke: `#60a5fa`, width `3.5`.
- clear: ids `[]`, edges `[]`, activeId `null`.

PDF:
- filename text `rgb(248,113,113)` / `#F87171`.
- PDF badge `rgb(248,113,113)` / `#F87171`.
- selected/search target: filename and badge remain red; blue outline communicates search.
- after preview close: red filename/badge still present.
- search clear: red PDF remains, no stale red highlight.
- light theme: `#F87171` filename and badge.
- PDF classification round-trips through the package format; full Save As/reopen UI was **NOT RUN**.

Active LOD harnesses were updated consistently:
- Stage 2B-1: blue `--search`, PDF filename/badge CSS red, no red label override.
- Stage 2B-2: blue target ring, no label recolor; production label overlay supplies red PDF text/badge.
- Their browser evidence was refreshed (`analysis/stage2b1/evidence`, `analysis/stage2b2/evidence`).

## Changed files

Harness/UI:
- `tests/harness/m5-exploration/orbit-folder-browser.js` (new)
- `tests/harness/m5-exploration/main.mjs`
- `tests/harness/m5-exploration/index.html`
- `tests/harness/m5-exploration/orbit-directory-adapter.js`

Rendering/colors:
- `src/engine/hypertree/exploration/search-highlight.js`
- `src/engine/hypertree/render/graph-renderer.js`
- `src/engine/hypertree/render/label-overlay.js`
- `src/engine/hypertree/render/label-classification.js`

LOD:
- `analysis/stage2b1/app.mjs`, `analysis/stage2b1/index.html`
- `analysis/stage2b2/adapter.mjs`, `analysis/stage2b2/index.html`
- refreshed LOD browser evidence.

Tests/docs/evidence:
- new `orbit-folder-browser.test.mjs`, `search-highlight-colors.test.mjs`, `lod-color-consistency.test.mjs`
- updated adapter/browser/renderer/label/navigation tests
- `evidence/orbit-folder/`
- this report.

Reviewed Stage 3A edition-context/persistence changes and tests are integrated; the normal application remains free-only at 300 nodes and paid capacity remains restricted to the reviewed internal test contexts.

## Tests

- Combined targeted tests: **136/136 PASS**, exit 0
- p1b-main: **69/69 PASS**, exit 0
- Complete free regression: **1,214 tests, 1,213 pass, 1 skip, 0 fail**, exit 0
  - Remaining suite: 1,145 tests, 1,144 pass, 1 skip
  - Skip: pre-existing fake-IndexedDB overlapping-readwrite case; native IndexedDB serialization remains NOT RUN.

Fresh logs: `evidence/orbit-folder/` and the capture files under `.orbitbrowser`.

## PASS / FAIL / NOT RUN

**PASS**
- Directory picker authorization → application modal listing.
- Subfolders + `.orbit` files together; unrelated files hidden.
- Nested navigation, breadcrumb, Parent, Refresh.
- Explicit Connect and sidebar refresh; browsing does not replace current map.
- Explicit Open through existing protected pipeline.
- Unsaved Cancel preserves current map; Discard returns to clean map.
- Modal/native picker cancel and permission denial preserve state.
- Focus trap/Escape/focus restoration.
- Viewport containment at 800×600.
- Search blue path/outline/active ring and clear reset.
- PDF red filename/badge in dark/light, selection/search, preview close.
- LOD color consistency and refreshed evidence.
- Targeted 136/136, p1b 69/69, complete free regression 1,214/1,213 with 1 pre-existing skip.

**FAIL**
- None in executed checks.

**NOT RUN**
- Browser-level stale directory listing replay (adapter stale/current tests pass).
- Collapsed-sidebar modal measurement (expanded sidebar at desktop and 800×600 measured).
- Native OS acceptance; browser evidence uses stubbed picker/handles.
- Full Save As/reopen PDF UI; package format and preview close were tested, the complete Save As UI path was not.



