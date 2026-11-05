# FileOrbit development roadmap

## A. Git version control — implemented in this branch

- Accepted baseline: `fileorbit-stage3j2a-manual-save-r169.zip`
- SHA-256: `B3D0D2C2097247E46E1A40F9E668DDF8C448FDB2FC3D8BC36C939621E48CD997`
- Stage 3J-2A accepted only for runtime access and deterministic execution validation.
- Native picker/disk and full Stage 3J PC LOD integration remain pending.

## B. PC large-map user testing — prepared in this branch

Synthetic fixtures and a local prototype test entry point only. This is not paid activation and not production readiness.

## C. Complete actual PC application LOD integration — pending

- Connect promoted editable LOD runtime to the ordinary PC app.
- One authoritative document/runtime lifecycle.
- Preserve Open Orbit File/Folder, unsaved decisions, Save, Save As, external baselines, conflict, cancellation, Retry, recovery.
- One connected graph host/canvas, correct cleanup.
- Free admission 300; explicit internal 1,000 test context.
- One adaptive rendering direction across editions; presentation accounts for structure/density, capacity policy separate.

## D. Root context menu: Close Map and Delete Map File — pending

Close Map preserves the disk `.orbit` file and uses existing Save/Discard/Cancel if dirty; release resources safely.

Delete Map File targets only the current exact `.orbit`, uses an application modal (not browser confirm), Cancel/Confirm, deletes only after confirm, closes only after success, preserves map on cancel/failure, coordinates pending saves and stale operations. Platform deletion capability/permissions must be verified; no false success or unverified Recycle Bin claims.

## E. Complete paid features — pending

Paid capacity 1,000 total nodes including root.

Folder Upload at folder nodes including valid root: nested/empty folders/files, candidate counts/attachment usage preview, total capacity validation, all-or-nothing commit, one undoable action, identity/attachment/stale guards. Attachment limits 20 MiB/file, 100 MiB/map.

Cloud import: authorized download into local snapshot, hierarchy/content preservation, no cloud modification, no sync/collaboration initially; provider/permissions chosen before implementation.

Upgrade flow designed alongside paid completion; no premature account/payment/licensing systems.\n\nApproved future requirement (not implemented): when a free addition would exceed 300 nodes, reject the entire addition, preserve existing data, and show a centered application dialog with Cancel / Upgrade information. Do not implement payment or automatic upgrade in the current integration task.

## F. PC acceptance — pending

Free/paid boundaries, usability, editing, Undo/Redo, Save/reopen, attachment hashes, external modification, cancellation, recovery, Upload/cloud as implemented. Native OS checks distinct from synthetic. Chrome/Edge focus; tablet deferred; phone paused.

## G. Tauri — pending

After browser paid project accepted, prepare downloadable desktop app reusing JS logic with native I/O adapters behind reviewed boundaries.

## H. Enterprise — pending

After paid completion and desktop packaging, evaluate collaboration/enterprise requirements. No invented enterprise node limit.


## Deferred sidebar Save (approved, not implemented)

- Add Save immediately above Save As in the left sidebar.
- Save opens a save dialog, preferably starting in the current document's containing folder, with its current filename.
- User confirms before writing.
- If the browser cannot restore that folder, allow location selection.
- Cancellation preserves destination bytes and current edits.
- Preserve external-change conflict protection.
- Save As remains the explicit alternative-name/location flow.
- This supersedes the earlier proposed direct-write sidebar Save behavior.

## Deferred Library navigation (approved, not implemented)

- Rename Open Orbit to Library.
- Remove Orbit File / Orbit Folder submenu and standalone file-picker entry.
- Move Refresh and the existing .orbit list under expandable Library.
- Clicking a listed file still opens it through the protected pipeline.
- Unconfigured Library offers folder selection; configured Library permits changing its folder.
- Preserve unsaved decisions when switching documents.

## Deferred Create Map dialog (approved, not implemented)

- Map Information: title, description, optional collapsible folder input.
- Remove individual file selection from the creation dialog.
- No source folder selected means an empty map.
- Individual files can be added later through the applicable root/folder context-menu flow; bulk Folder Upload remains the planned paid feature.
- Library Setting: selected directory and Choose Directory.
- Use the native directory picker; where supported, users may create a new folder there. Otherwise explain creating it in File Explorer first.
- Picker cancellation preserves form inputs and existing Library setting.
- Directory selection alone does not create an .orbit file.
- Cancel / Create Map remain at the bottom.
- Prevent silent filename collisions and publish the new map/list entry only after successful creation/save.
