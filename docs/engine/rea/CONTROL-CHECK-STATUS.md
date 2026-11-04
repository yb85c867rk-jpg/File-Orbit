# REA control check — status

- Date: 2026-10-25
- Script: `tools/rea-control/rea-control.ps1`
- Control file: `tools/rea-control/control/app.js` (`export const answer = 42;`)
- **Execution status in the agent environment: NOT RUN** by design.
- Reason: the earlier REA `analyze-javascript-application` failed at `source-transfer` with `EPERM`; this task explicitly forbids repeating the blocked execution or changing security settings.
- Script syntax check: PowerShell parser OK (see `evidence/rea-control/script-parse.txt`).
- Script self-test: **NOT RUN in the agent environment**. The host blocks unsigned local `.ps1` execution and process creation (`Start-Process` returned `Access is denied`). The synthetic fixtures are prepared for a normal user terminal.
- No global install, no `rea setup`, no MCP registration, no ACL/security changes.

## Behavior

- common guards run before normal mode or `-SelfTest`: authorized root, working directory, Windows, non-administrator, markers, reparse points;
- rejects reparse-point paths and extra files;
- normalizes the control source to exactly `export const answer = 42;`;
- copies that one file into an isolated per-run `evidence/<timestamp>/input/` directory and analyzes only that directory;
- retains at most `-MaxCaptureChars` (default 65536) of combined stdout/stderr;
- termination is bounded: `taskkill /PID <owned-pid> /T /F` has its own wait timeout, and its result is verified separately;
- root termination and **verified tree termination** are separate; `TIMEOUT`/`OUTPUT_LIMIT` does not prove all descendants stopped;
- output-cap/timeout self-test PASS requires the expected event, confirmed root termination, and `TreeTerminationConfirmed=false`; negative root-unconfirmed fixtures must not PASS;
- every owned fixture uses `finally` cleanup with retained child identities; cleanup is appended separately and cannot turn a failure into PASS;
- when an expected child identity is unavailable, known-parent cleanup is still attempted; parent outcome and child-ownership uncertainty are reported separately, with overall `Confirmed=false`;
- self-test uses a unique `selftest-runs/<runid>/` directory, refuses collisions, preserves it on failure, and removes only that run's directory on success;
- restores process-scoped environment variables in `finally`.

## User-terminal instructions

```powershell
cd C:\Users\openw\Documents\Projects\visual-directory
Unblock-File .\tools\rea-control\rea-control.ps1   # optional
powershell.exe -NoProfile -File .\tools\rea-control\rea-control.ps1
```

Synthetic process self-test (no REA):

```powershell
powershell.exe -NoProfile -File .\tools\rea-control\rea-control.ps1 -SelfTest
```

Normal non-administrator terminal only. Do not run elevated. If local-script execution policy blocks it, use a process-scoped `-ExecutionPolicy RemoteSigned` for that one command; do not change machine policy.

## Result interpretation

- `PASS`: CLI exit 0 and `parsed_javascript_files >= 1`.
- `INVENTORY_ONLY`: CLI exit 0 but no parsed JavaScript; analysis unverified.
- `OUTPUT_LIMIT`: retained-output cap reached; owned process tree termination was attempted but `treeTerminationConfirmed` must be checked.
- `FAIL`/`TIMEOUT`: preserve evidence; unresolved; do not loop or escalate.
- `nodeSupport=engines-only` means Node satisfies npm engines but not its **series-specific** documented minimum (22→22.23.4, 24→24.22.1, 26→26.12.1); do not call it documented-compatible.

Return `tools/rea-control/evidence/<timestamp>/summary.json` and `analysis.stdout.json`.
