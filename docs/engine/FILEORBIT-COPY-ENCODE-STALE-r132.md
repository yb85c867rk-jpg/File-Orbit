# Copy Map stale encoding correction — r132

## Defect

`copyCurrentMap()`'s `encodeBackup` rejection path called `setShellStatus('Copy Map could not prepare the copy: …')` without checking the captured operation/document/session/dataset ownership. A deferred encoding rejection after a replacement session therefore overwrote the replacement feedback (`NEW SESSION`).

## Correction

- The encoding rejection path now checks `current()` before publishing failure feedback.
- Obsolete encoding rejection returns `{ ok:false, stale:true }` and leaves replacement feedback, dialogs, focus, and controls untouched.
- The temporary attachment snapshot registry is cleared in the existing `finally` for every path.
- The create-file and write exceptions were audited and now also recheck ownership before publishing failure feedback.
- Existing picker and preflight asynchronous paths already checked ownership before feedback; that ownership is unchanged.
- Orbit refresh after a matching destination is invoked with deferred status, so a stale refresh cannot replace replacement feedback; the final success status is published only while the operation remains current.
- Current-request encoding rejection still reports `Copy Map could not prepare the copy: …`.

Toolbar placement and sidebar simplification are unchanged. Copy/adoption/Save semantics are unchanged.

## Regression tests

Actual-main tests with deterministic deferred SHA-256 encoding:
1. deferred encoding → session replacement (`NEW SESSION`) → encoding rejection;
2. deferred encoding → destroy → encoding rejection;
3. deferred encoding → session replacement → successful encoding completion;
4. current request → encoding rejection.

Assertions include unchanged replacement feedback, replacement document handle/tree/dirty/savedRevision/baseline/attachment registry, unchanged source state for current failure, destroyed state, no destination entry or writer, and temporary registry release.
Markers: `COPY_MAP_ENCODE_SESSION_COMPLETE`, `COPY_MAP_ENCODE_DESTROY_COMPLETE`, `COPY_MAP_ENCODE_SUCCESS_COMPLETE`, `COPY_MAP_ENCODE_CURRENT_COMPLETE`; each with a bounded watchdog.

## Verification

- Focused Copy Map/Orbit/Open/automatic Save/document-adapter/backup suites: 74/74 passed.
- Full engine: 1097 tests, 1096 passed, 1 skipped, 0 failed.
- Native filesystem acceptance: **NOT RUN**. Synthetic handles are not native filesystem evidence.

No database reset, original user-file modification, dependency installation, commit, push, deployment, server shutdown, or OntoMap/MORAN-DCP change.
