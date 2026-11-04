# FileOrbit paid 1,000-node edition — requirements

Status: Stage 1A policy plus Stage 1B-1/1B-2 **free-only** integration into creation, directory collection, editor admission, persistence, backup/import, runtime reconstruction, and recovery. No paid behavior is enabled; layout and paid admission remain deferred.
Baseline: accepted PC free-edition packet `review/fileorbit-pc-free-edition-readiness-r169.zip`, SHA-256 `E7608F387E5A9676CEF8F908B77241A26469ADCFB5889D00B4795FFDD6ADA441`.

## 1. Scope

### In scope for this planning stage
- Windows PC, Chrome and Edge.
- Free edition: **300 total nodes including root**.
- Paid edition: **1,000 total nodes including root**.
- Attachment limits unchanged: **20 MiB per file**, **100 MiB total**.
- Preserve the accepted free-edition behavior and regression coverage.

### Deferred / excluded
- Enterprise and 10,000-node support.
- Tablet acceptance (no device).
- Phone development/testing (paused; actual-iPhone Safari encoding issue remains open).
- Cloud integrations, external Embed hosting, deployment, publishing.
- Paid pricing, subscription/perpetual choice, payment provider, account provider, tax/refund policy, offline grace period.
- Upgrade implementation before commercial decisions.

## 2. Functional requirements

### R1 — Edition limits
- A document with **300 nodes including root** is valid in free and paid.
- A **301-node** candidate is rejected in free.
- A document with **1,000 nodes including root** is valid in paid.
- A **1,001-node** candidate is rejected in paid.
- Node count always includes the synthetic root and all selected folder/file nodes.
- Attachments do not count as nodes.

### R2 — One policy across operations
The same edition policy applies to:
- create-map preview and commit;
- file/folder selection collection;
- import of `.orbit` packages;
- direct file open and Orbit file open;
- editor add/edit/delete/reparent/history replay;
- save snapshot build, encode, decode, persistence, recovery;
- backup/download/export and re-import.

No operation may silently accept documents above its edition limit, and no operation may silently truncate content.

### R3 — Cross-edition document compatibility
- A free `.orbit` file must open in paid and remain editable up to 1,000 nodes.
- A paid `.orbit` file with 301–1,000 nodes encountered in free must **not** be treated as corrupt.
- Recommended safe default: open such a file **read-only**, preserve it fully, and offer an export/preserving path. Exact downgrade behavior is an unapproved product decision (see Section 6).
- No license flag or edition field is written into document content.
- No document is rewritten merely because edition policy changes.

### R4 — Recovery and export integrity
- Recovery may load and preserve paid-size documents even when the current entitlement is free/unavailable.
- Recovery must not delete, truncate, or reject a valid 1,000-node document merely to satisfy a free limit.
- Export/download of an existing >300 document must preserve all IDs, topology, metadata, and attachment bytes. Whether export is allowed while read-only is a product decision.
- A failed activation/expiry must not corrupt or discard the open document or editor draft.

### R5 — User-visible behavior
- Clear limit messages for 301 (free) and 1,001 (paid).
- Clear read-only/entitlement messaging for paid-size files in free/expired state.
- Upgrade entry point is separate from document content and does not mutate the document.
- Activation preserves the open document, unsaved edits, selection, editor form/draft, and destination handle.
- No “successful save” claim when encoding/write fails.

### R6 — Free-edition preservation
- Default behavior with no entitlement remains exactly free: 300-node maximum and attachment limits unchanged.
- Existing free tests remain mandatory and must run on every paid stage.
- No paid-only code path may become the default absent entitlement.

## 3. Non-functional requirements

### N1 — Document operations
- 1,000-node create/import/load/save/recovery must validate ID/topology/metadata/attachment integrity as strictly as free.
- Larger documents must not weaken checks to make layout pass.

