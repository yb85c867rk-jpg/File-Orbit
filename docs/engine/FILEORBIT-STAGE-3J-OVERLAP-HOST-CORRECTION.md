# FileOrbit Stage 3J — overlapping saves and document-host ownership correction

## Baseline

Previous correction:
`fileorbit-stage3j-integration-correction-r169.zip`
SHA-256: `AC48CE1016EEFAF9ED09565112E9C50378D08BC878318DD8E6DE2BEFDC8B634A`

Preserved. This is a separate candidate.

## 1. Overlapping saves

Saves are now serialized/coalesced per document:

- If a save is in flight for the same runtime revision, a duplicate call returns the **same promise**.
- If the runtime revision advanced during save, the next save waits for the active save, revalidates the same document, then starts from the updated generation/baseline.
- A successful earlier write is acknowledged; a later failed request cannot erase it.
- `docToken`, runtime, mapId, generation, and captured revision remain bound to the originating document.
- Switch/close completions return `stale-operation` and do not mutate another document.

Exact reproduced schedule now covered:
1. Generation 1.
2. First save writes storage generation 2; response is delayed.
3. Second save begins while first response is pending.
4. It coalesces to the same save (or waits then retries after an edit).
5. First response is acknowledged; session generation/baseline become 2.
6. Subsequent save succeeds at generation 3.

## 2. Document host ownership

`runtimeFor` no longer reuses the original bootstrap host.

Open/switch document publication now:

1. creates the replacement runtime on a **fresh staging host**;
2. uses the **current live host** (which may be a post-edit host) as the replacement target;
3. replaces the live host in the DOM;
4. updates session live host/runtime;
5. disposes the old runtime only after successful publication;
6. removes staging resources and preserves the old document/DOM on failure.

Browser evidence after edit → Open B:

- one `.lod-stage`;
- one canvas;
- session host === runtime host;
- app runtime host === session runtime host;
- DOM live stage === runtime host;
- previous edited host is detached and is not the current host;
- browser errors 0.

## 3. Harness integration

The dedicated paid-test harness now uses `createStage3JSession` for mount/open/Save As/reopen and host publication. Normal app startup remains free; the paid bootstrap explicitly injects the internal context.

**Still not complete:** the ordinary PC main/picker orchestration, writable-handle baseline, and unsaved Save/Discard/Cancel UI are not rewired. This remains a dedicated harness, not the ordinary PC main. Native OS picker acceptance is NOT RUN.

## Tests

- Deferred first save writes generation 2, response delayed; duplicate save coalesces; both acknowledge; subsequent retry succeeds.
- Save A → switch B → complete A: stale; B untouched.
- Save A → close → complete A: stale.
- Edit during save: captured revision acknowledged; dirty remains true; next save retries.
- Conflict: stale-generation; generation preserved.
- Cancelled Save As: no state change.
- Free/paid all-shape opens, Save As/reopen, attachment SHA.
- Picker/invalid-file preservation.
- Host publication actual browser.

## Final totals

- Focused Stage 3J + runtime: **21 tests, 21 pass, 0 fail**
  - Stage 3J session: 7/7 PASS
- `p1b-main`: **69/69 PASS**
- Complete free regression: **1,280 tests, 1,279 pass, 1 skip, 0 fail**
  - Remaining: 1,211 tests, 1,210 pass, 1 skip
- Skip: pre-existing FakeIndexedDB overlapping-readwrite case; native IndexedDB concurrency NOT RUN.

## Browser evidence

- Save As → reopen through session;
- Open B after edit with host replacement;
- one connected live stage/canvas;
- session/runtime/DOM ownership match;
- editing/navigation/search/preview/Undo/Redo;
- attached-host rollback;
- unmount: 0 frame / 0 preview;
- errors 0.

Screenshots include `07-host-switch.png`.

## Limitations

- **Ordinary PC main/picker orchestration remains unconnected.** Dedicated harness only.
- **Native OS picker acceptance NOT RUN.**
- **Unsaved Save/Discard/Cancel, writable-handle baseline, and external-content baseline UI not reproduced.**
- **App-level 301/1,001 rejection not newly exercised through UI**; retained capacity tests cover.
- **Conflict/retry/failed-save UI not fully exercised**; session-level conflict/cancellation covered.
- Folder Upload/cloud/recovery UI not claimed.
- PDF/FPS/native IndexedDB NOT RUN.

## Changed files

- `src/app/stage3j/session.js`
- `tests/harness/stage3j/*`
- `tests/engine/persistence/stage3j-session.test.mjs`
- `evidence/stage3j-overlap-host-correction/*`
- `docs/engine/FILEORBIT-STAGE-3J-OVERLAP-HOST-CORRECTION.md`

## PASS / FAIL / NOT RUN

**PASS**
- Overlapping/duplicate save coalescing and acknowledgement.
- Generation/baseline recovery and subsequent retry.
- A→B/close/edit/conflict ownership guards.
- Fresh staging host publication against current live host.
- Browser host ownership after edit → Open B.
- Full free regression.

**FAIL**
- None in executed checks.

**NOT RUN / LIMITATIONS**
- Ordinary PC main/picker integration.
- Native picker.
- Unsaved Save/Discard/Cancel and writable-handle UI.
- App-level 301/1,001 UI.
- Conflict/retry/failed-save UI.
- Folder Upload/cloud/recovery UI.
- PDF/FPS/native IndexedDB.
