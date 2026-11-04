# FileOrbit Persistence P2 — Storage Lifecycle, Quota, Conflict Hardening

Status: **IMPLEMENTED (test-double / actual-main-entry synthetic evidence)**
Native browser verification: **NOT RUN**

## User-reported verification

The user reports that this browser flow now works: Open → Add PDF → Save → refresh → Open. This is recorded narrowly as user-reported verification of that flow only. It is not native quota, cross-tab, crash-durability, or eviction evidence.

## Storage usage and persistence request

- Saved-map library reports application attachment bytes against the 512 MiB application cap.
- Browser origin `StorageManager.estimate()` usage/quota is shown separately, labeled as potentially including other origin data.
- Missing/unavailable estimates are displayed as unknown, not zero.
- Optional “Request persistent storage” button reports granted, not granted, unavailable, or error. No automatic request, no permanence promise.
- Estimates remain advisory; application-cap checks and `QuotaExceededError` remain authoritative.

## Stale-generation conflict resolution

- Save stale-generation failure preserves tree, runtime attachments, history, mapping, and dirty changes.
- Conflict dialog offers Reload saved version, Save as new copy, Cancel; never silently overwrites.
- Reload requires a second explicit “Discard and reload” confirmation and uses the guarded Open/candidate installation path.
- Save as new copy uses a new durable map ID, preserves node IDs/referenced attachments, writes independent per-map rows, and leaves the original saved map unchanged.
- New identity/mapping publish only after transaction completion for the originating session; later edits stay dirty.
- Dialog actions validate session/dataset/revision and are disabled during operations.

## Lifecycle and errors

- Repository close invalidates pending opens; a late IndexedDB connection is closed and cannot resurrect the session.
- versionchange closes the connection, disables reopen, and reports a reload-required state without discarding the live map.
- Save/Open errors map quota, application cap, unavailable IDB, schema/version mismatch, blocked, transaction abort, and inconsistent attachment states to actionable messages.
- In-memory editing remains available when persistence is unavailable.
- beforeunload only evaluates committed dirtiness/editor draft and requests warning; it does not destroy resources or close storage. Non-persisted pagehide performs explicit teardown; persisted/BFCache pagehide does not. No async unload save.
- Teardown invalidates operation tokens, closes repository, closes dialogs, and prevents stale publication.

## Accounting/deletion

Existing P1a accounting is preserved: actual attachment rows, orphan retain-and-count, atomic reconciliation/mutations, metadata-only Blob reuse, Delete→Save→Undo→Save reinsertion, and current-map usability after deleting its saved copy. No background compaction or unload GC.

## Unified editor Save (r50)\n\n- Form Save now applies then persists the current map; toolbar Save routes to the open form. Success closes only after transaction completion. Validation/candidate failure keeps draft; applied-but-unsaved state keeps mutation/history and offers Retry Save/Close. See evidence/editor/unified-save.txt for tested/gap status.\n\n## Verification corrections (r46)

- Actual main-entry warning test verifies attachment count/tree/graph remain usable after requesting the warning, then Save and dirty-editor draft warning still work; draft value preserved and Cancel works.
- Blocked opening: recoverable state is separated from permanent unavailability; on successful open it clears and controls refresh. Blocked library Close now cancels the pending open through the repository; late success closes without publishing, and a subsequent Open retries successfully. Native blocked arbitration remains **NOT RUN**.
- Upgrade transaction failure/rollback and blocked-upgrade closure remain **NOT RUN**; the current test double cannot faithfully model them. No production version bump/migration was introduced.

## Verification

- Persistence suite: see current run.
- P2 lifecycle tests: 9/9 (usage/persist outcomes, pending-open close, onOpenSuccess ownership, blocked success/cancel/retry, versionchange, fresh/reopen/current schema, newer-version rejection).
- P1b actual main-entry 70/70: duplicate Save, stale conflict Cancel/Reload/Save-as-copy, blocked state, usage/persist, beforeunload, Add Data/Open/viewer/recovery.
- Full tests/engine: 943/944 (1 skipped: fake IndexedDB concurrency limit) (current run).
- Native browser: **NOT RUN**.

## Test-double limitations

The IndexedDB double models requests, staged readwrite transactions, abort/rollback, upgrade creation/reopen, indexes, and versionchange. It does not model native quota, blocked-upgrade arbitration, cross-tab transaction serialization, crash durability, eviction, or private-mode behavior. Native browser verification remains NOT RUN.

## Deferred

- P3 Download/Upload backup.
- Folder-first large-map exploration work.
- Any autosave, cloud/native/filesystem integration, or UI redesign.






















































