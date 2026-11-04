# .orbit exclusive format and Open Orbit help — r136

## Current format policy

FileOrbit supports **`.orbit` only**. The container bytes, tree IDs, metadata, attachment bytes, ownership guards, conflict protection, recovery, and confirmed-write semantics are unchanged.

- Create Map (standalone and in Orbit), Open, Save, Save As, automatic Save, Copy Map, Download, directory enumeration, picker filters, fallback input, filename normalization, help, validation, and empty states use `.orbit`.
- `.map` and `.fileorbit` inputs are rejected in English before document installation.
- A renamed or invalid file does not become valid by using `.orbit`; content magic/schema/hash validation still applies.
- No migration or compatibility path is provided.
- No `.map`/`.fileorbit` files remain in the project or known FileOrbit test folders after the deletion audit below.

## Deleted disposable test documents

All deleted files began with the FileOrbit `FILEORBIT` container magic; none were source maps, dependencies, documentation, or another project’s data. Provenance hashes are recorded in `evidence/native-r121/deleted-legacy-documents-r136.json`.

| Path | Bytes | SHA-256 |
| --- | ---: | --- |
| `C:\Users\openw\Downloads\knowledge map - Copy.fileorbit` | 334,756 | `803F559A5205BA13C44F03525EE123D9CAC6E02D36F0A709DFDDC93526FEC520` |
| `C:\Users\openw\Downloads\knowledge map.fileorbit` | 282,610 | `1C9B4EE79A70447069DFAFD40F5F673242FB9DEB85F4B7E8E853A2039186E116` |
| `C:\Users\openw\Downloads\new map (1).fileorbit` | 462,927 | `1613B4EF97AABF779ECB992FBBA675E85A4927497BE99AAD64B70EA9053A09FE` |
| `C:\Users\openw\Downloads\new map.fileorbit` | 462,927 | `D4DDA5F09C0504384D3D5CDC1CE937CDB24D22353168E780A940548D113D9FC7` |
| `C:\Users\openw\Downloads\recovered-test.map` | 52,264 | `C586CC2695B64E2F55C7A7B3844600FB19070B0F997ED6B778B73BA0623BDDD1` |
| `C:\Users\openw\Downloads\test map.map` | 52,832 | `486AD30B2505B870D4F0EE5675649DBE494838222AAC9B4E95475723432E333D` |
| `C:\Users\openw\Downloads\test-r81.map` | 543,634 | `B88136F498CBEA6C14228193698F0A31BF66F48B3082C10105B86E36586D41FF` |

No candidate files were found in the project tree after excluding review archives, evidence, dependencies, and browser profiles. Historical review ZIPs and manifests were not modified.

## Open Orbit help

The expanded sidebar has an independent circular **?** button:

- accessible name `About Open Orbit`;
- `aria-expanded`/`aria-controls` and a `role="tooltip"` text panel;
- exact text: “An .orbit file contains your visual map and its attached files. An Orbit folder is a regular folder where you keep these files. Choose a folder to browse and open your saved maps.”;
- hover/focus/click/touch open, Escape closes, collapse closes/hides;
- never invokes Open; it has no action handler and is a separate button.

## Historical note

Older planning/review documents may mention the retired `.map`/`.fileorbit` extensions as historical context. r136 is the current policy and tooling; those extensions are not accepted.

## r137 help correction

Open Orbit and the circular ? are now sibling buttons in one row. Accessible name is About Orbit files. Hover/focus reveal; the first click/tap pins the help open even after prior pointerenter/focus; outside pointer and Escape dismiss; Escape suppresses immediate focus reopening; collapse dismisses; the pointer may move onto the tooltip; help never invokes Open. Tooltip is absolute within the row and remains within narrow viewports.

## Verification

- Focused extension/help/creation/Copy/Open/Save suites: 151/151 passed.
- `.orbit`-only actual-main rejection test passes for `.map` and `.fileorbit` with unchanged current tree/bytes.
- Full engine: 1102 tests, 1101 passed, 1 skipped, 0 failed.
- Native filesystem acceptance: **NOT RUN**. Synthetic handles are not native filesystem evidence.

No database reset, original user-file modification beyond the explicit disposable test documents above, dependency installation, commit, push, deployment, server shutdown, or unrelated project change.
