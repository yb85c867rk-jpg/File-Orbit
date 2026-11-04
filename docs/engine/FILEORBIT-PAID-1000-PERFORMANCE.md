# FileOrbit paid 1,000-node performance evidence

Status: profiling only. The disposable profiling copy changed only `EDITOR_MAX_NODES` from 300 to 1000; no accepted baseline file was changed.

## 1. Environment and method

| Component | Value |
|---|---|
| OS | Windows NT 10.0.26300.0 |
| CPU | Not captured (not invented) |
| Browser | Chrome 156.0.8078.76, `--headless=new --disable-gpu` |
| Node.js | v24.12.0 |
| Viewport | 1600×1000 CSS px, DPR 1 |
| Layout iteration | 5 warm runs per 300-node shape; median/p95 reported |
| Encoding iteration | 3 runs per fixture |
| Browser fixtures | Synthetic `.orbit` packages, no attachments |
| Baseline | Accepted r169 packet `E7608F…` |

Node script: `analysis/paid-1000/benchmark-layout.mjs`
Browser script: `analysis/paid-1000/browser-profile.mjs`
Search script: `analysis/paid-1000/search-profile.mjs`
Results: `layout-benchmark.json`, `browser-profile.json`, `search-profile.json`

Browser evidence screenshots:
- `analysis/paid-1000/evidence/flat-300.png`
- `analysis/paid-1000/evidence/flat-1000-error.png`

Fixtures:
- **flat**: root + flat file children.
- **wide**: root + 20 folders + files.
- **deep**: binary heap, not a deep chain. 300 nodes reach max depth 8 (9 levels including root); 1,000 nodes reach max depth 9 (10 levels including root). 1,000 = 500 folders + 500 files; 300 = 150/150.
- **mixed**: 30 folders, mixed files, long and Korean names.
- **balanced**: 5-way heap.

All counts include the root.

## 2. Node layout / data benchmark

| Shape | Nodes | Load median | Stage median | Refine median | Encode median | Decode median | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| flat | 300 | 1.92 ms | 9.79 ms | 216.02 ms | 0.94 ms | 2.17 ms | PASS |
| wide | 300 | 0.72 | 4.38 | 185.08 | 0.66 | 1.21 | PASS |
| deep | 300 | 0.70 | 2.43 | 81.53 | 0.64 | 1.29 | PASS |
| mixed | 300 | 1.03 | 4.23 | 173.56 | 0.77 | 1.39 | PASS |
| balanced | 300 | 0.87 | 10.63 | 154.81 | 0.50 | 1.17 | PASS |
| flat | 1,000 | 1.67 | — | — | 1.29 | 4.26 | **FAIL at stage**: `experimental-v2-infeasible` |
| wide | 1,000 | 2.49 | — | — | 1.66 | 3.51 | **FAIL at stage**: `experimental-v2-infeasible` |
| deep | 1,000 | 1.80 | 16.94 | — | 2.33 | 3.74 | **FAIL at refine**: `diagnostic-limit` (1000 > 300) |
| mixed | 1,000 | 2.79 | — | — | 2.51 | 5.98 | **FAIL at stage**: `experimental-v2-infeasible` |
| balanced | 1,000 | 4.77 | — | — | 1.35 | 4.70 | **FAIL at stage**: `experimental-v2-infeasible` |

Interpretation:
- Data load and encode/decode remain in the low-millisecond range at 1,000 nodes on these fixtures. The document data pipeline is **not** the dominant measured bottleneck.
- Layout/refinement is the dominant measured bottleneck.
- A 1,000-node document cannot currently be displayed by simply raising the editor/persistence constant.
- The deep fixture reaches refinement but is stopped by the 300-node pairwise diagnostic cap.
- Stage failures occur at angular-clearance solving, even for a balanced 5-way tree. This is a layout-contract gap, not only a limit-constant gap.

## 3. Browser/rendering observations

| Case | Open-to-map | Visible labels | Frame p95 | Selection | Download/encode | JS heap used | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| flat 300 | 331.9 ms | 23 | 16.8 ms | 10.3 ms | 4.3 ms | 10.6 MB | PASS |
| mixed 300 | 326.4 ms | 27 | 16.8 ms | 11.4 ms | 6.1 ms | 16.0 MB | PASS |
| flat 1000 | 105.6 ms | — | — | — | — | — | **FAIL**: layout error; no map |
| balanced 1000 | 112.6 ms | — | — | — | — | — | **FAIL**: layout error; no map |

Observed 1,000-node status:
`Backup import preparation failed: no workspace scale up to 16 satisfies angular clearance (node n0)`

