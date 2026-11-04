> **Superseded by r138:** the approved variation 06 asset was supplied and installed. See [FILEORBIT-BRANDING-r138.md](FILEORBIT-BRANDING-r138.md).

﻿# FileOrbit approved-logo availability audit — r129

## Requirement
Replace the header text with the approved variation 06 “FO connected-orbit” logo:
indigo F, open O, two connected orbit-node accents. No app-icon substitute or invented mark.

## Search performed
- Active source/docs/assets under the workspace, excluding browser profiles, review archives, and evidence:
  - image assets: `.svg`, `.png`, `.webp`, `.jpg`, `.jpeg`, `.ico`, `.avif`;
  - filenames matching `logo`, `brand`, `variation`, `favicon`, `icon`, `fo`.
- All active Markdown/docs for `variation 06`, `FO connected`, `indigo F`, `logo`, and branding.
- Historical review ZIP central directories for `logo`, `brand`, `variation`, and `favicon` entries.
- `src/engine/hypertree/render/icons.js` was inspected; it contains only graph file-type icons, not branding.

## Result
The exact approved variation 06 asset is **not present** in the available project files or review archives. The only branding material found is the historical naming audit, not an approved logo image.

## Decision
Per instruction, no substitute or invented logo was installed. The compact header retains the existing accessible `FileOrbit` text brand temporarily. No X/exit control was added. Replacing the text is blocked until the approved local asset is supplied.

Automated evidence: `evidence/native-r121/branding-audit-r129.txt`.
