# FileOrbit Create Map — Slice 2

Status: **IMPLEMENTED; browser-native picker/drop verification NOT RUN**

## Input modes

- Multiple-file picker (baseline, mobile-capable where the browser exposes it).
- Folder picker using `webkitdirectory` where supported; only exposed files/paths are available.
- File and directory drag/drop in the owned drop area, capturing `webkitGetAsEntry()` during the drop event.
- Text/URL drops are ignored.
- No absolute paths, device scans, broad filesystem permissions, uploads, or native integration.

## Tree contract

- One synthetic structural root named by the validated map name.
- Loose files become root children; selected folders retain their relative hierarchy.
- Files: `kind:'file'`, `dataType:'file'`, `description:null`, attachment metadata under `data`.
- Folders: `kind:'folder'`, no attachment metadata.
- Stable IDs are generated as `cm-<datasetTokenBase36>-<counterBase36>`; names/paths are never IDs.
- Siblings use deterministic case-insensitive Unicode ordering.
- Same names under different parents are allowed. Duplicate/conflicting relative paths reject.
- Paths reject absolute, traversal, empty, backslash-ambiguous, and malformed segments.
- Empty folders from directory entries are preserved. File-only picker modes may not expose empty directories.

## Limits and cancellation

- 300 nodes including synthetic root.
- 20 MiB per file, 100 MiB candidate attachment bytes.
- Limits are enforced during topology construction and classification; no partial subset installation.
- Bounded classification concurrency (4 by default).
- Operation tokens invalidate stale traversal/classification on new selection, close, replacement, or destroy.
- Candidate registries are isolated and released on cancel/failure.
- Preparing a replacement can temporarily retain both live and candidate resources; the per-dataset cap is not a browser-memory guarantee.

## Installation boundary

Validate → candidate tree/registry → `loadTree` → v2+refinement → candidate model → fitted frame →
draw → labels → matching hits → revalidate live identity → commit references → publish → release old resources.

- Old dataset/history/attachments remain authoritative on failure.
- Failure recovery uses the accepted recovery path; recovery success is reported only when it succeeds.
- Successful replacement resets dataset identity/token/revision, selection, history, ID allocator, navigator, and attachment registry while retaining theme/toolbar/fullscreen state.
- Viewer/menu resources are closed before old attachment ownership is cleared.

## Dialog lifecycle

- Hosted in the application overlay host inside the fullscreen boundary.
- Explicit preview and separate replacement confirmation.
- Escape/Cancel closes and invalidates work; focus returns to the opener.
- Dirty editor prompts are reused before opening.
- Creation owns interaction while open; double submission is blocked.
- Drop handlers are limited to the created dialog area and separate from graph reparent drag.

## Corrected integration behavior

- Map name is part of candidate identity. Valid name edits rebuild from retained File objects without reopening pickers; invalid names block creation; stale async preparations cannot become installable. IME composition is not submitted prematurely.
- Dialog visibility uses hidden/display/visibility and connectedness, never ancestor-wide offsetParent rejection; fixed dialogs and document ancestors remain focusable. Tab recovers focus outside the active stage.
- Close restores the original invoker only when connected/visible/enabled/focusable; otherwise the shared responsive fallback resolver selects a visible Create Map control or Map trigger. Destroy does not restore focus.
- Focus trapping is stage-aware: creation and confirmation expose only their visible/enabled controls; confirmation Cancel/Back/Replace have deliberate focus; submission keeps a reachable Cancel.
- Creation ownership and persistent recovery failure are separate. Opening/closing Create Map cannot clear a prior recovery failure. Successful recovery restores the old frame but keeps creation ownership until the dialog closes. Successful replacement clears recovery failure. Failed recovery leaves interaction inert after close.

## Runtime wiring

main.mjs explicitly imports the authoritative Create Map dialog, candidate preparation, directory collection, and candidate-installation modules. The dialog is initialized before desktop/mobile actions are enabled; initialization failures mark Create Map unavailable and publish the original error. An isolated-process harness test imports the actual entry module and verifies desktop/mobile dialog opening, candidate preparation, directory drop collection, creation-ownership release, and failure handling.

## Known limitations

- Native browser picker/drop behavior not executed.
- File-only picker modes cannot reveal empty folders.
- Temporary live+candidate retention may exceed the per-dataset byte cap in browser memory.
- No Search, archive import/export, Embed, persistence, hosting, or deployment.






