# Open Orbit naming and icon — r134

## Sidebar action

The primary `open-document` action now presents:

- visible label: **Open Orbit**
- accessible name: **Open Orbit**
- native title and collapsed tooltip: **Open Orbit**

The existing handler and integrated opening workflow are unchanged. Sidebar tooltip suppression while expanded remains in force.

The exact asset `C:\Users\openw\Downloads\folder_supervised_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.png` was found and copied to:

`tests/harness/m5-exploration/assets/folder_supervised_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.png`

SHA-256: `A4F60E231CBFCBD3C33F8898E1241A21B02E9DCFBB9873041BC1E7FA9321A97F`

It is referenced through a relative `assets/…png` URL and uses the r133 alpha-mask approach, painted with `currentColor`, fixed at 20×20 with preserved aspect ratio. It is decorative (`aria-hidden="true"`) and does not change the 44px button target.

The connected Orbit folder toggle retains its actual folder name and its separate r133 icon.

## Integrated dialog

The map-opening browser heading is now **Open Orbit Folder**. Its existing `aria-labelledby="file-open-browser-title"` relationship and heading id are unchanged. The node editor is untouched.

## Verification

- Focused sidebar/Open/Orbit/dialog/tooltip suites: 26/26 passed.
- Full engine: 1099 tests, 1098 passed, 1 skipped, 0 failed.
- Headless Chrome inspection: 20×20 icon, correct label/name/title, expanded tooltip suppressed, dark/light visible, dialog heading/aria relationship present, standalone “Open file elsewhere…” still available.
- Native filesystem acceptance: **NOT RUN**. Browser inspection is not native filesystem evidence.

No folder selection, refresh/list rendering, current-map indication, listed-map opening, standalone opening, focus/ownership guards, Save/autosave/recovery/Copy Map, map data, database state, dependencies, original files, other projects, commits, pushes, deployments, or server state were changed.
