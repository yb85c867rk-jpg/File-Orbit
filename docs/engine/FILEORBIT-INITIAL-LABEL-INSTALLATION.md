# FileOrbit Initial Label Installation

Status: **FIXED in actual-entry harness — native browser verification NOT RUN**

## Root cause

Create Map suspension hid `#label-host`. Candidate `installFrame()` then called `overlay.update()` while the host was hidden. `LabelOverlay.#viewport()` measured `host.clientWidth/clientHeight`, which is zero for a display:none host, so every label was suppressed. Commit revealed the host afterward; the first later node click installed another frame with a visible host and labels appeared.

## Correction

- Added a measurable but concealed candidate label context before candidate frame installation:
  - `#label-host` is unhidden,
  - old label DOM is removed,
  - `visibility:hidden` keeps candidate labels visually concealed,
  - pointer events are disabled.
- Candidate `installFrame()` therefore measures:
  - current `#graph-wrap` viewport via the shared viewport,
  - actual label-host layout dimensions,
  - real label text rectangles.
- Draw, labels, and hits complete with candidate metadata before commit.
- Commit `setMapPresentation(true)` reveals the prepared label host; no click, timeout, second fit, or post-commit redraw is used.
- Restoration recreates the old surface/overlay with a visible, measurable label host and the old map.
- Empty startup/restore clears the concealment style.
- Candidate label DOM is pruned to candidate visible IDs so old-map labels cannot remain.

## Actual-entry evidence

- Empty startup → create sparse map:
  - no click required,
  - initial visible labels include `Map`, `Docs`, `Other`, `Notes.md`, `keep.txt`,
  - label metrics viewport `1100×473`, `visibleCount=5`, `unmeasurableCount=0`, `textMismatchCount=0`.
- Existing map → replace with sparse map:
  - replacement labels include only the new map/name/file,
  - old `Notes.md` labels are absent.
- Initial file-name activation:
  - clicking the prepared `Notes.md` label name opens the current attachment registry viewer without a preliminary graph click.
- PDF label icon remains red (`#F87171`); text/data label icon remains green (`#22C55E`).
- Resized restore labels remain positive/visible.
- Dark/Light presentation retained.
- Draw/label/hit failures still use the existing recovery/inert paths.

## Verification

- Full `tests/engine`: **704/704 pass**.
- Exploration: **173/173 pass**.
- Syntax checks: pass.
- Native browser verification: **NOT RUN**.

## Limitations

- Real browser layout/text measurement was not available; the harness now models hidden ancestors as zero and visibility-hidden layout as measurable, but this is not browser-native evidence.
- Label-update/hit failure paths remain covered by shared adapter tests rather than a browser run.
- No UI redesign, limits, storage, import/export, Embed, dependencies, commits, pushes, or deployment.
