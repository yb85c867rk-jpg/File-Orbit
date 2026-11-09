# Rename Map R4 test hooks

These globals exist only for deterministic rendered OPFS verification. They are not product controls and are absent in normal operation.

- `__M5_RENAME_PERMISSION_OVERRIDE__`: `granted` / `denied` test permission result.
- `__M5_RENAME_FORCE_ADOPTION_FAILURE__`: injects adoption failure after disk success.
- `__M5_RENAME_FORCE_UNCERTAIN__`: `acknowledged` or other truthy value converts a completed rename into `post-removal-uncertain` for UI recovery testing.
- `__M5_RENAME_BEFORE_REMOVE_GATE__`: `{ promise, release }` pauses immediately before the adapter’s pre-removal ownership check.
- `__M5_RENAME_AFTER_REMOVAL_GATE__`: `{ promise, release }` pauses immediately after a successful adapter removal.
- `__M5_RENAME_AFTER_ADOPTION_BASELINE_GATE__`: `{ promise, release }` pauses after the adoption baseline was confirmed but before the final ownership recheck and application of the handle.

The browser tests use disposable OPFS directories and generated `.orbit` files. They never use OntoMap or user source directories.

- `__M5_RENAME_CALLS__`: optional `{create,write,remove}` counters incremented at the wired adapter’s physical call boundaries. Tests initialize it before a rename and assert the final counts.

- `__M5_EDITOR_DIAGNOSTIC__`: populated for every editor outcome. The schema is `fileorbit-editor-outcome-v1` and records `action`, `stage`, `reason`, `changed{name,description,link}`, `appliedRetained`, `revisionEqual`, `dirty`, `baseline{handleBound,identityBound,state,operation}`, and `write{confirmed,decoded}`. Stages: `admission` (early exit), `apply` (command failed or `no-change` no-op), `verify` (written bytes unverified or decoded mismatch), `saved` (decoded destination matched the applied edit). It never contains description text, filenames, paths or live handles. Applied-edit recovery Save As uses the same schema: `stage:'picker'` with `reason:'cancelled'` for a cancelled picker, `stage:'verify'` with `write-unverified`/`destination-changed` when the write cannot be confirmed, and `stage:'saved'` with `reason:'save-as-verified'` when the decoded destination matches the applied edit and ownership still holds after the asynchronous read.
- `__M5_SAVE_ENCODE_FAILURE__`: intentionally fails the next document encode to exercise applied-unsaved editor recovery without touching a destination file.
- `__M5_EDITOR_CONFIRM_MISMATCH__`: makes the editor’s post-write confirmation report a decoded-content mismatch after a successful write baseline, exercising the deferred Save As finalization path without corrupting the destination.
- `recoveryCheckpoint()`, `recoveryState()`, `flushRecovery()`: read the current recovery checkpoint/workspace diagnostics for tR4 checks; the applied-edit Save As keeps that checkpoint until the decoded destination and ownership are confirmed.
- `deferNextRecoveryRetirement()` / `releaseRecoveryRetirement()`: pause the next recovery retirement; `__M5_RETIREMENT_PENDING__` is `true` while the deferred retirement is awaited (used to switch documents after decoded verification but before success/finalization).
- `deferNextEditorAbandon()` / `releaseEditorAbandon()`: pause the applied-edit Save As reservation abandon; the gate exposes `started` so a document switch can be injected after decoded-content failure but before failure feedback.
- `failNextOrbitListing(reason, owner?)`: fails the next Map Library enumeration with the given reason (`enumerate-failed`, `permission-denied`) to verify that the last valid list is retained with actionable feedback. When `owner` is given, only an enumeration of the directory with that name fails, so a delayed startup restore can be raced against a Library switch.
- `deferOrbitRefresh()` / `releaseOrbitRefresh()`: pauses the next Map Library enumeration and counts deferred calls (`calls`) so a delayed refresh can be raced against a Library selection; a stale refresh must not replace the newer list.
- `setMapLibraryPermissionStateForTest(permission)`: restores the active Library handle with the given permission state (`denied`, `prompt`) to verify Reconnect availability without a native prompt.
- `deferOrbitBindingCheck()` / `releaseOrbitBindingCheck()` / `orbitBindingCheckState()`: pause the save-destination binding verification after the identity/name resolution snapshot; a document or Library switch can be injected before the write so a stale save must abort without writing.
- `requestAutomaticSaveForTest()`: requests the real automatic-save path (non-interactive conflict handling) after a test edit; `automaticSaveForTest()` uses the same non-interactive options for direct invocation.
- `selectLibraryForTest(id)`: selects a Library from the collection through the normal selection path, used to verify that a map opened from Library A stays bound to A while Library B is selected.
