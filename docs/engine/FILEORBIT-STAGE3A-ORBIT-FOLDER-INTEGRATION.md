# FileOrbit — staged integration and stale folder-browser correction

## Inputs verified

- UI candidate: `fileorbit-orbit-folder-browser-r169.zip`
  - SHA-256: `B81A2A00FD48279626A3438756C2E740CB3D3BB51EA74DBD874DFB395F712C77`
- Stage 3A candidate: `fileorbit-stage3a-edition-context-r169.zip`
  - SHA-256: `42798B1DD4BAEFBD611D13B6EDD0C3C876C2F878FFC6E414BB6468E2AD0F0C39`

**Correction to the prior report:** Stage 3A has passed review within its defined scope. It is not “unreviewed.” The prior UI report has been corrected; this combined candidate includes reviewed Stage 3A.

## Integration/preservation matrix

| Area | UI candidate | Stage 3A candidate | Combined reconciliation |
|---|---|---|---|
| Orbit Folder browser | Added | — | Retained unchanged |
| Search blue/PDF red | Added | — | Retained unchanged |
| LOD colors | Added | — | Retained unchanged |
| Edition context | — | Added | Copied: `edition/context.js`, `edition/index.js` |
| Snapshot/codec/backup context | — | Added | Copied: `node-limit.js`, `codec.js`, `backup.js`, `persistence/index.js` |
| Stage 3A tests/helper/doc | — | Added | Copied unchanged |
| Baseline archives | Preserved | Preserved | Both zip archives retained |
| Accepted free baseline | Not changed | Not changed | Preserved |
| Normal app free-only 300 | Yes | Yes | Yes |
| Paid capacity | — | Internal test context only | Internal test context only |

No overlap/conflict existed in the changed production files: Stage 3A modifies edition/persistence files untouched by the UI candidate. UI, renderer, search, harness, and LOD files were retained from the UI candidate.

## Late initial permission correction

`openFileBrowser()` now captures, before awaiting `queryReadPermission`:

- dialog request id;
- persistence session id;
- dataset token;
- listing sequence;
- dialog ownership (`fileOpenBrowser.owns(session, dataset)`).

The predicate is `browserRequestIsCurrent(...)`. No path, snapshot, status, busy, or listing mutation occurs after the await unless the request still owns the dialog/session/dataset/listing sequence.

- Loading starts before the permission await; Cancel remains enabled.
- Successful stale result: discarded.
- Failed/denied stale result: discarded.
- A stale completion cannot clear a newer operation's busy state.
- Session/dataset replacement closes the obsolete dialog without overwriting newer state.
- Other awaits audited: `chooseFolderForBrowser`, `listBrowserPath`, navigation/refresh, and `connectBrowserFolder` already reject stale request/session/dataset before committing; listing sequence guards asynchronous enumeration.

## Deferred-response browser evidence

Actual Edge headless dialog controls with deferred `queryPermission` promises:

- Open connected Old with pending permission: `Current folder: Old`, busy true.
- Cancel, connect New, open New with pending permission: New busy true.
- Resolve Old's granted response late: remains New, busy true; stale completion did not clear New's busy.
- Resolve New: New ready, `new.orbit` listed.
- Re-open Old with pending read, cancel, show New, then resolve Old as denied: remains New with `new.orbit`; no denial replacement.
- Committed connection remains New.

Evidence: `evidence/orbit-stale/deferred-evidence.json`; runner: `deferred-evidence2.mjs`.

Ownership predicate test: `tests/engine/exploration/folder-browser-request.test.mjs` covers close/reopen, newer listing sequence, session replacement, dataset replacement, and dialog ownership.

## Tests on combined tree

- Combined targeted: **136/136 PASS**, exit 0.
- `p1b-main`: **69/69 PASS**, exit 0.
- Complete free regression: **1,214 tests, 1,213 pass, 1 skip, 0 fail**, exit 0.
  - Remaining: 1,145 tests, 1,144 pass, 1 skip.
  - Skip: pre-existing fake-IndexedDB overlapping-readwrite case; native IndexedDB serialization NOT RUN.
- Stage 3A boundary/round-trip suite is included and passing (9/9 within targeted set).
- UI/color/LOD tests retained and passing.

## PASS / FAIL / NOT RUN

**PASS**
- Reviewed Stage 3A integrated without dropping UI work or tests.
- Stale late permission success/denial rejected.
- Busy state owned by newer operation.
- Close/reopen and session/dataset invalidation.
- Orbit Folder UI behavior and search/PDF/LOD colors.
- Stage 3A boundaries, package round trip, full regression.

**FAIL**
- None in executed checks.

**NOT RUN**
- Native OS directory picker/permission prompts (stubbed handles used).
- Collapsed-sidebar modal measurement.
- Full PDF Save As/reopen UI path.
- Browser-level newer-folder-choice race and full dataset-replacement race (predicate tests and session-close logic cover the ownership conditions; deferred browser evidence covers close/reopen and late success/denial).
- Stage 3B, paid Upload, cloud, Tauri, enterprise, deployment, publishing.

## Preservation

- Accepted free baseline: `E7608F387E5A9676CEF8F908B77241A26469ADCFB5889D00B4795FFDD6ADA441`
- UI archive preserved: `B81A2A00FD48279626A3438756C2E740CB3D3BB51EA74DBD874DFB395F712C77`
- Stage 3A archive preserved: `42798B1DD4BAEFBD611D13B6EDD0C3C876C2F878FFC6E414BB6468E2AD0F0C39`
