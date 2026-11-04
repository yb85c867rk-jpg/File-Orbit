# FileOrbit Copy Map and sidebar simplification — r131

## Graph toolbar

Final order:

`Search → Undo → Redo → Embed → Fullscreen → Copy Map → Download`

Copy Map uses a local SVG icon immediately left of Download with accessible name, tooltip, native title, existing responsive wrapping, theme styling, keyboard focus, and touch target behavior. It is unavailable without a map or when an existing operation/editor guard blocks copying. The sidebar Add to Orbit / Copy map here action is removed.

## Copy Map workflow

Clicking Copy Map opens the native directory picker directly from the click. The chosen directory is authorized by its handle; FileOrbit does not infer access from a path or folder name and does not change the connected Orbit.

- The copy uses the authoritative committed tree and exact attachment bytes. Unsubmitted editor drafts remain excluded and existing editor guards apply.
- The existing sanitized filename policy produces the `.map` name.
- Existing destinations, including the original file or a zero-byte file, are rejected before creation with clear feedback. No overwrite, automatic suffix, delete, or move occurs.
- Cancellation leaves the map, Orbit, and source document unchanged.
- Unsupported directory access reports plain feedback and does not claim Download chose a folder.
- The copy never becomes the active document and does not change its destination, dirty state, savedRevision, baseline, history, or recovery ownership.
- Work is bound to the originating operation, document identity/handle, session, dataset, revision, and ownership. Late picker/encoding/write completion from a replaced session publishes no success and creates no destination.
- Non-atomic creation and incomplete-file limitations remain; leftovers are not automatically removed.
- Success: “Map copied to <folder name>.”
- The connected Orbit list refreshes only when the destination matches the connected Orbit by handle identity/isSameEntry.

## Sidebar Orbit section

Clicking the connected folder name toggles its top-level `.map` list. Listed maps open through the protected document pipeline, preserving dirty/editor decisions, external-change protection, and stale-open ownership. “Refresh list” remains. The visible Close/Disconnect and copy actions are removed; internal lifecycle cleanup remains. Current-map indication and loading/empty/error/stale/truncated states are retained.

## Verification

- Focused copy/Orbit/toolbar/Save/Create suites: 48/48 passed.
- Full engine: 1093 tests, 1092 passed, 1 skipped, 0 failed.
- Markers: `COPY_MAP_COMPLETE`, `COPY_MAP_UNSUPPORTED_COMPLETE`, `COPY_MAP_STALE_COMPLETE`; bounded watchdogs.
- Synthetic main-entry tests are not native filesystem evidence. Native picker/write/keyboard/responsive checks remain NOT RUN.
- Existing protected Save, automatic Save, Download, Open, and recovery tests remain in the focused/full runs.

## Boundaries

No database reset, original user-file modification, dependency installation, commit, push, deployment, server shutdown, or OntoMap/MORAN-DCP change.
