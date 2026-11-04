# FileOrbit creation and UI refinements — r129

## Scope

This revision supersedes the proposed Create Map / Create Orbit tabs and any application-managed folder creation. **Create Orbit and the two-tab design are cancelled.** FileOrbit does not create Orbit folders. Users select an existing folder as the current-session Orbit in their operating system if needed.

## Create Map

Create Map opens directly to the map form with Map title, optional files/folders, Save location, Create Map, and Cancel. There is no preliminary destination-choice screen and no Create Orbit form/tab.

Save location:

- Connected Orbit is the default location and displays its actual name.
- **Change folder** selects another existing folder.
- With no Orbit, **Choose map folder** selects an existing folder and connects it.
- Selecting a folder connects the current Orbit but creates no map and does not replace the live map.
- Repeated creation reuses the connected folder without another directory picker.
- **Save elsewhere…** creates a standalone file through the existing save picker/download handoff.
- Supporting text: “Maps you create will be saved in this folder.”
- Title/selections survive folder change, picker cancellation, and tab-like state changes; no filesystem writes occur merely from changing location.

The existing candidate preparation, installation, encoder, protected writer, collision checks, recovery, destination adoption, and ownership paths are reused. No automatic cleanup/rollback claim is added. Unsupported directory APIs keep standalone creation available with plain-language explanation.

## Sidebar tooltips

- Expanded rail suppresses custom and native `title` tooltips for sidebar controls; an active tooltip is dismissed immediately on expansion.
- Collapsed rail restores custom hover/focus tooltips and native titles.
- ARIA labels, focus indicators, disabled-state information, and graph-toolbar tooltips are preserved.
- Full-name accessible labels remain available while titles are suppressed.

## Branding

The exact approved variation 06 FO connected-orbit asset was not found in active project assets/docs or historical review archives. Per instruction, no substitute or invented logo was installed; the compact accessible **FileOrbit** text brand remains temporarily. No X/exit control was added. See [FILEORBIT-BRANDING-r129.md](FILEORBIT-BRANDING-r129.md).

## Verification

- Focused creation/Orbit/Open/tooltip/navigation/Save/recovery/lifecycle suites: 166/166 passed.
- Full engine: 1090 tests, 1089 passed, 1 skipped, 0 failed.
- Markers: `CREATE_LOCATION_COMPLETE`, `CREATE_LOCATION_UNSUPPORTED_COMPLETE`, `CREATE_LOCATION_STALE_COMPLETE`, `SIDEBAR_TOOLTIPS_COMPLETE`; matching bounded watchdogs.
- Browser: create form desktop/narrow, sidebar tooltip state; no horizontal overflow.
- Synthetic main-entry tests are not native filesystem evidence. Native picker/write/keyboard/responsive acceptance remains NOT RUN.

## Limitations

No persisted Orbit handles, multiple-Orbit management, recursion/watching, rename/delete, synchronization, manifests, or database changes. No IndexedDB reset, original document/folder modification, dependency install, commit, push, deploy, server stop, or OntoMap/MORAN-DCP change.
