# FileOrbit large-map prototype (test entry)

This is a synthetic large-map test experience, not production paid activation.

## Launch (Windows PowerShell)

```powershell
cd C:\Users\openw\Documents\Projects\FileOrbit-git
python -m http.server 8161 --bind 127.0.0.1 --directory .
```

Chrome or Edge:

`http://127.0.0.1:8161/tests/harness/large-map/index.html`

Do not use GitHub Pages or external hosting.

## Fixture matrix

- Shapes: flat, wide, balanced, mixed, deep.
- Counts: 300 total nodes including root (free context) and 1,000 total nodes including root (explicit internal paid-test context).
- Includes long names, Korean names, duplicate `보고서.txt` in different folders, empty folder, empty file, text/image/PDF sample attachments.
- Attachment limits remain 20 MiB/file and 100 MiB/map.

## First user scenarios

1. Flat 300: identify root, find `샘플-텍스트.txt`, preview it.
2. Balanced 300: navigate groups/pages, return to root.
3. Mixed 300: search `보고서`, distinguish the two same-named files by path, clear search.
4. Deep 300: navigate depth and return; repeat to check context is not lost.
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
- Search, reveal a result and clear search.
- Read filenames; distinguish same-named files by location.
- Understand selection and search-path highlighting.
- Preview supported sample content where functional.
- Repeat navigation without stale selection or lost context.

## Technical observations (automated)

- Fixture counts exact for all five shapes at 300 and 1,000.
- Edge smoke: flat 300 mounted with 8 root items; duplicate-name search returned 2 results; deep 1,000 mounted with one stage; no browser errors.
- These are technical smoke observations only, not human usability acceptance.

## Limitations

- Prototype test entry; no production Save/Open, no writable handles, no paid activation.
- No native OS picker/disk acceptance.
- The 1,000-node context is internally issued for this test only.
- Folder Upload/cloud/Tauri/enterprise are outside this delivery.
- Human usability feedback is pending; automated reachability is not usability acceptance.
