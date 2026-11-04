# FileOrbit Stage 3J-2A — manual Save execution correction

## Baseline

Preserved exact:
`.stage3j2af-baseline/fileorbit-stage3j2a-final-execution-r169.BASELINE.zip`
SHA-256: `4FFE42287B7B524389D5DF005D968ACDA6C0DB7C4B8DBA7D497C2ACAF777EA4B`

## Corrected toolbar Save scenario

The STAGE3J_ROUTING execution test now:

1. disables automatic save for the manual-save segment;
2. edits root to `Routing Saved` and closes the applied editor form;
3. calls `hooks.touch()` and waits until `dirty === true`;
4. captures writes, closes, serialization counters and bytes immediately before the click;
5. clicks the actual `[data-action="save-map"]` toolbar control;
6. requires a **new** write and close (`writes + 1`, `closes + 1`);
7. requires serialization tree counter to increase;
8. decodes the new package and asserts `Routing Saved` plus `note.txt` bytes;
9. asserts `dirty === false` and handle unchanged.

This removes the prior false positive where the editor had already saved.

## Save As cancellation

Now tested while dirty:

- `hooks.touch()` establishes dirty state;
- synthetic picker is invoked and counted;
- `AbortError` is thrown before encoding;
- handle, document identity, existing bytes and `dirty === true` are preserved;
- no encoding counter requirement.

## Other execution coverage retained

- Create Map and editor edit.
- Toolbar Undo/Redo with move counter and content restore.
- `#download-backup` click, captured Blob, decoded edited content and `note.txt` bytes, serialization counter.
- Save As success with destination adoption, write count and decoded content.
- Writable Save current handle.

## Totals

- Focused contract/routing/execution: 6/6 PASS.
- `p1b-main`: 69/69 PASS.
- Full free regression: **1,288 tests, 1,287 pass, 1 skip, 0 fail**
  - Remaining: 1,219 tests, 1,218 pass, 1 skip.
- Copy Map flake retained; final clean rerun passed.

## Limitations

- Native OS picker/disk acceptance NOT RUN; deterministic synthetic adapters only.
- LOD substitution not implemented.
- Browser evidence is ordinary shell only.

## PASS / FAIL / NOT RUN

**PASS**
- Toolbar Save with dirty precondition, new write/close, counters, decoded content, clean state.
- Save As cancellation with picker invocation and dirty preservation.
- Save As success, download, history execution.
- Full free regression.
**FAIL**
- None in final clean run.
**NOT RUN**
- Native picker/disk.
- LOD substitution.
