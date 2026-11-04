# FileOrbit Stage 3J — integration correction and save ownership

## Baseline

Stage 3J candidate:
`fileorbit-stage3j-pc-integration-r169.zip`
SHA-256: `24A833028D387196D40FB5E41FE77953BFF16F6AD5E78B07252CB2EA57308B79`

Preserved. This is a separate corrected candidate.

## 1. Session integrated into the dedicated harness

`tests/harness/stage3j/app.mjs` now:

- imports and uses `createStage3JSession`;
- mounts by opening an encoded `.orbit` backup through `session.openBackup`;
- no longer creates `createEditableLodRuntime` directly;
- no longer directly saves/loads the seeded fixture as the runtime authority;
- retains the promoted runtime only through `session.current.runtime`;
- adds **Open Orbit** file input and **Save As** controls;
- supports browser round trip through the same session (Save As → open backup → new runtime).

The dedicated paid-test bootstrap explicitly creates the internal paid context. Normal app startup remains free and unchanged.

One current document/session/runtime is authoritative. Open replaces it only after decode/save/load/runtime preparation succeeds; the old runtime is disposed after the new one is installed.

## 2. Asynchronous save ownership

Each opened/reopened document gets a private monotonic `docToken`, `savedRevision`, generation/baseline, and save sequence.

`save()` captures:

- originating document token;
- runtime object;
- mapId;
- generation;
- revision;
- save operation sequence.

After awaiting repository completion it requires:

- same current document token/runtime;
- not disposed;
- latest save operation.

An old completion returns `stale-operation`/`superseded` and does not mutate any generation, baseline, dirty state, destination, or UI state.

Edits during save:
- snapshot/acknowledge only the captured revision;
- `savedRevision` is set to the captured revision;
- `isDirty` remains true when the runtime revision advanced during save.

`saveAs()` binds to the originating document/runtime/revision; a switch/close/edit during encoding returns `stale-operation` and does not alter state. Save As cancellation returns `backup-cancelled` without mutation.

`close()` invalidates all pending completions and disposes the current runtime.

## 3. Deterministic tests

- save A → switch B → complete A → `stale-operation`; B generation unchanged.
- save A → close → complete A → `stale-operation`.
- edit during save → saved revision acknowledged; `isDirty` true.
- competing saves → superseded/stale; no cross-document mutation.
- cancelled Save As → no state change.
- external save/conflict → `stale-generation`; generation preserved.
- all-shape free 300 / paid 1,000 opens.
- Save As/reopen with rename/add/Undo/Redo and attachment SHA-256.
- picker cancellation and invalid `.orbit` preserve live document.

## Browser evidence

Dedicated harness, actual controls:

- mount opens an encoded `.orbit` through the session;
- Save As control produces a new `.orbit`;
- round-trip reopens it through the session;
- map identity changes for Save As destination semantics;
- LOD navigation/paging/search/preview;
- rename/edit/add/delete, Undo/Redo;
- attached-host rollback;
- full unmount cleanup: frame 0 / preview 0;
- browser errors 0.

This is browser routing/harness evidence, not native OS picker acceptance.

## Final totals

- Focused Stage 3J + runtime: **20 tests, 20 pass, 0 fail**
  - Stage 3J session: 6/6 PASS
- `p1b-main`: **69/69 PASS**
- Complete free regression: **1,279 tests, 1,278 pass, 1 skip, 0 fail**
  - Remaining: 1,210 tests, 1,209 pass, 1 skip
- Skip: pre-existing FakeIndexedDB overlapping-readwrite case; native IndexedDB concurrency NOT RUN.

Machine summary generated from final logs and verified.

## Limitations

- **The normal PC application’s main/picker orchestration is still not rewired.** The dedicated paid-test harness uses the promoted session and protected `.orbit` codec/repository, but it is not the ordinary PC main.
- **Native OS picker acceptance is NOT RUN.**
- App-level 301/1,001 rejection remains covered by retained capacity/runtime tests, not newly through the harness UI.
- Unsaved-document Save/Discard/Cancel and writable-handle/external-content-baseline UI are not fully reproduced; session-level cancellation/conflict/ownership is covered.
- External-modification conflict UI, retry UI, and failed-save UI are not fully exercised in browser.
- Folder Upload/cloud/recovery UI completion not claimed.
- PDF/FPS/native IndexedDB NOT RUN.

## Changed files

- `src/app/stage3j/session.js`
- `tests/harness/stage3j/app.mjs`
- `tests/harness/stage3j/index.html`
- `tests/harness/stage3j/browser-evidence.mjs` + evidence
- `tests/engine/persistence/stage3j-session.test.mjs`
- `evidence/stage3j-correction/*`
- `docs/engine/FILEORBIT-STAGE-3J-INTEGRATION-CORRECTION.md`

## PASS / FAIL / NOT RUN

**PASS**
- Session wired into dedicated harness mount/open/save controls.
- Async save ownership/token guards and deferred-completion tests.
- Save A→B, close, edit-during-save, competing saves.
- Save As cancellation, conflict, invalid input.
- Browser Save As/reopen and controls.

**FAIL**
- None in executed checks.

**NOT RUN / LIMITATIONS**
- Normal PC main/picker rewiring.
- Native picker acceptance.
- Full unsaved Save/Discard/Cancel UI.
- App-level 301/1,001 UI scenarios.
- Conflict/retry/failed-save UI.
- Folder Upload/cloud/recovery UI.
- PDF/FPS/native IndexedDB.
