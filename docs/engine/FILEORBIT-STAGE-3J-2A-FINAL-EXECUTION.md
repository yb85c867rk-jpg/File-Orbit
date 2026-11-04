# FileOrbit Stage 3J-2A — final execution validation

## Baseline

Preserved exact:
`.stage3j2ae-baseline/fileorbit-stage3j2a-execution-validation-r169.BASELINE.zip`
SHA-256: `93089BB96B592CA1C6C6AC7F6F1434FA199CEA2CA5EB224F943950B95BC39ADF`

## Writable execution setup

`STAGE3J_ROUTING` now:

- sets `__M5_LEGACY_PERSISTENCE_HARNESS__ = false`;
- installs both `showOpenFilePicker` and `showSaveFilePicker` stubs;
- uses a synthetic writable `.orbit` handle.

## Actual execution test

A single main-harness run exercises real controls:

1. Create Map through the Create dialog with a real attachment.
2. Edit root through the editor form; close applied form.
3. Toolbar Undo → Redo; `runtimeAccessStats().move` increases ≥2; content restored.
4. Click `#download-backup`; capture generated Blob; decode it:
   - edited root name;
   - `note.txt` attachment bytes `routing`;
   - runtime serialization tree counter advanced.
5. Save As success:
   - synthetic writable handle, write count 1;
   - destination handle adopted;
   - decoded package has edited content;
   - runtime serialization counter advanced.
6. Writable Save:
   - edit to `Routing Saved`;
   - current handle write count 2;
   - decoded package has edited content and attachment.
7. Save As picker cancellation:
   - AbortError before encoding;
   - handler, document identity, dirty state and bytes unchanged;
   - no encoding-counter requirement.
8. Cleanup.

## Other validation

- Snapshot live revision → `capturedRevision`; caller cannot override.
- Real encode/decode test with valid tree/registry and explicit failure.
- `p1b-main`: 69/69 PASS.
- Full free regression: **1,288 tests, 1,287 pass, 1 skip, 0 fail**
  - Remaining: 1,219 tests, 1,218 pass, 1 skip.
- Copy Map flake retained; final clean rerun passed.

## Totals

- Focused contract/routing/execution: 6/6 PASS.
- Machine summary: `1288/1287/1`, report matched.

## Limitations

- Native OS picker/disk acceptance NOT RUN; synthetic adapters only.
- LOD substitution not implemented.
- Browser evidence is ordinary shell only.

## PASS / FAIL / NOT RUN

**PASS**
- Writable Save current handle.
- Save As success/destination/content.
- Save As cancellation preservation.
- Download Blob decode/content/attachment.
- Toolbar Undo/Redo routing.
- Full free regression.
**FAIL**
- None in final clean run.
**NOT RUN**
- Native picker/disk.
- LOD substitution.
