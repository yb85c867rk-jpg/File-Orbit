# FileOrbit Persistence P1b — Explicit Save/Open

Status: **IMPLEMENTED**
Native browser verification: **NOT RUN**

## User-visible behavior

- Save and Open are in the responsive top toolbar and the narrow-screen Map menu.
- Save persists the current committed map and referenced attachment Blobs through the existing repository.
- Open shows saved-map rows with name, last-saved time, node count, attachment size, Open, and Delete saved map.
- The library explains that saved maps are stored in this browser on this device, are not uploaded, and browser storage can be cleared.
- Empty startup remains empty. Save is unavailable without a map.
- Save state reports No map / Unsaved changes / Saving… / Saved in this browser / Storage unavailable.
- Delete saved map uses a separate confirmation and removes only that durable map and its attachment rows.
- Deleting the currently open saved copy leaves the in-memory graph and runtime attachments intact, detaches the durable identity, and marks the map unsaved.

## Ownership and replacement

- `main.mjs` owns durable `mapId`, generation, saved revision, runtime revision, and runtime-to-persistent attachment mapping.
- A new map has no durable identity until first successful Save.
- Open adopts the saved identity/generation and preserved node IDs; persistent attachment IDs are mapped for later saves/additions.
- Ordinary Save captures the committed revision; later edits remain dirty.
- A completed save updates only the originating session. Session dataset identity is rechecked before publication.
- Save is blocked while an editor draft is open, during ownership/drag/transition/install, and for duplicate saves.
- Open and Create share the unsaved replacement prompt: Save and continue, Discard changes, Cancel.
- Save and continue holds the replacement guard; history, editor activation, drag/reparent, Canvas mutation, delete, Create, and search activation are blocked until handoff/cancel/failure.
- A failed Save keeps the current map, attachment registry, dirty state, mapping, and runtime attachment ownership.

## r39 defect corrections

- Saved-map dialog close honors 
otify:false; choosing Open is a handoff, not cancellation.
- Replacement ownership is acquired for ordinary Open at selection and retained through loading, candidate installation, and recovery; releases are token-checked so stale completions cannot clear newer ownership.
- Open requests are allowed while an editor draft is open; the existing Continue editing / Discard changes prompt routes the request and validates the originating request/session/dataset before resuming.
- Save remains unavailable for uncommitted drafts. Clean editor forms are closed coherently before Open.
- Failure scenarios are independently reachable, with scenario-specific assertions.\n- Unified editor Save applies the form edit and then persists the current committed map through the shared repository. Toolbar Save while a form is open routes to the same form submission. Panel final-state notifications refresh controls. Success closes only after transaction completion. Applied-but-persistence-failed state offers Retry Save/Close without replaying the mutation. While Retry is in flight Close, Escape, programmatic clear, and form replacement are blocked; completion validates panel/form/session ownership after await so stale results cannot close a newer form. Applied-but-unsaved inputs stay readOnly/disabled through publication and resize until Close or success. Conflict completion validates the originating applied operation. Actual Edit Folder, Edit Data, and Add PDF form Saves enable desktop/narrow Save without an unrelated graph event.\n- The Open recovery callback returns ecoverAuthoritativeSession()'s actual boolean result. Successful recovery retains its installed frame/labels/hits and does not run a second restore/resize installation. Tests assert one recovery draw/label/hit sequence, zero resize sequences, preserved camera/framing/selection/focus/details, usable navigation, and a subsequent viewer activation. Failed recovery remains inert with separate original and recovery errors.

## Add Data attachment lifecycle (r43)\n\n- The editor panel resolves the active registry through a session accessor instead of capturing a replacement-prone registry object.\n- Pending reservations store both reservation ID and originating registry owner. Classification, Save lookup, retry, cancel, type switch, destroy, and release use that owner.\n- Successful Create Map/Open recreate the editor panel after installing the new session registry; failed replacement leaves the previous binding.\n- Failed editorial Save returns to editing, retains the draft/file reservation for retry, and replaces Saving… with a retry/error status.\n- Executable main-entry tests cover Add Data PDF after Create Map, after Open, after failed Open recovery, failed Save retry without double accounting, and Cancel/type-switch reservation release.\n- Retry uses a one-shot actual add-data draw callback failure; real recovery succeeds and retry commits without reselection. Delete confirmation recreation owns exactly one DOM instance; real Delete Data Cancel/Confirm paths are exercised.\n\n## Open installation

Open uses repository load → runtime reconstruction → isolated candidate registry → candidate frame → labels → hits → commit. On success it starts at the structural root with a full-tree fit, root details, reset search/editor/viewer/runtime history, fresh interaction ownership, visible labels, and restored attachment names. On failure the previous authoritative map is restored and candidate resources are disposed; draw failure falls back through the accepted session recovery path. Pixel rollback is not claimed.

## Storage scope

- IndexedDB data is browser/device/profile-specific.
- Browser storage is not permanent; clearing site data or browser eviction can remove it.
- No autosave, automatic startup load, backup format, cloud sync, native filesystem integration, or UI redesign was added.
- Existing 300-node, 20 MiB/file, 100 MiB/map, and 512 MiB library limits are unchanged.
- Runtime Undo/Redo remains session-only.

## Executable verification

- Focused persistence suite: 70/70.
- P1b actual main-entry integration: 70/70.
- Full `tests/engine`: 943/944 (1 skipped: fake IndexedDB concurrency limit).
- The integration suite includes guarded Save-and-continue → Open with delayed loading, ordinary Open guard, real editor draft Open/Cancel/Discard via desktop and narrow controls, clean editor form Open, load failure; label and matching-hit failures injected inside the real installFrame adapters; real recovery attempt and real recovery-frame failure; empty-startup failure; real restored-filename viewer activation; actual narrow Map-menu Open; and unavailable IndexedDB.
- Native browser IndexedDB verification: **NOT RUN**. Test-double evidence does not establish native quota, cross-tab serialization, crash durability, eviction, or private-mode behavior.

## Manual browser checklist

1. Open the harness in Chrome/Edge and confirm no automatic save/open or populated map at startup.
2. Create a map with a TXT and PDF attachment; Save; confirm Saved state and library row.
3. Edit metadata; Save; confirm no Blob rewrite is reported and the row remains one map.
4. Open the saved map; confirm root fit, visible labels, hit geometry, root details, and attachment viewer from the restored filename.
5. Reload the page; use Open; confirm the saved map appears and opens.
6. Delete the saved map while it is open; confirm the graph remains, the status becomes unsaved, and saving creates a new map.
7. Create a second map without saving; Open and Create each show Save and continue / Discard / Cancel; Cancel preserves the map.
8. Trigger a draw failure if available and confirm the previous map remains usable.
9. Try with IndexedDB unavailable and confirm an honest error.
10. Test desktop and narrow Map menu, fullscreen, light/dark theme, and keyboard focus/Escape in dialogs.
































































