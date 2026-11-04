# FileOrbit integrated Open map browser — r123

> **r124 correction:** populated-list keyboard focus order and focus preservation are corrected in [FILEORBIT-OPEN-BROWSER-FOCUS-r124.md](FILEORBIT-OPEN-BROWSER-FOCUS-r124.md).

Status: implemented. Focused navigation/Orbit/editor/lifecycle suites: **237/237 passed**. Full engine: **1082 tests, 1081 passed, 1 skipped, 0 failed**.

## User-facing change

The preliminary two-choice Open File dialog is replaced by one integrated map browser.

Clicking the primary **Open File** action opens one dialog with:

- current Orbit directory name;
- **Choose folder** or **Change folder**;
- **Refresh**;
- a scrollable list of the current Orbit’s top-level `.map` files;
- **Open file elsewhere…**;
- **Close**.

No Orbit connected:

- the dialog explains that a folder can be chosen;
- **Open file elsewhere…** remains available;
- choosing a folder populates the list in the same dialog;
- the first map is not automatically opened.

Selecting a listed map closes the dialog and uses the existing protected `openOrbitEntry` path. Choosing only a folder never replaces the live map. Standalone `.map` and legacy `.fileorbit` Open still use the existing document path.

## Reuse and lifecycle

- Reuses `orbitState`/directory adapter and the existing Orbit open/refresh controllers.
- Reuses listed-map open, dirty replacement prompts, baseline verification, and destination protection.
- No second Orbit state, decoder, writer, or persistence path.
- Dialog `show()` captures session/dataset and request identity.
- Folder/Refresh continuations validate request, captured session/dataset, and current ownership before publishing status or updating a dialog.
- Close/Reopen, folder switch, session replacement, and destroy cannot update a newer dialog, publish stale feedback, restore stale focus, or open an obsolete map.
- A dirty-map/editor decision closes the browser first and uses the existing prompt; no stacked competing modals.
- Unsupported directory access disables folder selection with a concise explanation while **Open file elsewhere…** remains usable.
- Focus is contained in the dialog; Escape closes; focus returns to the Open File trigger; listed entries are normal accessible buttons with text-safe names and current-document `aria-current`.

## Verification

- Focused suites: **237/237 passed**; full engine: **1082 tests, 1081 passed, 1 skipped, 0 failed**.
- Actual main-entry tests cover:
  - connected Orbit list immediately visible;
  - no Orbit → choose folder → same-dialog list;
  - folder change and Refresh;
  - exact listed-map opening;
  - standalone `.map` and legacy `.fileorbit`;
  - picker cancellation and unsupported directory access;
  - dirty replacement Cancel preserving the current map;
  - stale results after session replacement, close/reopen, and destroy;
  - focus/escape/request identity and loading/error/empty/truncated states.
- Browser evidence: integrated dialog desktop and 390 px narrow screenshots, no horizontal overflow, internal list scrolling.
- Native picker/write acceptance remains BLOCKED in the headless harness; automated tests use synthetic handles.

## Remaining limitations

- No independent native picker/write verification in this environment.
- Android/iPhone/Firefox/Safari remain NOT RUN.
- Preflight-to-write race, empty/partial leftovers, no automatic cleanup, stale Open Orbit controller selection, no persisted handle, no watching/recursion/rename/delete/sync.
- No atomic/exclusive creation, compare-and-write, rollback, or crash durability claim.
- User-reported PC manual testing remains user-reported, not independent or cross-platform acceptance.
