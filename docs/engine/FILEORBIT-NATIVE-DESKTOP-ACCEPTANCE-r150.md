# Native desktop acceptance — r150 checklist

Status: **NOT RUN** until directly observed on a headed desktop browser with a disposable profile and disposable test folder.

## Fixtures
- Valid r150 300-node `.orbit`: `evidence/native-r121/r150-fixtures/r150-300.orbit` (300 nodes incl. root; 37,984 bytes; SHA-256 `3b1eb3c7b562c0746377b688d82d9752ea68ad8d825a9e6a378906a89996cf6b`).
- Valid 2-page PDF: `evidence/native-r121/r150-fixtures/report-r150.pdf` (1,068 bytes; SHA-256 `d282cf216a332cab9a7f18456450ac6cf26d641f10b48790515bea664f3ef749`).
- Historical r149 fixture and evidence remain preserved; do not overwrite them.

## Exact 300-node counts
Create Map count includes the synthetic root and every selected folder node:
- 299 selected files, no folder nodes: **1 root + 299 files = 300**.
- 298 selected files + 1 selected folder node: **1 root + 1 folder + 298 files = 300**.
- Empty folders count as nodes. Any additional file/folder makes **301** and must reject.
- Attachments are not nodes.

## Native checks (leave NOT RUN until observed)
- [ ] Create Map with exactly 300 total nodes via native picker and Save As.
- [ ] Create Map cancellation at the native save picker leaves the current document unchanged.
- [ ] 301-node candidate rejects and preserves the committed 300-node map and existing `.orbit`.
- [ ] Open File/Open Orbit native picker opens the written `.orbit`; verify 300 nodes, node IDs, topology, metadata, and all attachment bytes.
- [ ] Save As writes a new `.orbit`; close completion is observed.
- [ ] Save As cancellation preserves the current document and destination.
- [ ] Overwrite conflict is detected; protected overwrite does not silently replace changed content.
- [ ] Reopen after browser restart and verify the documented persisted/recovery behavior.
- [x] In-app PDF preview: readable page 1 content, page navigation to page 2, close/reopen. Observed in headless Chromium r150 screenshots.
- [x] External fallback “Open PDF in new tab” renders the same PDF. Observed in headless Chromium r150 target.
- [x] Text/Markdown Korean content and image decode (nonzero dimensions).
- [ ] PDF negative case: unavailable/invalid content shows feedback without a false success in a headed native browser.
- [ ] Native filesystem write/close failure preserves the previous map.
- [ ] Record browser/OS version, origin, profile path, file hashes, screenshots, and exact outcomes.

## Manual procedure
1. Launch headed Chrome/Edge with a dedicated disposable profile; serve FileOrbit at `http://127.0.0.1:8099`.
2. Create a disposable folder containing the exact 299-file fixture selection (or 298 files + 1 folder), with no unintended empty folders.
3. Create Map → select that folder → Save As to a disposable path. Confirm the created count is exactly 300 including root.
4. Add one file/folder to a fresh candidate → confirm 301 rejection and unchanged committed map/file.
5. Use Open File/Open Orbit to select the saved `.orbit`; compare 300 node IDs/topology/metadata and attachment hashes.
6. Exercise Save As cancel, overwrite conflict, reopen, and in-app previews.
7. Do not substitute download fallback, harness-assisted import, or synthetic pickers for native rows.

## Remaining platform rows
- [ ] Headed Chrome/Edge desktop
- [ ] Firefox
- [ ] Safari
- [ ] Android Chrome device/emulator
- [ ] iPhone/iPad Safari/PWA

Actual mobile remains a later free-edition step; viewport emulation is not mobile acceptance.
