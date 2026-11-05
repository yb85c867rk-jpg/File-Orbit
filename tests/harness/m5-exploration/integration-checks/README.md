# Executable PC integration checks

Requires the local server on port 8164 and Edge.

- `paid-edit-check.mjs`: opens paid-test 1,000, activates a folder, edits a file via the ordinary editor, saves through a deterministic Save As handle, asserts tree and presentation agreement, Undo and Redo. Run:

```powershell
node tests/harness/m5-exploration/integration-checks/paid-edit-check.mjs
```

- `tests/harness/large-map/admission.test.mjs`: free 300 edit allowed, free 301 rejected, paid 1,000 edit allowed, 1,001st child rejected.

```powershell
node --test --test-isolation=none tests/harness/large-map/admission.test.mjs
```

These use test hooks/picker stubs, not native OS acceptance.

- `breadcrumb-check.mjs`: paid-test 1,000, expands `cat-1`, opens nested folder, clicks middle ancestor `01_기획`; asserts focus returns to `cat-1`. Evidence: `integration-breadcrumb.json`.

- `search-check.mjs`: actual app search controls for root file, first-level folder, nested folder and nested file; asserts focus, selected ID and Details. Evidence: `integration-search-routing.json`.
- `blocked-navigation-check.mjs`: dirties an editor form, clicks Back and Root, asserts focus/selection/history/camera unchanged. Evidence: `integration-blocked-navigation.json`.
