# FileOrbit — orbit-only lifecycle failure resolution

Status: **resolved at the test-fixture/test-readiness layer**. No application source change. Free-only 300-node limits remain unchanged.

Baseline: `fileorbit-paid-1000-stage1b2-consistency-r169.zip`
Baseline SHA-256 verified:
`C0EC01ACD69893ECE63B8D0F2665F5C2C1CCDE182897794B7757846FA3695581`

## 1. Root cause

The failure was produced by combined test-fixture and test-readiness defects, not by extension rejection or conflict protection.

### A. False external modification

The `ORBIT_ONLY` branch replaced `window.showOpenFilePicker` with:

```js
{ name: 'alpha.orbit', async getFile() {
  return new File([fixtures.packageBytes], 'alpha.orbit', { type: 'application/x-orbit' });
} }
```

No `lastModified` was supplied. `File` defaults it to the current clock value, so each `getFile()` produced a new timestamp.

Code locations:
- `tests/engine/exploration/main-harness-init-runner.mjs` — `ORBIT_ONLY` picker stubs (old `new File(...)` construction)
- `tests/harness/m5-exploration/orbit-file-baseline.js` — opened-content metadata comparison
- `tests/harness/m5-exploration/main.mjs` — `resumeBackupImport()` changed-status branch
- `tests/engine/exploration/main-harness-init-runner.mjs` — `ORBIT_ONLY` and `ORBIT_R1` readiness waits

Observed sequence:
1. Initial open read `alpha.orbit` and captured an opened-content baseline at timestamp T1.
2. `documentState().handleName` became `'alpha.orbit'` before asynchronous opened-content verification completed.
3. Post-install `verifyOpenedContentBaseline()` called `getFile()` again and received timestamp T2.
4. `orbit-file-baseline.js` correctly classified the metadata difference as `changed` before hashing.
5. The application correctly set `Opened alpha.orbit; the file changed outside FileOrbit. Saving requires a conflict decision.`

This was a false external-change signal created by the fixture, not a real file change.

### B. Test proceeded before opening completed

The test waited only for:

```js
hooks.documentState().handleName === 'alpha.orbit'
```

Handle identity becomes observable during installation, while `persistenceBusy` is still set. The subsequent `legacy.map` / `legacy.fileorbit` attempts then raced the tail of the alpha open.

A controlled experiment with stable timestamps but the original wait produced:

`Finish the current save, open, or backup operation first.`

That confirmed the test was clicking legacy attempts before the open operation had settled. The observed conflict status could then remain from the earlier alpha verification instead of being replaced by the legacy-extension rejection.

### C. Stale-callback assessment

`resumeBackupImport()` has a busy guard and ownership checks. Once the fixture timestamp was stable and the test waited for busy completion, no stale alpha completion overwrote the legacy rejection. No stale-feedback overwrite was reproduced. The global notification design and application ownership code were therefore not changed.

## 2. Minimal fix

Only `tests/engine/exploration/main-harness-init-runner.mjs` changed.

- Replaced the ad-hoc `new File(...)` picker stubs with `makeFakeOrbitFile()`.
  - `makeFakeOrbitFile().getFile()` returns stable bytes and an explicit stable `lastModified`.
  - Its existing `replace(nextBytes, nextLastModified)` method remains the separate explicit external-change operation.
- Added a completion wait after handle identity is observed:
  - no `persistenceBusy`
  - no `pendingImport`
  - no `installingImport`
- Retained the legacy extension attempts and their `/Only \.orbit files are supported/` expectation.
- Added the same completion wait to the `ORBIT_R1` ownership scenario before capturing B's baseline. The affected-suite run exposed the same readiness issue: B's asynchronous verified baseline arrived after the snapshot. This is test-readiness only and does not change B ownership assertions.
- Added preservation assertions after each rejection:
  - same tree
  - same attachment bytes
  - same handle identity
  - same origin
  - same dirty state
  - same history state/undo/redo snapshot

No arbitrary sleep was added. The existing `waitFor` predicate is used. The test was not skipped, retried, or weakened.

Application source is untouched. No layout, paid access, format, notification, or deployment changes.

## 3. Conflict protection remains intact

- Unchanged synthetic picker content now opens without a false conflict.
- Genuine external changes remain protected by existing `orbit-file-baseline` tests:
  - post-install content change -> `changed`
  - metadata-only change -> `changed` without hashing
  - preflight overwrite -> conflict
- The explicit fixture `replace(nextBytes, nextLastModified)` path models a real external change without mutating open-time metadata accidentally.

## 4. Repeated runs

Fixed repetition count: **12 separate Node processes per batch**, three retained batches.

### Batch 1 — initial stable-fixture + completion wait
`evidence/orbit-only-repetitions/summary.txt`
- 12/12 PASS, exit 0.

### Batch 2 — after preservation assertions
`evidence/orbit-only-repetitions-final/summary.txt`
- 12/12 PASS, exit 0.

### Batch 3 — final verification-completion wait
`evidence/orbit-only-repetitions-final2/summary.txt`
- 12/12 PASS, exit 0.

Total: **36/36 PASS**, every run a separate Node process. Every per-run log is retained. No run was discarded.

## 5. Tests

### Affected opening/conflict suites (fresh)

| Run | Tests | Pass | Fail | Exit |
|---|---:|---:|---:|---:|
| ORBIT_ONLY, baseline/conflict, automatic save, ownership, save-copy, open workflows | 55 | 55 | 0 | 0 |

### Complete free regression (fresh)

| Run | Tests | Pass | Skip | Fail | Exit |
|---|---:|---:|---:|---:|---:|
| p1b-main | 69 | 69 | 0 | 0 | 0 |
| Remaining | 1,103 | 1,102 | 1 | 0 | 0 |
| **Aggregate** | **1,172** | **1,171** | **1** | **0** | **0** |

The skip is the pre-existing fake-IndexedDB recovery serialization case. Native IndexedDB serialization remains NOT RUN.

## 6. PASS / FAIL / NOT RUN

**PASS**
- Root-cause reproduction and isolation.
- Stable synthetic bytes/metadata.
- Completion wait before legacy attempts and before baseline snapshots.
- Valid `.orbit` open.
- Legacy `.map` / `.fileorbit` rejection.
- Tree, attachment bytes, handle, origin, dirty state, and history preservation.
- Existing genuine external-conflict tests.
- 36/36 repeated ORBIT_ONLY runs across three 12-run batches.
- Affected opening/conflict suites: 55/55.
- Complete free regression: 1,172 tests, 1,171 pass, 1 skip, 0 fail.
- No application source change; free-only 300-node behavior unchanged.

**FAIL**
- None in the final affected or full runs. The earlier R1 baseline-snapshot readiness failure is retained in `evidence/orbit-fix-suites/affected-first-failure.txt`; it was resolved by waiting for B's verification completion, not by weakening assertions.

**NOT RUN**
- 1,000-node layout/render/browser support.
- Paid admission/read-only/expiry/downgrade.
- Paid UI/entitlement/accounts/payment/cloud/deployment.
- Tablet/phone.

This is not 1,000-node application support.



