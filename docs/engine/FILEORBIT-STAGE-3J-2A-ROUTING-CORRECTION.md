# FileOrbit Stage 3J-2A — runtime access routing correction

## Baseline

Preserved exact:
`.stage3j2a-baseline/fileorbit-stage3j2a-runtime-access-r169.BASELINE.zip`
SHA-256: `5A9E9246884B52F6FF84512B84ABAA6049AE1FDF7A3C645E08DCA73D9494552D`

## 1. History-toolbar routing

Both `createHistoryToolbarController` initialization paths now use:

- `getHistory: () => runtimeAccess.history()`
- `run: direction => runtimeAccess.move(direction)`

No toolbar path calls `performHistoryMove` directly or reads raw history.

## 2. Serialization routing

Runtime access now exposes:

- `serializationState()` — live tree, registry, revision;
- `encode(options)` — authoritative live state plus caller destination/encoding options;
- `stats()` — routing counters.

Actual main call sites:

- `downloadBackup()` reads `runtimeAccess.serializationState()` and passes those values into the existing `encodeBackup` destination/encoding flow.
- `saveCurrentDocument()` reads `runtimeAccess.serializationState()` for the existing `.orbit` encoding flow.
- Save remains distinct from repository snapshots (`runtimeAccess.snapshot()`).
- Copy Map continues using its captured `snapshotCopyAttachments()` result.
- Recovery backup preview continues using captured `preview.tree` / `preview.registry`.

Writable handles, disk baselines, conflict, cancellation, Retry and destination adoption remain in main.

## 3. Tests

- Routing contract static check:
  - 2 toolbar constructors use runtime access;
  - no direct toolbar history/performHistoryMove bypass;
  - download and saveCurrentDocument use `serializationState` then existing encodeBackup;
  - Copy Map/recovery captured snapshots remain intentional.
- Runtime access stats/test verifies live provider state.
- `p1b-main`: 69/69 PASS.
- Full free regression: **1,286 tests, 1,285 pass, 1 skip, 0 fail**
  - Remaining: 1,217 tests, 1,216 pass, 1 skip.
- Earlier Copy Map unsupported/coalition runs exposed flaky `copy.disabled true` and isolated failures; final clean rerun passed. Cause remains unconfirmed.

## 4. Browser evidence

Ordinary PC application shell in Edge:

- title FileOrbit; hasMap false; editor closed; errors 0.
- screenshot `ordinary-app-shell.png`.

Native picker/disk acceptance NOT RUN. No LOD activation.

## Limitations

- LOD substitution not implemented.
- Runtime replacement/install still main-owned; boundary covers live access, revision/history/save serialization and disposal.
- Browser shell only; no full Open/Save native scenario.
- Copy Map/recovery encapsulated snapshots intentionally bypass live serialization for captured-operation semantics.

## PASS / FAIL / NOT RUN

**PASS**
- Both toolbar paths routed.
- Download and Save current-document serialization use live boundary state.
- Copy Map/recovery captured semantics preserved.
- p1b-main and full free regression.
**FAIL**
- None in final clean run.
**NOT RUN**
- LOD substitution; native picker/disk acceptance; full browser Open/Save.
