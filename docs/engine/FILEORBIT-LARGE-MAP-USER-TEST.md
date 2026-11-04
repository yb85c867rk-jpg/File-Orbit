# FileOrbit large-map user test — reviewer notes

Test entry: `tests/harness/large-map/index.html`.

- Default free context at 300 total nodes.
- Explicit internal paid-test context only when 1,000 is selected; not production paid activation.
- Colors/formats supplied by promoted modules: search path `#60A5FA`, edge opacity `0.55`, PDF filename/type badge `#F87171`, icon-free labels.

## Preview samples

- PNG is a valid 1×1 PNG scaled up for visibility; browser `naturalWidth` verified 1.
- PDF is a minimal valid PDF with page/text objects, xref and trailer; browser embed present and bytes start `%PDF`.
- Text and zero-byte attachments retained.

## Graph and search

- Graph clicks use adapter `labelAtPoint`/`hitTest`; one listener on the stable `#lod` parent, no per-mount accumulation.
- Search Previous/Next/Clear are separate from folder/cluster pagination.
- Search state resets on mount/unmount/replacement; preview DOM is cleared before runtime disposal/URL revocation.

## Evidence separation

- Automated technical checks: `evidence/large-map/corrected-execution.json`.
- Human usability feedback: pending, not yet collected. No feedback is invented.
- Native picker/disk: NOT RUN.

## Prototype limitations

- No Save/Open or writable destination integration in this prototype.
- No editing/Undo/Redo controls.
- No folder Upload/cloud/Tauri/enterprise.
- One mounted LOD stage expected; repeated mount disposes previous runtime.
