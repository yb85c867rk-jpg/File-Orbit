# FileOrbit desktop data-safety correction — r150

## Scope

This revision corrects the r149 PDF preview evidence without changing application behavior, limits, or scope.

- r149 archive preserved: `337A25F0928D84A003D5ECBAEBB3C9233D45E4FA3BB9F1B00645D32BEE09782E`
- Historical r149 evidence and hashes preserved.
- No paid/enterprise/external-Embed/hosting/deployment work.
- 300-node limit, attachment limits, and `#E74C3C` remain unchanged.

## Corrected PDF fixture

The r149 `report.pdf` was invalid:

- 69 bytes
- SHA-256 `cfa3181c1ee36e8bce5e39f84959f4558ea7ba32c0e4539a8ab3c8ce8c716ec6`
- Catalog stub with no usable page tree; independent parse failed on missing `startxref`.

Historical PDF independent check: 69 bytes, SHA-256 `cfa3181c...`, parser failure `startxref not found` ([status](../../evidence/native-r121/r150-fixtures/historical-pdf-status.json)).

New synthetic fixture:

- `evidence/native-r121/r150-fixtures/report-r150.pdf`
- 1,068 bytes
- SHA-256 `d282cf216a332cab9a7f18456450ac6cf26d641f10b48790515bea664f3ef749`
- **2 pages**
- Page 1 text: `FILEORBIT PDF PAGE ONE - recognizable synthetic content Alpha page text: 300-node lifecycle preview.`
- Page 2 text: `FILEORBIT PDF PAGE TWO - second page content Beta page text: page navigation target.`
- Independent Python stdlib parser validates `%PDF`, `startxref`, xref offsets, two `/Type /Page` objects, content streams, and both text strings: [report-r150-validation.json](../../evidence/native-r121/r150-fixtures/report-r150-validation.json)

New `.orbit` fixture:

- `evidence/native-r121/r150-fixtures/r150-300.orbit`
- 37,984 bytes
- SHA-256 `3b1eb3c7b562c0746377b688d82d9752ea68ad8d825a9e6a378906a89996cf6b`
- **300 nodes** including root
- Attachment hashes:
  - PDF `d282cf...` (new)
  - Markdown/text/image unchanged from r149

Historical r149 archive and its original 69-byte PDF remain untouched.

## Preview evidence: shell vs bytes vs rendering

| Layer | Result | Evidence |
|---|---|---|
| Viewer shell open/close, PDF ×3 | **PASS** | backdrop, iframe, external fallback link; no viewer left open |
| Attachment bytes preserved | **PASS** | decoded `.orbit` has 1,068-byte PDF with expected hash |
| Independent PDF structure/text | **PASS** | 2 pages and both page texts parsed |
| Browser PDF viewer rendering | **PASS (external fallback target)** | screenshot page 1 shows “FILEORBIT PDF PAGE ONE…” and toolbar `1 / 2`; screenshot page 2 shows “FILEORBIT PDF PAGE TWO…” and `2 / 2` |
| PDF page navigation | **PASS (in-app and external viewer)** | clicked page 2 thumbnail; in-app viewer moved 1/2 → 2/2 and displayed page-two text |
| External-open fallback | **PASS** | app link “Open PDF in new tab”, `target="_blank"`, blob URL opened in PDF viewer target |
| **In-app iframe PDF content** | **PASS** | screenshot shows in-app viewer page 1 text and `1 / 2`; thumbnail click shows page 2 text and `2 / 2` |
| Image decode | **PASS** | `complete=true`, `naturalWidth=1`, `naturalHeight=1` |
| Markdown Unicode content | **PASS** | literal `# Field Notes`, `한글 문서입니다.`, `- one`, `- two` |
| Text Unicode content | **PASS** | literal `Plain text preview`, `한글 줄` |
| Unavailable attachment feedback | **PASS** | “This file has no attachment to preview.” |

The r149 statement that PDF preview passed based on iframe existence is **withdrawn**. The corrected evidence distinguishes viewer shell, byte preservation, and actual PDF rendering.

## Retained 300-node evidence

The r149 300-node lifecycle remains valid for topology, metadata, and non-PDF attachment bytes:

- 300 nodes including root; 38 folders, 262 files.
- Wide 58-file folder and 12-level nested chain.
- Save/download and reopen comparison.
- Move/Undo/Redo, hidden-branch search, 301 rejection.
- Browser-restart recovery with tree/byte equality.

The new r150 `.orbit` is independently decoded as 300 nodes and contains the corrected PDF bytes. It was not re-run through the full save/reopen/recovery sequence in this correction; the previous r149 topology/byte evidence remains historical and the PDF-specific correction is independently validated.

## Native desktop acceptance — NOT RUN

The following require actual native/user interaction in a headed browser and remain **NOT RUN**:

- Create Map commit through native save picker.
- Open File picker.
- Save As picker and cancellation.
- Overwrite conflict and protected overwrite.
- Reopening a saved `.orbit` through native Open.
- Native filesystem write failure/close failure.

### Exact node count for Create Map manual run

To commit exactly **300 nodes including the synthetic root**:

- Select **299 file nodes**, with **no folder nodes**: `1 root + 299 files = 300`.
- If one selected empty folder node is included: use **298 files + 1 folder + 1 root = 300**.
- To test rejection: add one file or folder so the candidate is `301` total; expected rejection, with the committed 300-node map and saved `.orbit` unchanged.

This count is not interchangeable with attachment count; folders themselves count as nodes.

### Manual desktop steps

1. Use a headed Chrome/Edge with a dedicated disposable profile and serve FileOrbit at `http://127.0.0.1:8099`.
2. Create Map → select the exact 299-file/zero-folder (or 298-file/one-folder) fixture → Save As to a disposable folder. Record created node count and file hash.
3. Open File/Open Orbit → choose the saved `.orbit`; verify 300 nodes and all attachment bytes.
4. Save As again; cancel the picker and verify the current document remains unchanged.
5. Trigger an overwrite conflict (modify the target file externally); verify conflict protection does not silently overwrite.
6. Add a 300th file/folder to a fresh candidate to produce 301 total; verify rejection preserves the committed map and saved file.
7. Preview PDF, text/Markdown, and image; record whether PDF content renders in the in-app viewer, page controls, close/reopen, and external-open fallback.
8. Record browser/OS versions, origin, profile path, hashes, screenshots, and exact outcomes. Do not mark native rows PASS without observation.

## Acceptance matrix

| Area | r150 status |
|---|---|
| 300-node topology/metadata/non-PDF bytes (r149 evidence) | PASS |
| New PDF structure/text independent validation | PASS |
| PDF viewer shell and close/reopen | PASS |
| PDF content/page navigation via external fallback | PASS |
| In-app PDF iframe content | PASS |
| Image decode/text Unicode | PASS |
| Unavailable attachment feedback | PASS |
| Native Create Map/Open/Save As/cancel/conflict/reopen | NOT RUN |
| Native mobile/other browsers | NOT RUN |
| Full suite | Not rerun; no application behavior changes in r150. r149 serial full: 1119/1118/1. |

## Remaining blockers

- Native Create Map/Open/Save As/cancellation/overwrite conflict/reopen.
- Headed desktop Chrome/Edge, Firefox, Safari, Android, iPhone/iPad.
- Native filesystem failure and multi-tab storage contention.
- Long-duration soak.

**Readiness:** still **NOT READY for free-edition release**. The corrected PDF fixture and rendering evidence remove the invalid r149 PDF claim, but native picker and mobile/other-browser evidence remain absent.
