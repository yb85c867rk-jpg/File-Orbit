# FileOrbit Stage 3J-2A — runtime execution validation

## Baseline

Preserved snapshot-routing baseline SHA:
`3AF111E02F1A6F2111C967E760836BE86214959248C354FD45E9255C87FEB248`

## Executable routing test

Added `STAGE3J_ROUTING` branch in `main-harness-init-runner.mjs` and
`stage3j2a-execution.test.mjs`.

It starts from the ordinary empty application and uses the actual controls:

1. Create Map through the actual Create dialog.
2. Open root editor and rename through the form.
3. Click toolbar Undo → Redo.
4. Assert `runtimeAccessStats().move` advanced by at least 2 and tree content restored.
5. Invoke Download and assert the serialization tree access counter increased.

The runner exits non-zero on any assertion, so this is runtime-executed routing,
not source-regex evidence.

**Still not covered by execution:** writable Save, Save As success/cancellation.
Repeated attempts to drive Save As through the synthetic picker did not write,
so no passing execution evidence is claimed for those paths. Static call-site
tests and existing main integration tests cover their routing shape only.

## Snapshot/encoding correction

- `runtimeAccess.snapshot()` maps live revision to `capturedRevision` and blocks
  caller override of tree/registry/revision.
- Real `buildSaveSnapshot` tests cover omitted/stale caller revision and live
  replacement state.
- Encoding test now uses a valid tree/registry, decodes output and asserts
  content; invalid registry failure asserted separately.

## Totals

- Executable routing test: 1/1 PASS.
- Focused contract/routing/execution tests: 6/6 PASS.
- `p1b-main`: 69/69 PASS.
- Complete free regression: **1,288 tests, 1,287 pass, 1 skip, 0 fail**
  - Remaining: 1,219 tests, 1,218 pass, 1 skip.
- Copy Map flake retained; final clean rerun passed.

## Limitations

- Writable Save and Save As execution routing are **NOT RUN**; only static/main regression coverage.
- Native picker/disk acceptance NOT RUN.
- LOD substitution not implemented.
- Browser evidence is ordinary shell only.

## PASS / FAIL / NOT RUN

**PASS**
- Actual Create/edit/toolbar Undo/Redo/download routing.
- Snapshot revision mapping and real encode/decode.
- Full free regression.

**FAIL**
- None in final clean run.

**NOT RUN**
- Actual writable Save execution routing.
- Actual Save As success/cancellation execution routing.
- Native picker/disk; LOD substitution; full browser Open/Save.
