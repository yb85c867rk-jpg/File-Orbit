# FileOrbit Stage 3J — session lifecycle correction

## Baseline

Previous Stage 3J correction:
`fileorbit-stage3j-overlap-host-correction-r169.zip`
SHA-256: `46BC1D0A4F162B6903E87AAB95BA70EE79F6F3D77A6D1BD3403FB243E2877DCC`

Preserved. This is a separate candidate.

## 1. Stale Open completion after document switching

`openBackup` carries a monotonically increasing operation token. Publication checks the token and disposed state immediately before install.

`switchDocument` now:

- rejects if disposed;
- increments the operation token **before** allocating runtime/host;
- installs B with its token;
- invalidates any older pending Open.

A delayed C completion after B switch returns `stale-operation` without touching B’s runtime, DOM, selection, dirty state, identity, or save destination.

## 2. Document installation after closure

- `switchDocument` rejects with `disposed-session` before runtime/host allocation.
- `installDocument` rejects disposed sessions.
- `openBackup` returns `disposed-session` instead of installing.
- `current` remains null; no resource resurrection.

## 3. Tests

- Deferred `repository.load(C)` → switch B → release C: C returns `stale-operation`; B runtime/tree preserved and usable.
- `close()` → `switchDocument(B)`: `disposed-session`; current null.
- Existing overlapping-save, host publication, Save As/reopen, conflict, cancellation, all-shape open tests retained.

## Final totals

- Focused Stage 3J + runtime: **23 tests, 23 pass, 0 fail**
  - Stage 3J session: 9/9 PASS
- `p1b-main`: **69/69 PASS**
- Complete free regression: **1,282 tests, 1,281 pass, 1 skip, 0 fail**
  - Remaining: 1,213 tests, 1,212 pass, 1 skip
- Skip: pre-existing FakeIndexedDB overlapping-readwrite case; native IndexedDB concurrency NOT RUN.

## Browser evidence

Dedicated harness controls:

- Open A → edit (host replacement) → Save As/reopen;
- one connected live stage/canvas;
- session/runtime/DOM host ownership match;
- editing/navigation/search/preview/Undo/Redo;
- attached-host rollback;
- unmount: 0 frame / 0 preview;
- errors 0.

Screenshots: `01-mounted.png` … `07-host-switch.png`.

## Remaining integration limitation — ordinary PC application still not connected

The requested ordinary PC main/picker orchestration remains incomplete:

- `tests/harness/m5-exploration/main.mjs` is unchanged and does not consume the Stage 3J session/runtime.
- The Stage 3J dedicated harness still uses a file input and anchor download; it is not the reviewed writable-handle Open/Save/Save As flow.
- Unsaved Save/Discard/Cancel, writable-handle/external-content baseline, conflict/retry UI, and document-replacement guards from the ordinary app are not integrated.
- Native OS picker acceptance NOT RUN.
- App-level 300/301 and 1,000/1,001 UI scenarios are not newly exercised; retained capacity/runtime tests cover boundaries.
- Fixture mounting is still used to seed the harness; Save As/reopen in browser uses the session `.orbit` path.

This candidate corrects the two lifecycle defects but does **not** complete ordinary PC application integration.

## Changed files

- `src/app/stage3j/session.js`
- `tests/engine/persistence/stage3j-session.test.mjs`
- `tests/harness/stage3j/*` (existing session/host harness)
- `evidence/stage3j-lifecycle-correction/*`
- `docs/engine/FILEORBIT-STAGE-3J-LIFECYCLE-CORRECTION.md`

## PASS / FAIL / NOT RUN

**PASS**
- Stale Open completion rejected after switch.
- B runtime/DOM/selection/identity preserved.
- switchDocument after close rejected without runtime resurrection.
- Overlapping-save and host-publication corrections retained.
- Full free regression.

**FAIL**
- **Ordinary PC application/main-picker integration remains incomplete.**

**NOT RUN / LIMITATIONS**
- Ordinary PC main/picker integration.
- Native picker acceptance.
- Writable-handle Save/Save As and unsaved Save/Discard/Cancel.
- App-level 301/1,001 UI.
- Conflict/retry/failed-save UI.
- Folder Upload/cloud/recovery.
- PDF/FPS/native IndexedDB.
