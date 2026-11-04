# orbit-only-main failure evidence

## Original first-run failure (transcribed from the Stage 1B-2 full-run output)

- Exact test file: `tests/engine/exploration/orbit-only-main.test.mjs`
- Exact test name: `only .orbit files are listed, opened, downloaded, and old extensions are rejected before replacement`
- Test status: FAIL (exit 1)
- Failing assertion in spawned lifecycle runner:
  - expected: `/Only \.orbit files are supported/`
  - actual: `Opened alpha.orbit; the file changed outside FileOrbit. Saving requires a conflict decision.`
- Wrapper assertion:
  - actual: `1`
  - expected: `0`
- This was the first Stage 1B-2 full run, before the clean rerun.

Provenance: the original temporary full-run log was removed during workspace cleanup. This file preserves the exact test identity and assertion text captured from that run. It is not reconstructed execution output for unrelated lines.

## Observed Stage 1B-2 baseline reproduction

A separate run of the same test against the unmodified archived Stage 1B-2 baseline also failed:
- See `baseline-orbit-only.txt`.
- Reproduced exact assertion and actual status message.
- This is an observed reproduction, not an assumed cause.
- The failure is intermittent; a later baseline run passed. No claim is made about its root cause.

## Interpretation

- The clean Stage 1B-2 rerun is not evidence that this intermittent failure was fixed.
- It remains an unresolved, separate lifecycle-test issue.
- It is not part of the runtime node-count consistency correction and was not refactored here.