### N2 — Interaction
Proposed acceptance budgets (not yet measured; require approval):
- Paid document open-to-interactive target: ≤1,500 ms on reference PC.
- Steady-state frame p95: ≤33 ms during layout transitions/selection, with no repeated long-task stalls.
- Selection/search/hover feedback: ≤100 ms for label/selection response.
- No unbounded label DOM growth; no object-URL leaks.

### N3 — Readability/discoverability
- 1,000-node overview does **not** require 1,000 filenames readable simultaneously.
- Every node must be discoverable and reachable through at least one of: focus/folder navigation, zoom, selection, search, or details.
- Selected, focused-folder, hovered/priority, and search-result labels take precedence over ordinary labels.
- Ordinary label budget may remain bounded; label suppression is acceptable if discoverability is preserved.

### N4 — Performance evidence
- Measurements must use isolated fixtures and a disposable candidate copy.
- No invented proportional scaling claims.
- Browser measurements unavailable due a failure must be marked NOT RUN with the observed failure.

## 4. Proposed edition policy table

| Operation | Free | Paid active | Paid expired/unavailable |
|---|---|---|---|
| Open 1–300 nodes | Editable | Editable | Editable |
| Open 301–1,000 nodes | Read-only + export-preserving (recommended; unapproved) | Editable | Read-only + export-preserving (recommended) |
| Open >1,000 nodes | Reject as over paid limit | Reject as over paid limit | Reject as over paid limit |
| Create/import 301–1,000 | Reject (free limit) | Accept | Reject/read-only? Product decision |
| Edit above 300 | Blocked | Allowed up to 1,000 | Blocked |
| Save/overwrite above 300 | Blocked unless export-only | Allowed | Blocked unless export-only |
| Recovery of >300 | Preserve; read-only/export | Editable | Preserve; read-only/export |
| Export/download | Preserve full document; exact policy unapproved | Allowed | Preserve full document |

## 4A. Stage 1A boundary

Stage 1A added central definitions and a pure policy API. Stage 1B-1 connected free creation, directory collection, editor admission, and add-child. Stage 1B-2 connects saved documents, backup/import, runtime reconstruction, and recovery. It does not expose paid context, paid UI, or change free behavior. Layout integration and paid admission remain deferred.

## 5. Product decisions that are NOT approved

These must be decided before implementation beyond a shadow policy:

1. Subscription, perpetual, or hybrid licensing.
2. Price and plan names.
3. Account system and identity provider.
4. Payment provider, tax handling, invoices, refund policy.
5. Offline entitlement policy and grace duration.
6. Whether free edition can open paid-size files read-only, or must reject them.
7. Whether free read-only mode may export/download the full >300 document.
8. Whether paid expiry preserves editing until a grace end or immediately becomes read-only.
9. Whether a paid file opened after downgrade may be edited at ≤300 nodes (e.g. deletes) or is fully locked.
10. Device limit, concurrent-session policy, transferability.
11. Whether enterprise/10,000-node work is a separate product tier.
12. Telemetry/diagnostics collection and privacy policy.

## 6. Acceptance criteria for the eventual paid edition

- Free suite remains green; free limit remains 300/20 MiB/100 MiB.
- Paid 999/1,000/1,001 boundaries verified for create, import, edit, save, load, recovery, encode/decode.
- Paid-size files survive free-open/export without truncation or ID/metadata/attachment loss (subject to decisions 6–7).
- Every node at 1,000 is reachable via focus/zoom/search/details; no dead zones in hit testing.
- All 1,000 filenames are not required at overview, but each has a discoverable path.
- Long operations are cancellable or stale-safe.
- Activation/expiry preserves document, edits, editor draft, and destination.
- No successful save/download status after failure.
- Automated + browser + actual PC Chrome/Edge acceptance recorded separately.

## 7. Explicit non-goals for initial paid work

- No 10,000-node or enterprise implementation.
- No cloud sync, external Embed hosting, deployment, or publishing.
- No phone/tablet work.
- No pricing/payment/account implementation until decisions are approved.
- No rewrite of the current engine unless profiling proves it necessary.
