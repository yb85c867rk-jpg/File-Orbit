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
