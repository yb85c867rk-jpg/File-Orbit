# FileOrbit Stage 3J-2A — authoritative snapshot and routing correction

## Baseline

Preserved exact Stage 3J-2A routing baseline:
`.stage3j2a-baseline/fileorbit-stage3j2a-runtime-access-r169.BASELINE.zip`
SHA-256: `5A9E9246884B52F6FF84512B84ABAA6049AE1FDF7A3C645E08DCA73D9494552D`

Correction baseline:
`fileorbit-stage3j2a-routing-correction-r169.zip` SHA `0EB2148B14FA5F1EBF69BDCED5D22CE200910222A30C453D4392B7E87C74ACD7`.

## 1. Snapshot revision mapping

`runtimeAccess.snapshot()` now captures live tree, registry and revision together and maps:

`live revision → capturedRevision`

Caller-supplied `tree`, `registry`, `revision`, or `capturedRevision` cannot override authoritative state. Main’s save caller no longer supplies those fields.

Real `buildSaveSnapshot` tests prove:
- omitted caller revision succeeds with provider revision 4;
- caller `capturedRevision: 0`, wrong tree, wrong registry cannot override;
- replacement tree/registry/revision are read live;
- resulting snapshot has correct `capturedRevision`.

## 2. Serialization routing

- Both toolbar initialization paths use `runtimeAccess.history()` / `.move()`.
- `downloadBackup()` and `saveCurrentDocument()` obtain `runtimeAccess.serializationState()` before existing `.orbit` encoding.
- `saveActiveMap()` uses `runtimeAccess.snapshot()` with no independent tree/registry/revision fields.
- Copy Map continues using captured `snapshotCopyAttachments()`.
- Recovery backup preview continues using captured `preview.tree` / `preview.registry`.

## 3. Tests

- Routing/source checks remain supplemental.
- Real snapshot mapping tests added.
- Real encoding tests use a valid tree/registry, require encode success, decode output and assert content; invalid registry failure asserted separately.
- `p1b-main`: **69/69 PASS**
- Full free regression: **1,287 tests, 1,286 pass, 1 skip, 0 fail**
  - Remaining: 1,218 tests, 1,217 pass, 1 skip.
- Copy Map flake retained: earlier runs showed copy disabled / original destination collision failures; isolated and final clean runs passed. Cause unconfirmed.

## 4. Remaining limitations

- **No actual runtime-executed main routing test was added.** Static call-site checks + provider contract tests prove routing shape, but toolbar click/save/download execution through main is not independently asserted with counters in this correction.
- LOD substitution not implemented.
- Runtime install/replacement remains main-owned.
- Native picker/disk acceptance NOT RUN; browser shell only.

## PASS / FAIL / NOT RUN

**PASS**
- Snapshot live revision maps to capturedRevision; caller cannot override.
- Real encode/decode test with valid state and explicit failure.
- Toolbar/save/download routing shape.
- p1b-main and full free regression.
**FAIL**
- None in final clean run.
**NOT RUN**
- Actual main execution routing counters.
- LOD substitution; native picker/disk; full browser Open/Save.
