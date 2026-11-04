# FileOrbit Stage 3B — edition-aware repository and recovery capacity\n\n> Corrected candidate: see FILEORBIT-STAGE-3B-CORRECTION.md. The correction fixes cross-context replacement bypasses and recovery-context inheritance; test totals below are superseded by the correction report.

## Baseline and policy

Baseline: `fileorbit-stage3a-orbit-folder-r169.zip`
SHA-256 verified:
`C6DB7C9F3D57B2E25451E8D93390D576B9DB18F25A735EE7AAB530529E2B26AB`

Stage 3B reuses the reviewed Stage 3A issued internal contexts:
- default/omitted: free, 300 nodes;
- explicitly injected paid test context: 1,000 nodes;
- lower context/caller budgets tighten;
- higher budgets cannot elevate;
- missing/malformed/unknown contexts fail closed.

Authority is never read from saved records, document metadata, URL, localStorage, license fields, or UI state. No global paid flag exists. The normal application remains free-only at 300 nodes and does not inject a paid context.

## Context flow

Repository construction:
`createPersistenceRepository({ policyContext })`
→ `resolvePolicyContext` (issued context validation)
→ repository-owned context
→ save/load/remove boundaries
→ recovery repository construction with the same context.

Snapshot save:
`buildSaveSnapshot`/`ownSaveSnapshot` (Stage 3A)
→ repository `assertSnapshot(snapshot, repositoryPolicyContext)`
→ actual/declared count and attachment checks
→ fixed transaction.

Repository load:
map/document record validation
→ context capacity decision
→ actual tree count validation and metadata/attachment consistency
→ result.

Recovery:
`buildRecoverySnapshot({ policyContext })`
→ `ownValidatedRecoverySnapshot(..., { policyContext })`
→ recovery checkpoint save with repository context
→ checkpoint load with the same context before tree/attachment materialization.

## Operation boundary matrix

| Operation | Free default | Paid test | Oversize behavior | Cross-context behavior |
|---|---:|---:|---|---|
| `buildSaveSnapshot` / own | 300 | 1,000 | `node-limit` | Stage 3A inherited context |
| repository `save` | 300 | 1,000 | `node-limit`, no write | Free repository rejects paid-size snapshot |
| repository `load` | 300 | 1,000 | `node-limit` before tree adoption | Paid record untouched |
| repository `remove` | 300 | 1,000 | `node-limit`, no deletion | Paid record/generation untouched |
| repository `list` | all metadata | all metadata | — | No deletion or rewrite |
| usage / `repairUsage` | counts all rows | counts all rows | — | Paid attachment bytes still counted |
| `buildRecoverySnapshot` / own | 300 | 1,000 | `node-limit` | Paid snapshot context preserved |
| recovery checkpoint save | 300 | 1,000 | `node-limit` | Free cannot rewrite paid checkpoint |
| recovery checkpoint load | 300 | 1,000 | explicit `node-limit`, not corruption | Paid checkpoint retained |
| recovery usage | counts all rows | counts all rows | — | Paid recovery bytes counted |
| runtime/layout | unchanged free | not activated | Stage 3B does not expand runtime | Out of scope |

Recovery checkpoint structural validation no longer applies a hard free-size maximum; capacity is a separate context decision. This is why a paid-size checkpoint under free returns `node-limit`, not `recovery-checkpoint-invalid`.

## Integrity results

Paid 1,000-node repository round trip:
- Nested folders and long Korean names.
- Text/image/PDF and zero-byte attachments.
- IDs/topology/names/descriptions compared by traversal.
- Actual SHA-256 for all four attachment payloads.
- Free `load`/`remove` rejected with `node-limit`; paid generation still loads.
- Free `list` retains the metadata record.
- `usage`/`repairUsage` retain paid attachment bytes.

Recovery:
- Paid 1,000-node checkpoint saved and loaded.
- Free checkpoint load returns `node-limit`.
- Paid checkpoint generation remains loadable afterward.
- Free `combinedUsage` counts recovery bytes; recovery candidate remains listed.
- Free 300 checkpoint accepted; paid 1,001 snapshot rejected.

Declared/actual mismatch:
- Forged paid snapshot count is rejected by ownership with `node-count-mismatch`.

Transaction/stale/claims:
- Existing transaction rollback, generation, stale-write, claim, cancellation, and concurrent-operation tests remain in the suite; no database version/schema change was made.

## Changed files

- `src/engine/hypertree/persistence/repository.js`
- `src/engine/hypertree/persistence/recovery-repository.js`
- `src/engine/hypertree/persistence/recovery-codec.js`
- `src/engine/hypertree/persistence/recovery-schema.js`
- `tests/engine/persistence/stage3b-repository-context.test.mjs`
- this report

No Orbit format change.
No database version change.
No stored schema change.
Attachment limits remain 20 MiB/file and 100 MiB/map.

## Preservation

- Orbit Folder browser + stale-request protection retained.
- Search paths `#60A5FA`, edge opacity `0.55` retained.
- PDF filename/badge `#F87171` retained.
- LOD harnesses and Stage 3A tests retained.
- Stage 3A policy context remains internal; paid access is not activated in the normal app.

## Tests

- Focused Stage 3B/repository/recovery suite: **84 tests, 83 pass, 1 skip, 0 fail**, exit 0
  - Skip: pre-existing fake-IndexedDB overlapping-readwrite case; native IndexedDB concurrency remains NOT RUN.
- Complete free regression: **1,219 tests, 1,218 pass, 1 skip, 0 fail**, exit 0
  - p1b-main: 69/69
  - Remaining: 1,150 tests, 1,149 pass, 1 skip

Fresh logs: `evidence/stage3b/`.

## PASS / FAIL / NOT RUN

**PASS**
- Free 299/300, paid 999/1,000 repository save/load.
- 301/1,001 rejection.
- Malformed context and cross-context rejection.
- Paid round trip with nested folders, Korean names, four payload types, exact topology and SHA-256.
- Free load/remove rejection preserving paid data and usage.
- Paid recovery checkpoint round trip.
- Free recovery rejection preserving paid checkpoint and accounting.
- Existing transaction/claim/stale/cancellation guards retained.
- Fresh focused and complete free regression.

**FAIL**
- None in executed focused/full tests.

**NOT RUN**
- Native browser IndexedDB concurrency/durability; FakeIndexedDB only.
- Runtime/layout and main-app paid admission.
- Paid UI, read-only/downgrade/expiry/export permissions.



