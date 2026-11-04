# Search-highlight reset corrections — r145

## Corrections
- `clearSearch()` now clears highlight membership and the hidden announcement **before** clearing input/results, then redraws the current frame with normal colors.
- `resetSearchForDataset()` clears highlight membership and announcement at the start of dataset reset, before showing initial/no-map state and before subsequent publication.
- Fixture/dataset replacement now invalidates outgoing highlight IDs before the incoming graph can be presented; the installed frame is redrawn from an empty highlight set.
- Create/Open/Recovery all call the same reset boundary. Failed installs do not call reset, so the surviving map keeps its query/results/highlighting.
- Closing Search is unchanged: it retains query and highlights. Clearing is distinct.

## Tests
Actual-main:
- real Clear search button → empty query/IDs/announcement and normal folder colors;
- active search → direct F20→F200 with no pre-clear → empty query/IDs/announcement, normal replacement colors;
- F200→F20 direct replacement → no stale red frame;
- close/reopen → highlights retained;
- manual empty/no-match → normal colors;
- failed Open replacement (`P1B_OPEN_FAIL_DRAW`) → surviving map query/IDs preserved;
- existing rename/reparent/Undo/Redo/theme/viewport/navigation/search-limit/ancestry tests retained.

## Embed
Remains deferred and disabled: no action implementation, hosting, iframe, localhost/file/blob embed. Prerequisites remain a distributable read-only viewer and a deliberate map/attachment sharing model.

## Verification
- Focused search/render/navigation/replacement/drag-history: 115/115.
- P1B main-entry included in focused run.
- Full engine: 1107 tests, 1106 passed, 1 skipped, 0 failed.
- Exact archive focused: pending.
- Browser clear/replacement: empty query and announcement, no exceptions; screenshots.
- Native checks: NOT RUN.
