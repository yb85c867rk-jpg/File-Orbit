# FileOrbit navigation refinement — r122

> **Superseded presentation:** r123 replaces the two-choice Open File dialog described below with one integrated folder/map-list browser. The Save/navigation changes and ownership guarantees remain.


Status: implementation integrated. Focused navigation/Orbit/editor/lifecycle suites: **232/232 passed**. Full engine: **1077 tests, 1076 passed, 1 skipped, 0 failed**.

## Changes

### Save

- Removed the visible left-rail **Save** action in collapsed and expanded navigation.
- Preserved the shared save implementation and conflict protection.
- Preserved editor form Save, applied-operation Retry/Close, Save As, and replacement Save-and-continue.
- Added **Settings → Save changes** with dirty/busy/error availability.
- Settings action shows a dirty/error dot; Settings reports current save state.
- Added a test that performs reparent/Undo/Redo and saves through Settings.

### Open

- One primary rail action: **Open File**.
- It offers:
  - **Open Orbit**
  - **Open map file**
  - **Cancel**
- Each choice invokes its picker directly from that click.
- Removed the separate primary Open Orbit rail action and the Orbit-panel Open Orbit button.
- Active Orbit retains its name/list, Refresh, Close, and Add to Orbit.
- Opening a standalone map does not connect or change the Orbit.
- Connecting/changing Orbit does not replace the live document.
- Unsupported directory access disables Open Orbit with a concise explanation while standalone Open remains available.

## Ownership/lifecycle

- Existing r117–r120 guards are retained:
  - stale Open ownership;
  - destination identity;
  - Save a Copy protection;
  - deferred encoding/destroy;
  - creation ownership;
  - Open Orbit choice ownership;
  - dirty replacement preservation.
- No duplicate document loader or persistence implementation was added.

## Verification

- Focused suites: **232/232 passed**; full engine: **1077 tests, 1076 passed, 1 skipped, 0 failed**.
- Production HTML checks: no primary rail Save, no `orbit-action`, no `orbit-open`; one settings-save; Orbit Refresh/Close/Add present.
- Actual main-entry tests:
  - unified Open → Orbit;
  - unified Open → standalone `.map`;
  - unified Open → legacy `.fileorbit`;
  - cancellation;
  - unsupported directory capability;
  - picker invocation counters from choice clicks;
  - connected list/Refresh/Close/Add availability;
  - Settings Save after reparent/Undo/Redo;
  - dirty feedback and saved feedback.
- Browser layout evidence captured for the updated rail, Open choice, and Settings.
- Automated tests use synthetic handles. Native picker acceptance remains BLOCKED in the harness environment.

## User-reported PC acceptance

The user reports all tested PC functions work correctly. This is recorded separately as **user-reported manual acceptance**, not independent verification. See [user-reported-pc-acceptance.md](../../evidence/native-r121/user-reported-pc-acceptance.md).

## Remaining limitations

- Native picker/write verification is still not independently observed in this environment.
- No cross-platform acceptance claim for Android/iPhone/Firefox/Safari.
- Preflight-to-write race, empty/partial leftovers, no automatic cleanup, stale Open Orbit controller selection, no persisted Orbit handle, no watching/recursion/rename/delete/sync remain.
- No crash durability, atomic/exclusive creation, compare-and-write, or rollback claim.
