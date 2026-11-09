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
