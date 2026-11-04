# FileOrbit paid 1,000-node edition — architecture

Status: planning only. No paid code is present in r169.
Baseline: accepted PC packet `review/fileorbit-pc-free-edition-readiness-r169.zip` (`E7608F…`); do not modify it.

## 1. Current architecture audit

### 1.1 Node-count validation and hard 300 assumptions

| Layer | Path | Current behavior |
|---|---|---|
| Editor admission | `src/engine/hypertree/editor/validation.js` | `EDITOR_MAX_NODES = 300`; add/edit/delete admission rejects >300. |
| Directory collection | `src/engine/hypertree/exploration/directory-selection.js` | Independent default `maxNodes = 300`; main passes `EDITOR_MAX_NODES`. |
| Create-map preparation | `src/engine/hypertree/exploration/create-map.js` | `maxNodes = EDITOR_MAX_NODES`; rejects folder/file addition over limit. |
| Saved-map schema | `src/engine/hypertree/persistence/schema.js` | `MAX_SAVED_MAP_NODES = EDITOR_MAX_NODES`; aliases attachment limits. |
| Encode/decode | `persistence/backup.js`, `persistence/codec.js` | `MAX_SAVED_MAP_NODES` used for manifest, tree load, import/export. |
| Repository | `persistence/repository.js` | Hard node and attachment checks on save/load; stored `nodeCount` verified. |
| Recovery | `persistence/recovery-repository.js`, `recovery-codec.js`, `recovery-schema.js` | Hard node cap and recovery node-count validation. |
| Restored runtime | `persistence/runtime.js` | `maxNodes = EDITOR_MAX_NODES` for reconstructed trees. |
| Main editor gate | `tests/harness/m5-exploration/main.mjs` | `graph.nodes.size <= EDITOR_MAX_NODES`; create collection uses constant. |
| Generic tree loader | `data/tree-loader.js`, `data/errors.js` | Generic max is 100000; the 300 limit is enforced by higher layers. |

Changing only `EDITOR_MAX_NODES` would leave `directory-selection.js`’s own default and does not make persistence/read-only policy semantic. It also does not address rendering/refinement limits below.

### 1.2 Layout, rendering, labels, viewport, selection

| Area | Path | Current behavior / limit |
|---|---|---|
| V2 angle/workspace | `layout/experimental-v2.js` | `V2_MAX_NODES=2000`; angular clearance solved with workspace scale ≤16. |
| V2 refinement | `layout/experimental-v2-refinement.js` | Calls `measurePreparedScene(finalScene, { viewport })`. |
| Diagnostic metrics | `layout/experimental-metrics.js` | `DIAGNOSTIC_MAX_NODES=300`; O(N²) overlap diagnostics; throws above limit. |
| Optional crowding | `layout/experimental-v2-crowding.js`, `experimental-v2-local-crowding.js` | Their own 400-node limits; not used by production main in r169. |
| Scene limits | `render/scene.js` | 1,500 nodes / 1,499 edges. |
| Canvas rendering | `render/graph-renderer.js` | Draws visible scene nodes/edges; no per-frame node culling beyond scene flags. |
| Labels | `render/label-overlay.js` | Viewport eligibility; `maxLabels=40` default; maxVisibleBudget=500; root/priority/selected ordering; collision suppression. |
| Hit testing | `interaction/hit-test.js` | Snapshot capped at 1,500; tests visible circles. |
| Focus/selection | `interaction/frame.js`, `selection-controller.js`, `focus/focus-transition.js` | Focus animation default 300 ms; hit/selection tied to rendered scene. |
| Search | `exploration/search.js` | DFS over all nodes; `MAX_SEARCH_RESULTS=50`; highlights containing folders. |
| History | `editor/history.js` | Bounded total/entry bytes; commands, not full-tree clones. |
| Preview resources | `editor/attachment-viewer.js` | Object URL creation/revocation; PDF fallback deferred revoke. |
| Persistence/conflict | `persistence/*`, `tests/harness/m5-exploration/document-adapter.js`, `file-conflict-dialog.js` | Writable-handle protection, baseline verification, explicit conflict decisions. |

### 1.3 Measured findings versus hypotheses

**Measured**
- A disposable copy with `EDITOR_MAX_NODES` raised to 1000 still fails to open 1,000-node documents:
  - flat/wide/mixed/balanced fixtures fail at V2 **stage** with `experimental-v2-infeasible` (angular clearance).
  - deep binary fixture passes stage but fails **refine** with `diagnostic-limit` because pairwise diagnostics reject 1000 > 300.