- No 1,000-node rendered frame, label, hit-test, memory, or interaction measurement is available because layout fails first. Mark these **NOT RUN**, not proportional estimates.
- 300-node labels are bounded (23/27 visible at overview), which confirms labels are already suppressed by collision/viewport budget, not a 1:1 filename list.
- Frame timing is headless/software-rendered; not a native-GPU or actual-PC UI guarantee.
- JS heap numbers are per fresh page and coarse; they are not leak measurements.
- The fake picker reports an external-change status on these fixtures; that is a profiling artifact, not a product result.

## 4. Search/interaction profile (300 nodes)

| Query | Observed |
|---|---|
| `Mixed` | ~21.1 ms; 31 containing folders highlighted |
| `한글` | ~21.7 ms; 31 folders highlighted |
| `long` | ~20.7 ms; 21 folders highlighted |
| no-match | **NOT RUN reliably**; the script’s 1-second polling ceiling is not search latency |

Repeated navigation on the 300-node flat fixture:

| Operation | Count | Average | p95 | Max |
|---|---:|---:|---:|---:|
| Selection / focus update | 50 | 8.32 ms | 12.80 ms | 26.0 ms |
| Search toggle/highlight update | 20 | 6.06 ms | 7.40 ms | 7.70 ms |

Evidence: `analysis/paid-1000/navigation-profile.json`. This is 300 nodes only; repeated navigation at 1,000 is NOT RUN because no 1,000-node scene exists.

- Search result/highlight cap is 50.
- Repeated navigation at 1,000 nodes is **NOT RUN** because no 1,000-node scene exists.
- Long-task/frame measurements during dense search at 1,000 are **NOT RUN**.

## 5. Save/open/recovery

| Operation | Evidence |
|---|---|
| Node encode 1,000 | 1.3–2.5 ms median on synthetic no-attachment fixtures |
| Node decode 1,000 | 3.5–6.0 ms median |
| Browser open 300 | 326–332 ms to map |
| Browser open 1,000 | Fails at layout; no map |
| Browser native save/File System Access | Prior accepted user evidence only; not re-run in this profiling copy |
| Recovery at 1,000 | **NOT RUN**; layout failure prevents end-to-end browser recovery profiling |
| Attachments at 1,000 | **NOT RUN**; fixtures have no attachments |

## 6. Measured findings vs hypotheses

**Measured**
- All tested 1,000-node shapes fail before a usable scene is produced.
- Refinement has a hard 300-node pairwise diagnostic limit.
- V2 stage angular clearance fails at 1,000 across flat, wide, mixed, and balanced shapes.
- Data encode/decode is cheap relative to layout on these no-attachment fixtures.
- 300-node browser rendering is near 60 fps in headless Chrome with 23–27 visible labels.

**Hypotheses, not proven**
- A focus/zoom cluster LOD path will produce a usable 1,000-node experience.
- A spatial-grid replacement for O(N²) overlap diagnostics will make refinement feasible.
- Increasing workspace scale alone will solve stage infeasibility; current fixtures suggest it will not.
- 1,000-node labels can remain discoverable through search/focus/zoom with a 40-label budget; not user-validated.

## 7. Proposed budgets versus measurements

The proposed targets in the requirements (open-to-interactive ≤1,500 ms, frame p95 ≤33 ms, selection/search feedback ≤100 ms) are **not measured results and are not approved acceptance thresholds**. The measured 300-node values above are observational. No 1,000-node browser interaction budget was measured because layout fails before a scene exists.

## 8. Unresolved discoverability issue

`MAX_SEARCH_RESULTS = 50` in `src/engine/hypertree/exploration/search.js`. This is a presentation/result cap, not a document limit. At 1,000 nodes, a 50-result cap may prevent a user from finding an arbitrary filename through search alone. Later layout/navigation work must provide another reachable path (focus/zoom/details/selection) and must not treat “search found 50” as proof that every node is discoverable. This is an unresolved product/discoverability item, not a Stage 1A change.

## 9. Performance acceptance implications

The paid design must not claim 1,000-node support until:
1. Stage/refine succeeds on representative 1,000-node fixtures.
2. Browser open-to-interactive and frame/interaction metrics are recorded.
3. Label discoverability is validated through focus/zoom/search.
4. Save/open/recovery with attachments at 1,000 is measured.
5. Actual PC Chrome/Edge behavior is observed separately from headless emulation.

No proportional performance promise is made from these measurements.

CPU/GPU identification was not captured; the browser was headless Chrome with software rasterization (`--disable-gpu`). No native-PC timing claim is made.
