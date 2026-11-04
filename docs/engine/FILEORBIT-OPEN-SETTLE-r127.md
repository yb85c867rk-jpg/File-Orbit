# Integrated Open lifecycle correction — r127

## Reviewer failure reproduced

Exact r126 archive:

- SHA-256: `76CE53C76538448846E620142243F384A3577E917CA37FF01D8BB401941CE19C`
- Extracted under the workspace so normal dependency resolution was used.
- Standalone run could pass, but under parallel load the exact archive failed at the pre-fix immediate reopen assertion:
  `main-harness-init-runner.mjs:1770` — `Boolean(browser()) === false`.
- Reproduction evidence: `file-open-nav-r126-archive-repro.txt`.
- Instrumented exact-archive run: `file-open-nav-r126-old-debug.txt`.

Instrumented failure state:

- Open button: `disabled:false`, `clickCount:2`;
- shell status: `Finish the current save, open, or backup operation first.`;
- handle: `alpha-copy.map`; Orbit: `Empty Orbit`;
- `persistenceBusy:null`, `documentSaving:false`.

Cause: the standalone Open install had set the handle, but `installingBackupImport` was still true. The old test waited for `!snapshot().busy && !pendingImportState().pending`; it did not wait for `pendingImportState().installing`. The click therefore reached `openFileBrowser` while the previous install was still active. The product correctly refused to start another Open and preserved the current document. This was an asynchronous test-settling defect, not an integrated Open behavior defect.

## Correction

- No production Open behavior changed.
- The test now waits for the meaningful lifecycle state:
  - `Opened …` status;
  - `pendingImportState().pending === false`;
  - `pendingImportState().installing === false`;
  - `openState().block === null`;
  - Open control enabled.
- After clicking, it waits for the reopened browser and an enabled Refresh control before asserting content or refreshing.
- Legacy Open also waits for Open availability and the dialog before clicking.
- No arbitrary sleep and no weakened Refresh/Open assertions were added.
- Test wording changed to **“keeps Settings theme-only”**; obsolete “keeps Settings Save changes” wording removed.

## Verification

- Failing suite alone, final files: 2/2 passed.
- Parallel load stress, final files: 72/72 passed.
- Relevant combined suites: recorded in `autosave-regression-r127.txt`.
- Relevant combined suites: 106/106 passed — `autosave-regression-r127.txt`.
- All exploration suites: 449/449 passed — `file-open-nav-r127-all-exploration.txt`. The reviewer's 161-test focused set is a different suite selection; counts are reported by exact suite set, never conflated.
- Exact r127 archive: main/runner hashes match disk; failing suite 2/2; 72/72 parallel stress.
- Full engine, final files: 1087 tests, 1086 passed, 1 skipped, 0 failed — `autosave-full-r127-final2.txt`.
- R1/R2 markers still complete: `AUTO_EDITOR_R1_COMPLETE`, `AUTO_CONFLICT_R2_COMPLETE`.

## Previous zero-failure discrepancy

The earlier r126 full-suite run executed a different, pre-r127 test file set in one process and did not reproduce this load-sensitive child-runner timing. That zero-failure result does not validate the final files. The reviewer’s focused standalone run exposed the missing install-lifecycle wait. The exact r126 archive was extracted and run; it passed standalone here but failed at line 1770 under 8 concurrent loops. The test was corrected and the full suite was repeated against the final files.

Synthetic main-entry tests are not native filesystem evidence. Native picker/write/keyboard checks remain NOT RUN.