- The same disposable copy opens 300-node flat/mixed fixtures successfully.
- Node encode/decode handles 1,000 nodes in the low-millisecond range; the data pipeline is not the first bottleneck.
- Browser 300-node open: ~320–370 ms; labels visible at overview: 23/27 (of 300); frame p95 ~16.8 ms; selection ~10 ms.
- Browser 1,000-node open fails in ~105–113 ms with layout error; no rendered 1,000-node frame/memory measurement exists.
- Search on 300-node mixed data: successful queries update highlights in ~21 ms; result/highlight cap 50.
- Label budget is 40; viewport eligibility and collision suppression already reduce labels at 300.

**Hypotheses / not measured**
- A hierarchy/cluster/LOD design will make 1,000 nodes usable; this is not yet implemented or proven.
- A spatial-hash replacement for pairwise diagnostics will make refinement feasible; not proven at 1,000.
- 1,000-node label readability and touch/pointer accuracy require browser/device evidence; not measured.
- Long-running layout on the main thread needs cancellation/chunking; not measured at 1,000 because layout fails first.

## 2. Why a single constant is insufficient

A single limit change cannot deliver paid 1,000 because:

1. The 300 constant is replicated in validation, directory collection, persistence, recovery, and runtime.
2. Refinement has a separate 300-node diagnostic hard stop.
3. The current V2 stage is infeasible for tested 1,000-node shapes even with the limit raised.
4. A document can be 1,000 nodes but rendering all labels/nodes at once is not desirable; the product needs a discoverability policy, not only a cap.
5. Limit enforcement must become edition-aware at every entry point, including paid-size files opened while free.

## 2A. Stage 1A implementation note

Stage 1A adds:
- `src/engine/hypertree/edition/policy.js`
- `src/engine/hypertree/edition/index.js`
- `tests/engine/edition/edition-policy.test.mjs`

The module is pure, immutable, and explicit-input. Stage 1A had no application consumers. Stage 1B-1 uses it in **free-only** creation, directory collection, editor admission, and add-child checks. Stage 1B-2 adds free-only persistence/recovery admission through `persistence/node-limit.js`. `EDITOR_MAX_NODES` and `MAX_SAVED_MAP_NODES` derive from the free limit and remain 300. No paid context, read-only/export/expiry/downgrade behavior, or paid UI exists. Layout and paid admission remain future work.

## 3. Proposed edition architecture

### 3.1 One policy object

Add (planned, not implemented):

`src/engine/hypertree/edition/policy.js`

```js
EditionLimits = { free: 300, paid: 1000 }
DocumentAccess = {
  edition, maxNodes, nodeCount,
  editable, readOnly, exportAllowed, reason
}
createEditionPolicy({ entitlement, nodeCount, operation })
```

Rules:
- Default is free.
- Paid active allows up to 1,000.
- Free allows editing only ≤300.
- Free/expired opening a 301–1,000 document returns `readOnly` (recommended; product decision).
- Any operation above the active max returns a typed limit result; no silent write.
- Document content never stores edition/license state.

### 3.2 Propagate explicit limits; no global mutable limit

Replace hard-coded consumers with an explicit `limits`/`access` argument:

- `create-map.js`, `directory-selection.js`
- `editor/validation.js` admission
- `persistence/schema.js`, `backup.js`, `codec.js`, `repository.js`, `runtime.js`
- `recovery-codec.js`, `recovery-schema.js`, `recovery-repository.js`
- main create/import/open/save/recovery/editor gate

Keep `EDITOR_MAX_NODES` as the **free default** for backward compatibility, but never let it be the only policy source.

### 3.3 Load pipeline with no truncation

```
container decode (hard integrity, max 1000 for paid-capable build)
  -> loadTree (max 1000)
  -> compute nodeCount
  -> EditionPolicy
      free + <=300   : editable
      free + 301-1000: read-only/export-preserving
      paid + <=1000  : editable
      any + >1000    : reject over-limit
```

A paid document opened free must not be rejected as corrupt and must not be truncated. Read-only policy is applied after successful decode.

### 3.4 Save/editor pipeline

- Check policy before encode/write.
- Read-only: no write; offer export-preserving path if approved.
- Paid: encode/save up to 1,000.
- Persistence repository uses explicit max; stored map count and tree validation remain.
- Recovery preserves >free documents regardless of current entitlement.

### 3.5 Layout/render strategy — smallest viable change

**Recommended direction:** keep the current V2 engine for the focused subtree, add an edition-aware level-of-detail layer for >300.

Options to prototype (Stage 3), in order:

1. **Optimized full layout**
   - Replace O(N²) diagnostics with spatial-grid overlap metrics; allow refinement limit 1000.
   - Increase/rework angular workspace scale only if clearance evidence still shows infeasibility.
   - Measure stage/refine. This is the smallest code change but measured stage failures make success uncertain.

