# FileOrbit Paid 1,000 — Stage 1B-1 review packet

Status: **Stage 1B-1 only**. Free-only integration of the central policy into creation and editor admission. No paid behavior, persistence/layout integration, entitlement, or UI.

Baseline: `fileorbit-paid-1000-stage1a-contract-r169.zip`
Baseline SHA-256 verified:
`4B36225C1963B256544AA1991E49DCFD1A2FB53BEFB4FD39C7AF354BE3D71D90`

## 1. Changed files and API compatibility

### Application source changed
| File | Change |
|---|---|
| `src/engine/hypertree/editor/validation.js` | `EDITOR_MAX_NODES` now derives from `EDITION_NODE_LIMITS.free`; editor admission/add-child use explicit `edition:'free'` policy decisions. |
| `src/engine/hypertree/exploration/create-map.js` | Resolves an explicit free node budget through policy; uses the effective limit for preview/final checks. |
| `src/engine/hypertree/exploration/directory-selection.js` | Resolves an explicit free node budget through policy; default is the central free limit. |

### Tests added
- `tests/engine/edition/edition-consumers.test.mjs` — free integration boundaries, lower budgets, attempted elevation, folder/file counting, preview/final agreement, editor admission/add, no mutation.

### Documentation
- Requirements/architecture/plan reflect Stage 1B-1 free-only integration.
- Historical Stage 1A report is marked historical.
- This report.

### API compatibility
- `EDITOR_MAX_NODES` remains a public numeric export with value **300**, derived from `EDITION_NODE_LIMITS.free`.
- `create-map` and `directory-selection` defaults remain free 300.
- Caller `maxNodes` lower than 300 continues to tighten the budget with the same messages/reasons.
- Caller `maxNodes` above 300 is now explicitly capped at 300. This is a required free-edition safety change; before Stage 1B-1 these low-level callers could bypass the free limit.
- Invalid `maxNodes` returns `invalid-node-budget`; the application does not pass invalid budgets.
- Normal 301 behavior remains `node-limit` for creation/directory and `editor-node-limit` for editor, with 300-node messages.
- Policy result objects are adapted to existing consumer contracts; they are not returned to callers or passed through as app results.
- Low-level resource budgets (`MAX_DIRECTORY_ENTRIES`, attachment limits, label/search/scene caps) are unchanged and remain distinct from edition access.

## 2. Consumer matrix

| Consumer | Stage 1B-1 status | Context |
|---|---|---|
| Editor admission | **Integrated** | Explicit free policy, derived `EDITOR_MAX_NODES`. |
| Editor add-child | **Integrated** | Explicit free policy for prospective count. |
| Create-map preview/final candidate | **Integrated** | Explicit free budget; caller cap. |
| Directory collection | **Integrated** | Explicit free budget; caller cap. |
| Main UI edit gate | Unchanged | Uses derived free `EDITOR_MAX_NODES`; direct policy call deferred. |
| Persistence schema/repository | Deferred | Existing 300 guards remain. |
| Backup/codecs | Deferred | Existing 300 guards remain. |
| Recovery/runtime | Deferred | Existing 300 guards remain. |
| Open/import/save | Deferred | Existing persistence guards remain. |
| Layout/render/labels/search/hit testing | Out of scope | Unchanged. |
| Paid UI/entitlement/accounts/payment | Out of scope | Not implemented. |

## 3. Free behavior

- Root, folders, and files count consistently through the existing node-count semantics.
- 300 total nodes accepted; 301 rejected.
- Creation with flat files and with folders agrees on the root-inclusive boundary.
- Add at 299 → 300 accepted; add at 300 → 301 rejected.
- Rejection does not mutate the editor tree/candidate input; main-entry tests cover document/history/destination preservation.
- Attachments remain 20 MiB/file and 100 MiB total.
- Name, topology, attachment, metadata, cancellation, and stale-operation checks are unchanged.

## 4. Paid access remains disabled

- All three production policy calls use `edition: 'free'`.
- No production source references paid edition/entitlement.
- No caller-controlled edition argument exists publicly.
- `callerMaxNodes: 1000` still yields an effective limit of 300 and rejects 301.
- `EDITOR_MAX_NODES` is the free limit.
- No activation switch, URL flag, localStorage unlock, paid UI, account, payment, or telemetry was added.

## 5. Tests

### Newly executed focused integration
- Existing editor/create/directory/free-audit/policy tests + new consumer test: **51/51 PASS**, exit 0.
- New consumer test: **6/6 PASS**.
- Existing free-edition audit remains 3/3 PASS within the focused set.

### Complete free regression (fresh run)

| Run | Tests | Pass | Skip | Fail | Exit |
|---|---:|---:|---:|---:|---:|
| p1b-main | 69 | 69 | 0 | 0 | 0 |
| Remaining (includes policy and consumer tests) | 1,086 | 1,085 | 1 | 0 | 0 |
| **Aggregate** | **1,155** | **1,154** | **1** | **0** | **0** |

The single skip is the pre-existing `tests/engine/persistence/recovery.test.mjs:276` fake-IndexedDB concurrency case: native IndexedDB transaction serialization remains NOT RUN.

This is a fresh complete run because active application consumers changed. The previous Stage 1A full-suite result is retained separately and is not substituted for this run.

## 6. PASS / FAIL / NOT RUN

**PASS**
- Free-only policy integration in creation/directory/editor.
- 299/300/301 root-inclusive boundaries.
- Flat and folder-containing creation.
- Preview/final agreement.
- Lower caller budgets.
- Attempted caller elevation rejected.
- Editor admission/add boundaries.
- No mutation on rejection in covered consumers.
- Default values and public constants compatible.
- Attachments and existing validation unchanged.
- Paid access disabled.
- Focused integration tests.
- Fresh complete free regression: 1,155 tests, 1,154 pass, 1 skip, 0 fail.

**FAIL**
- None observed in focused tests.

**NOT RUN**
- Persistence/open/save/recovery policy integration.
- Layout/render/labels/search/hit testing at 1,000.
- Read-only/export/expiry/downgrade behavior.
- Paid UI/entitlement/payment/cloud/deployment.
- Tablet/phone.

The policy and free integration do **not** constitute 1,000-node application support. Current 1,000 layout remains unmeasured/failing as previously documented.
