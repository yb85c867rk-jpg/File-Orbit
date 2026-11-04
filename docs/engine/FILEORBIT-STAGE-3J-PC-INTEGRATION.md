# FileOrbit Stage 3J — controlled PC integration slice

## Baseline

Stage 3I:
`fileorbit-stage3i-promoted-runtime-r169.zip`
SHA-256: `249394284AB9C2DD3346E4D7C9DF357E03C452327433087F5D8745C045EC70A2`

Preserved. Stage 3J is a separate candidate.

## Integration slice

Dedicated internal paid-test entry point:

`tests/harness/stage3j/index.html`

It uses the promoted production runtime and protected persistence/backup modules:

- open an existing `.orbit` backup (`decodeBackup`);
- save to the repository;
- load the admitted document;
- create the editable LOD runtime;
- Save As (`encodeBackup`) and reopen.

Production session/controller:

`src/app/stage3j/session.js`

- accepts an explicitly issued policy context;
- no URL, localStorage, document metadata, or global paid flag;
- no analysis/import dependency;
- no paid-context construction in production source;
- uses `createPersistenceRepository`, `buildSaveSnapshot`, `decodeBackup`, `encodeBackup`, and `createEditableLodRuntime`.

The normal application remains free and unchanged at 300. The paid test harness explicitly creates an internal paid context; this is not commercial licensing.

## Context flow

`policyContext` is supplied to:

1. `.orbit` decode;
2. save-snapshot validation/build;
3. repository save/load;
4. runtime admission and actual node counting;
5. editor commands/history through the promoted runtime;
6. attachment verification and retention;
7. Save As encoding.

The first slice supports:

- open existing `.orbit` → LOD navigation/search/preview;
- editing/Undo/Redo;
- Save As → reopen;
- document identity/generation;
- picker cancellation/stale/invalid input handling at the session boundary;
- failed save preservation.

Document switching disposes the previous runtime only after the new document/runtime is prepared. Open failure preserves the live document; the same session owns one authoritative runtime.

## Tests

- Free 300 and paid 1,000 opens for all five fixture shapes.
- Save As/reopen round trip.
- Rename + add + Undo/Redo before Save As.
- Attachment SHA-256 preserved across save/reopen.
- Picker cancellation: live document preserved.
- Invalid `.orbit` input: live document preserved.
- Runtime tests (ownership/no-op/presentation/host rollback/attachments) retained.

## Browser evidence

Actual controls in the dedicated harness:

- LOD navigation/paging/search/preview;
- rename/edit/add/delete;
- Undo/Redo;
- no-op;
- real attachment addition/preview;
- attached-host rollback;
- full unmount cleanup;
- errors 0.

This is browser routing/harness evidence, not native OS picker acceptance.

## Launch instructions

From the candidate root:

```powershell
python -m http.server 8154 --bind 127.0.0.1 --directory .
```

Windows Chrome/Edge URL:

`http://127.0.0.1:8154/tests/harness/stage3j/index.html`

No deployment/publishing is performed.

## Final execution totals

- Focused Stage 3J session + runtime: **17 tests, 17 pass, 0 fail**
  - Stage 3J session: 3/3 PASS
- `p1b-main`: **69/69 PASS**
- Complete free regression: **1,276 tests, 1,275 pass, 1 skip, 0 fail**
  - Remaining: 1,207 tests, 1,206 pass, 1 skip
- Skip: pre-existing FakeIndexedDB overlapping-readwrite case; native IndexedDB concurrency NOT RUN.

Machine-readable summary is generated from final logs and verified.

## Limitations

- The slice is exercised through a dedicated harness entry point; the normal PC application's existing native picker/main orchestration was not replaced or rewired in this candidate.
- Native OS picker acceptance is **NOT RUN**; only browser routing/harness evidence is provided.
- Free/paid 1,001 rejection at the full app boundary relies on retained Stage 3G/runtime tests; no new 1,001 fixture was opened through the harness.
- External modification/conflict UI and failed-save UI are not fully exercised in browser; session-level stale/failed-save preservation is covered by source contracts but not every UI path.
- Folder Upload/cloud import/recovery UI completion not claimed.
- PDF rendering, FPS, native IndexedDB concurrency NOT RUN.
- No Upload/cloud/payments/Upgrade/Tauri/enterprise/deployment/publishing/OntoMap.

## Changed files

- `src/app/stage3j/session.js`
- `tests/harness/stage3j/*`
- `tests/engine/persistence/stage3j-session.test.mjs`
- `evidence/stage3j/*`
- `docs/engine/FILEORBIT-STAGE-3J-PC-INTEGRATION.md`

No normal-app paid/LOD activation.

## PASS / FAIL / NOT RUN

**PASS**
- Dedicated paid-test harness with issued context.
- `.orbit` decode/admit/runtime/Save As/reopen session.
- All-shape 300/1,000 open.
- Attachment SHA round trip.
- Cancellation/invalid input preservation.
- Browser editing/navigation/search/preview/Undo/Redo/rollback/unmount.
- Full free regression.

**FAIL**
- None in executed checks.

**NOT RUN / LIMITATIONS**
- Native OS picker acceptance.
- Normal PC application main/picker rewiring (not replaced in this candidate).
- Full app-level 1,001 rejection browser scenario.
- Conflict/failed-save UI browser paths.
- Folder Upload/cloud/recovery UI completion.
- PDF/FPS/native IndexedDB.