2. **Cluster/focus level-of-detail** (likely required)
   - At overview, render folder structure plus cluster proxies for large sibling groups.
   - On focus/zoom, expand a cluster/subtree and run V2 for the visible subset.
   - Keep full graph, IDs, topology, metadata, attachments unchanged.
   - Every node is reachable via focus, zoom, search, or details.
   - Scene/hit snapshot contains only visible/expanded objects; cluster proxies have no document identity.
   - Labels: bounded budget; root/selected/focused/search priorities override ordinary labels.
   - Cancellation: generation token per layout/render; stale completions discarded.

This preserves the engine and data model while limiting what is laid out/rendered at once. It is a larger interaction change than a constant update but matches the requirement that not all 1,000 labels be simultaneously readable.

### 3.6 Label and navigation policy

- Root, selected node, focused folder, hovered/priority, and search-result labels have highest priority.
- Ordinary label budget remains bounded (40 default; may remain).
- Viewport culling continues for labels and scene objects.
- Search can surface a node not currently labeled; selection/focus centers it and raises its label.
- No node is “unreachable” merely because its label is suppressed at overview.
- Hit testing uses the same visible scene/hierarchy as rendering; cluster proxies cannot steal document IDs.

### 3.7 Long-operation cancellation

- Add operation generation/token around layout, label placement, save encoding, recovery.
- Check cancellation between expensive phases; ignore stale completion.
- If layout is moved off-thread later, retain main-thread fallback; this plan does not mandate a worker.
- Search max results remains 50; navigate results by IDs.

### 3.8 Integrity

- IDs, topology, metadata, and attachment bytes are never altered by display policy.
- Layout may omit/aggregate **visual proxies**, never document nodes.
- Encode/decode uses the same manifest/tree/attachment validation.
- No “make it fit” truncation.

## 4. Entitlement boundary

Separate:
- **Document content** (`.orbit` file, node count, attachments, hashes).
- **Edition policy** (evaluation of entitlement against content).
- **Entitlement proof** (signed server state/cache).

Suggested interfaces:

`src/engine/hypertree/edition/entitlement.js`
```js
EntitlementProvider.getState() -> { status, plan, expiresAt, proof, source }
EntitlementProvider.verify(purchaseResult) / refresh()
EntitlementStore.loadCached() / saveCached()
```

The document layer only receives a policy/limits object. It must not import payment/account code.

## 5. Upgrade flow architecture

```
Upgrade → plan info → account/payment (external) → server-verified result
        → signed entitlement / cache → EditionPolicy updates
        → paid features enabled without remounting the document
```

- Never trust a client “purchase succeeded” callback.
- Verify server result and signature; entitlement changes are authoritative.
- Activation must preserve open document, unsaved edits, editor draft, selection, and destination.
- Payment cancellation/failure leaves free mode and document intact.
- Refund/expiry transitions to read-only/export-preserving policy (exact behavior unapproved).
- Offline mode uses a cached signed entitlement if product decides; no grace period is approved.
- A prototype feature flag is not enforceable licensing: local flags are bypassable. Enforceable licensing requires server verification and signed entitlement state; client policy remains a UX gate, not a security boundary.
- No accounts, payment sessions, servers, credentials, or external services are created in this stage.

## 6. Compatibility and migration

- Keep `.orbit` container/version unchanged.
- No migration, no rewrite, no license field.
- Free files open paid; paid files free follow the read-only/export recommendation.
- Existing free files and archived data remain valid.
- Any future container field would be additive and versioned; not part of this plan.

## 7. Risks and tradeoffs

| Risk | Impact | Mitigation |
|---|---|---|
| LOD changes hit testing/selection | Users cannot reach nodes | Model/scene separation; exhaustive reachability tests |
| Cluster layout hides files | Discoverability loss | Search/focus/zoom acceptance criteria |
| O(N²) metrics block 1,000 | No paid layout | Spatial metrics + staged profile gate |
| Dynamic limit bypass | Free users create >300 | Central policy; server entitlement for enforcement; tests |
| Paid file free read-only rejection | Data lockout | Open, preserve, export; no truncation |
| Activation remount loses drafts | Data loss | In-place policy update; editor-state tests |
| Offline license ambiguity | Feature flicker | Explicit state model; product decision |
| Performance regressions for free | Free acceptance break | Free suite and 300 profiling every stage |

## 8. Architecture decision summary

- **Do not** replace the engine wholesale.
- **Do** extract a central edition policy and dynamic limits.
- **Do** first prove whether optimized full layout can support 1,000; measured evidence currently says no.
- **Plan for** a focus/zoom cluster LOD path for >300 as the likely smallest viable product behavior.
- **Keep** document integrity independent of license and rendering.
