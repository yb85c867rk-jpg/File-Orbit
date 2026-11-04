# FileOrbit P3 Portable Backup — Format and Status

Status: **AUTOMATED P3 SCOPE VERIFIED — FILE-DOCUMENT SLICE 1 ADDED (see FILEORBIT-FILE-DOCUMENTS.md); NATIVE BROWSER ACCEPTANCE NOT RUN**
Container version: **1**. Application backup schema: **1**.

## Binary layout (frozen)

| Field | Size | Rules |
|---|---:|---|
| Magic | 9 | ASCII `FILEORBIT` |
| containerVersion | 2 | uint16 big-endian, exactly 1 |
| manifestLength | 4 | uint32 big-endian, 2..2 MiB |
| Manifest | manifestLength | strict UTF-8 JSON |
| Attachment payload | remainder | raw concatenated bytes |

Fixed header size **15 bytes**. All offsets are relative to the payload section beginning at `15 + manifestLength`. Integers are unsigned big-endian safe integers. Ranges must be contiguous: no gaps, overlaps, truncation, or trailing bytes. `packageSize = 15 + manifestLength + totalAttachmentBytes`.

Manifest fields: containerVersion, appSchemaVersion, exportedAt, mapName, optional sourceMapId (provenance only), nodeCount, canonical tree, attachments (package id, offset, length, originalName, sizeBytes, mime, classification, SHA-256), totalAttachmentBytes, packageSize. Runtime tokens, revisions, controllers, object URLs, File/Blob objects, paths, and Undo/Redo history are not serialized.

Limits: 300 nodes, 20 MiB per file, 100 MiB per map, 2 MiB manifest.

## Persistence wording (r66)

Save status: “Saving to IndexedDB…” → “Saved to IndexedDB on this device”. Restored map: “Restored map — not saved yet” until its first Save. Ordinary edits: “Unsaved changes”. Restore completion: “Backup restored. Save to IndexedDB to keep this restored map on this device.” Accessible storage help is toggled by a focusable `?` button; it explains IndexedDB persistence, site-data deletion, and `.fileorbit` Download/Upload without cloud/cross-device claims. Editor summary/form notices now direct users to IndexedDB Save and .fileorbit Download rather than saying “In-memory only”. Help panel background uses the defined light/dark `--fo-panel` variable.

## Implemented

- `src/engine/hypertree/persistence/backup.js` builds a Blob from header/manifest/attachment Blobs without an all-package ArrayBuffer; hashes one attachment at a time with SHA-256; derives and stabilizes packageSize.
- Decoder validates magic/version/header/manifest size, strict UTF-8/JSON, schema, node count, safe offsets/lengths, contiguous ranges, package size, exact reference membership, unused/duplicate IDs, and every SHA-256 before returning a candidate tree and fresh attachment IDs.
- Download/Upload desktop and narrow controls enabled. Download captures the current committed live tree/registry, blocks open editor forms, triggers one browser handoff, and revokes the object URL after handoff.
- Upload uses an explicit `.fileorbit` file input, validates before adoption, creates an isolated registry, and routes installation through the existing create-map candidate installation path. Open editor forms and dirty maps are blocked with status explanations.
- No durable schema version change, no base64, no ZIP dependency.

## Not run / limitations

- Actual main-entry Download → Upload round trip, file picker cancellation, import Save/reload/viewer, and candidate draw/label/hit recovery are **NOT RUN**.
- Import currently blocks dirty maps; it does not yet offer the Save/Discard/Cancel replacement workflow.
- Cancellation during hashing is checked at coarse operation boundaries only.
- Browser handoff does not prove the user saved the file. Device transfer, native memory bounds, and download completion are not claimed.
- Native browser checks are **NOT RUN**.




























