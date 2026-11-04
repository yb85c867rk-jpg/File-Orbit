# FileOrbit large-map prototype (test entry)

This is a synthetic large-map test experience, not production paid activation.

## Launch (Windows PowerShell)

```powershell
cd C:\Users\openw\Documents\Projects\FileOrbit-git
python -m http.server 8162 --bind 127.0.0.1 --directory .
```

Chrome or Edge:

`http://127.0.0.1:8162/tests/harness/large-map/index.html`

Do not use GitHub Pages or external hosting.

## Working controls

- Mount/unmount fixture; mount replaces and disposes the previous runtime.
- List, graph node/label, and breadcrumb navigation.
- Folder/cluster pagination via Prev/Next.
- Search with separate Previous/Next/Clear controls.
- Preview selected file: valid synthetic text, PNG, PDF and zero-byte test attachment.
- Graph clicks use the renderer adapter’s label hit test and scene hit test.

## Fixture matrix

- Shapes: flat, wide, balanced, mixed, deep.
- Counts: 300 total including root (free context) and 1,000 total including root (explicit internal paid-test context).
- Long names, Korean names, duplicate `보고서.txt` in separate folders, empty folder, empty file, text/image/PDF sample attachments.
- Attachment limits remain 20 MiB/file and 100 MiB/map.

## First user scenarios

1. Flat 300: find `샘플-텍스트.txt`, preview it.
2. Balanced 300: navigate groups/pages, return to root.
3. Mixed 300: search `보고서`, distinguish same-named files by path, clear search.
4. Deep 300: navigate depth and return; repeat.
5. Wide 300: page through groups and select a file.

Then optionally:
6. Flat 1,000.
7. Deep 1,000.
8. Mixed 1,000 with search and preview.
9. Balanced 1,000.
10. Wide 1,000, repeating navigation/search.

## User checklist

- Identify the current folder and return to root.
- Navigate groups/pages and find a specified file.
- Search, reveal a result page later than page 1, and clear search.
- Distinguish same-named files by location.
- Understand selection and search-path highlighting.
- Preview the valid PNG and PDF samples; confirm image visibility/readable PDF page.
- Click graph nodes/labels and confirm list/breadcrumb/details stay synchronized.
- Repeat navigation without stale selection or lost context.
- Mount fixture B after searching/previewing A; confirm no stale results/preview remains.
- Unmount and confirm page/preview/search controls are disabled.

## Automated browser checks

`node .large-map-corrected.mjs` equivalent is committed as `tests/harness/large-map/browser-check.mjs` (requires local server and Edge). Latest evidence: `evidence/large-map/corrected-execution.json`.

Checked:
- flat 300 model count 300;
- search 6 pages, page 2 navigation, result reveal, clear;
- PNG image naturalWidth > 0;
- PDF bytes start `%PDF` and embed exists;
- fixture replacement clears search/preview/details, one stage;
- graph cluster click expands;
- unmount disables controls, clears preview, zero stages;
- deep 1,000 count 1000, 20 search pages, page 2 shows results;
- browser errors 0.

## Limitations

- Prototype test entry; no production Save/Open, writable handles, editing or paid activation.
- No native OS picker/disk acceptance.
- 1,000-node context is internally issued for this test only.
- Folder Upload/cloud/Tauri/enterprise are outside this delivery.
- Automated checks are not human usability acceptance; human feedback pending.
