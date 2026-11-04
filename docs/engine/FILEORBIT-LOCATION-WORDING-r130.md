# Save-location wording correction — r130

## Scope
Wording-only correction to the r129 Create Map save-location UI. Directory enumeration, file filters, file creation, Save routing, Open behavior, and lifecycle ownership are unchanged.

## Labels
- `Choose map folder` → `Choose save location`
- `Change folder` → `Change save location` inside Create Map
- Heading remains `Save location`

## Supporting text
- No Orbit: “Choose the folder where your maps will be saved. Map files may not appear in the folder selection window.”
- Connected Orbit: “New maps will be saved in this folder.”
- The selected folder name remains visible in the Save location row.

## Selection feedback
- Success: “Save location selected: <folder name>.”
- Cancellation: “Location selection cancelled. Your map details were kept.”
- Cancellation preserves title, optional selections, and previous destination.

## Existing maps
Existing maps remain available through the connected Orbit menu and integrated Open File browser. Selecting a save location does not open a map and does not change native picker contents.

## Verification
Focused Create Map/save-location suites: 24/24 passed.
No full-engine rerun was made because this is a wording-only correction; the r129 full run remains the last full behavioral run and does not validate these final wording bytes.
Browser evidence: `browser-create-location-r129.png` (updated) and `browser-create-location-r129.json`.

Native picker/write/keyboard checks remain NOT RUN. No IndexedDB reset, user-file modification, dependency install, commit, push, deploy, server stop, or OntoMap/MORAN-DCP change.
