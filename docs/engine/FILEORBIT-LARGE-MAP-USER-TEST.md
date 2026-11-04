# FileOrbit large-map user test — reviewer notes

Test entry: `tests/harness/large-map/index.html`.

- Default free context at 300 total nodes.
- Explicit internal paid-test context only when the tester selects 1,000; this is not production paid activation.
- Colors/formats are supplied by promoted modules: search path `#60A5FA`, edge opacity `0.55`, PDF filename/type badge `#F87171`, icon-free graph labels.

## Separation of evidence

- Technical observations from automated Edge smoke and fixture count checks are recorded in `tests/harness/large-map/README.md`.
- Human usability feedback must be recorded separately after the user runs the checklist. No feedback is invented here.
- Native picker/disk checks remain NOT RUN.

## Prototype limitations

- No Save/Open or writable destination integration in this prototype.
- No editing/Undo/Redo controls exposed in this test viewer.
- No folder Upload/cloud/Tauri/enterprise.
- One mounted LOD stage is expected; repeated mount disposes the previous runtime.
