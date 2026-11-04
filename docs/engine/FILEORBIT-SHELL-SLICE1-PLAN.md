# FileOrbit Application Shell — Source-Grounded Plan

Status: **SLICE 1 IMPLEMENTED AS TWO-ROW TOP TOOLBAR; SLICES 2–4 AND EMBED DEFERRED**

Icon-only toolbar correction: desktop Theme/Fullscreen keep their SVG-only DOM; only aria-label/title/pressed state change, while responsive text actions mirror the same controllers. Two-row shell: row 1 branding/actions, row 2 search/Undo/Redo; app-owned #overlay-host and #app-root fullscreen boundary. Corrections: single Undo/Redo listener owned by `createHistoryToolbarController`; theme/fullscreen update only the existing label element without replacing SVG/label DOM; `themedCanvasScene` derives folder/root records so Light theme reaches actual draw operations; shell refactored to a two-row top toolbar with an application-owned overlay/fullscreen boundary.

Implemented files: `tests/harness/m5-exploration/index.html`, `main.mjs`, `shell-controls.js`, shell/theme/fullscreen/history-toolbar tests. Slice 1 creates no tree/attachment/history authority.

## Existing components to reuse

- `tests/harness/m5-exploration/main.mjs`: authoritative tree/graph/model/session/navigator, `createEditorHistory`, `runHistory`, attachment registry, editor panel/viewer, transition and frame installation.
- `tests/harness/m5-exploration/index.html`: current header/graph/right panel shell.
- Shared exploration frame: `prepareExplorationFrame` / `stageExplorationFrame`; no new layout or camera authority.
- Shared renderer/labels: `drawGraphScene`, `createLabelOverlay`; theme changes are presentation-only.
- Shared editor/history/Delete/viewer/drop paths remain the only mutation authorities.

## New components (Slice 1)

- `shell-controls.js`: two-row action buttons/popup controller, explicit theme controller, fullscreen controller, canvas theme adapter.
- HTML shell: top row branding + Create Map/Upload/Download + Embed/Fullscreen/Theme; second row search + Undo/Redo; graph and right details panel below; app-owned overlay host.
- CSS theme tokens for shell, toolbar, labels, editor/context/dialog/viewer chrome.

## Ownership and safety

- No duplicate tree, attachment, navigation, or history state.
- Undo/Redo keeps the single `createEditorHistory` instance and existing `runHistory` guards.
- Navigation and responsive menu changes never clear history.
- Theme/fullscreen/menus are presentation-only and must not recreate editor inputs.
- `#app-root` is the fullscreen boundary and contains the overlay host used by context menus, Delete confirmation, and the attachment viewer.
- Search is reserved and honestly unavailable in Slice 1.

## Slice boundaries

### Slice 1 (implemented)

Two-row top toolbar with responsive Map/More menus; search reserved; Undo/Redo; fullscreen; Light/Dark themes; unavailable states for Create Map, Upload, Download, Embed, search.

### Slice 2 — Create Map (implemented)

Browser-selected files/folders, bounded preview, replacement confirmation, isolated candidate topology/attachments, stale-operation invalidation, and candidate frame installation. See FILEORBIT-CREATE-MAP-SLICE2.md.

### Slice 3 — Search (implemented)

Whole authoritative map including hidden branches; NFC/case-insensitive name/description matching; deterministic ranking and 50-card cap; right-panel cards; stable-ID reveal through the shared navigator/frame; dirty/modal/transition guards; content via existing viewer/details. See FILEORBIT-SEARCH-SLICE3.md.

### Slice 4 — Import/Export

Versioned package format: schema version, stable IDs/metadata, attachment manifest/payload, limits, corruption policy, compatibility. Metadata-only JSON is not a complete backup. Binary packaging requiring a dependency stops for approval.

### iframe — deferred

Requires shareable hosted map URL, saved-map identity, attachment availability, read-only embed behavior, access/privacy policy, and framing policy. No localhost/blob URL substitute. Menu remains unavailable with explanation.

## Async/cancellation

- Future map creation/import uses operation tokens, cancels on replacement/destroy, and commits only after successful candidate frame installation.
- Slice 1 async is limited to fullscreen promises and fullscreenchange; rejection is reported without changing graph state.

## Responsive/capability fallbacks

- Desktop actions collapse into Map/More menus at narrow widths; toolbar/search wraps.
- File selection remains the basic fallback for future Create Map; folder selection/directory drops are capability-detected.
- Fullscreen is marked unavailable when unsupported.
- Themes are session-local; no persistence decision.

## Executable tests

- Desktop action order, responsive Map/More menu action execution, unavailable messaging, Escape/outside dismissal, focus return and listener cleanup.
- Toolbar Undo/Redo labels, disabled state, guarded invocation, history survival across navigation and dataset replacement.
- Fullscreen support/rejection/exit/change with the application root and app-owned overlay hosts.
- Theme token application, DOM identity, and actual canvas fill/stroke colors.
- Shell/theme changes do not recreate editor inputs.
- Graph resize uses the existing resize path after layout changes.
- Full suite and syntax checks; baseline/v1 fixtures unchanged.










## Slice 4 — Empty startup and creation suspension

Implemented in `FILEORBIT-EMPTY-START-SLICE4.md`: no automatic fixture boot, explicit no-map state, shared Create Map action, reversible blank-screen suspension, terminal commit/cancel/failure restoration, and normal-motion search-reveal evidence.

Deferred and NOT IMPLEMENTED: empty-start-screen tutorial slides, Previous/Next/Skip tutorial controls, comprehensive UI polish.

