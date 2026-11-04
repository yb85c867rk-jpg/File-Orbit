# Application-generated English messages — r135

## Scope

All application-generated FileOrbit user-facing messages in production UI are English. The confirmed Korean drag/drop sources were translated:

- `src/engine/hypertree/exploration/drop-feedback.js`
- `src/engine/hypertree/exploration/reparent-action.js`

A workspace audit found no remaining Hangul in production JavaScript under `src/` or `tests/harness/m5-exploration/`. Korean user content and Korean-content tests remain unchanged.

## Messages

- Empty canvas: “Drop onto a folder to move this item.”
- Data-node target: “Drop onto a folder, not a data item.”
- Root move: “The root folder cannot be moved.”
- Self-drop: “An item cannot be moved into itself.”
- Descendant target: “A folder cannot be moved into one of its subfolders.”
- Existing parent: “This item is already in that folder.”
- Stale gesture/target: “The map changed. Please try dragging again.”
- Generic rejection: “This item cannot be moved.”
- Preparation failure: “Could not prepare the move.”
- Installation failure: “Could not apply the move.”
- Shared candidate installation boundary: “Could not apply the change.”

Technical error objects remain on internal diagnostics (`error` fields) for preparation and installation failures. User-facing failure text is concise.

## Behavior

No drag/drop validation, tree structure, history, automatic Save, recovery, ownership, map data, or Save/Open/Copy behavior changed. Invalid drops still do not commit a candidate, history entry, or Save operation.

## Verification

- Focused drop-feedback/drop-action/drop-controller/reparent/drag-gesture/drag-history-main: 35/35 passed.
- Full engine: 1100 tests, 1099 passed, 1 skipped, 0 failed.
- Actual pointer drag → Undo → Redo suite passes via headless synthetic pointer events. Native pointer verification: **NOT RUN**.
- Korean user-content tests (YAML, names, descriptions) were not modified and remain part of the full run.

No database reset, original user-file modification, dependency installation, commit, push, deployment, server shutdown, or unrelated project change.
