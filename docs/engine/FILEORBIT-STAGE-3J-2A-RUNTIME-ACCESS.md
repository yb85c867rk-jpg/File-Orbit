# FileOrbit Stage 3J-2A — PC runtime access boundary

## Baseline

Preserved exact baseline:
`.stage3j-baseline/fileorbit-stage3j-lifecycle-correction-D445.BASELINE.zip`
SHA-256: `D445CBE17AA69B2F0A93F638DB383D5F866B9A8DD281D9AD5AE7212FD643E669`

Stage 3J-1 candidate SHA verified: `DF617AEEED15D2486A851345A6E4CF4A8C4F521C86DE1F14E49B60B34E712982`.

## Runtime contract

New module:
`src/app/pc/runtime-access.js`

`createPcRuntimeAccess` exposes live operations only:

- `tree()` / `registry()` / `revision()` / `history()` / `state()`;
- `advanceRevision()`;
- `move(undo|redo)`;
- `snapshot(options)` for save-snapshot construction;
- `dispose(runtime)`.

The module retains no copied document state. Every read is a callback into main’s authoritative live variables.

## Actual main call sites

`tests/harness/m5-exploration/main.mjs`:

- imports `createPcRuntimeAccess`;
- creates one access object bound to live `tree`, `attachmentRegistry`, `dataRevision`, `history`;
- all four edit/replacement revision increments call `runtimeAccess.advanceRevision()`;
- history toolbar reads `runtimeAccess.history()` and performs `runtimeAccess.move(direction)`;
- save snapshot construction uses `runtimeAccess.snapshot()` with live tree/registry/revision;
- recovery runtime disposal calls `runtimeAccess.dispose(runtime)`.

## Ownership map

Authoritative state remains in main:

- `tree`, `attachmentRegistry`, `dataRevision`, `history` — one owner each;
- replacement/install operations, replacement guards, conflict, Retry, picker, writable handles, recovery orchestration — existing main code;
- Stage 3J-1 `activeDocument` / `activeMap` metadata ownership remains in `document-ownership.js`.

Runtime access is a boundary over those owners, not a second controller. `createStage3JSession` is not instantiated.

## Behavior

- Renderer/runtime path unchanged.
- Free 300 behavior unchanged.
- No LOD activation, paid activation or format change.
- Save/Open/Save As/unsaved/conflict/Retry/attachment behavior preserved.

## Tests

- Runtime access contract: live access, revision advance, history move, snapshot, disposal.
- Document ownership contract retained.
- `p1b-main`: 69/69 PASS.
- Full free regression: **1,284 tests, 1,283 pass, 1 skip, 0 fail**.
  - Remaining: 1,215 tests, 1,214 pass, 1 skip.
- Earlier Stage 3J-1 serial run had one Copy Map original-destination-collision failure (`1 !== 0`); isolated Copy Map passed and clean reruns passed. Cause remains unconfirmed; retained as flaky evidence.

## Browser evidence

Ordinary PC application shell loaded in Edge:

- title FileOrbit;
- hasMap false, editor closed, no errors;
- screenshot `ordinary-app-shell.png`.

Native OS picker/disk acceptance NOT RUN. No adapter-stubbed open/save acceptance in this step.

## Limitations

- LOD substitution not implemented.
- Runtime installation/replacement remains in existing main; this boundary exposes access, revision/history/save integration and disposal, not a new install controller.
- Browser shell only; no full Open/Save control browser scenario.
- No native picker/disk acceptance.
- No paid activation.

## PASS / FAIL / NOT RUN

**PASS**
- Live runtime access with no copied state.
- Revision/history/save/disposal calls routed.
- Stage 3J-1 metadata ownership retained.
- p1b-main and full free regression.
**FAIL**
- None in final clean run.
**NOT RUN**
- LOD substitution.
- Native picker/disk acceptance.
- Browser Open/Save workflow.
