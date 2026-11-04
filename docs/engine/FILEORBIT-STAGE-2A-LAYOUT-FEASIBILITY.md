# FileOrbit Stage 2A — 1,000-node layout feasibility prototype

Status: **analysis-only feasibility prototype**. The application remains free-only at 300 nodes. No paid lifecycle, Upgrade UI, entitlement, format, layout default, deployment, or commercial work was added.

Baseline: `fileorbit-orbit-only-lifecycle-r169.zip`
Baseline SHA-256 verified:
`24123A48917FAE8869A825D2C776917D7B085003BB2C91C06BD55B171601D1FD`

## Recommendation

**Use a cluster/focus LOD presentation for 1,000-node maps; do not ship a full 1,000-node readable layout in the current renderer.**

Full-layout evidence:
- flat/wide/mixed at 1,000 fail V2 angular clearance even at workspace scale 16;
- deep fails at both 300 and 1,000;
- balanced at 1,000 stages but produces 968 overlapping 6px glyph pairs;
- binary stages and reaches opt-in refinement, which improves 2,041 → 1,971 overlaps but remains unreadable;
- a capacity-only reference-radius increase makes flat stage (scale 11.75) but produces 4,605 overlaps.

Cluster presentation evidence:
- flat 1,000 → 25 clusters; overview scene has **26 nodes, 25 edges, 0 overlaps**;
- focused cluster scene has **42 nodes, 41 edges, 0 overlaps**;
- the source tree remains byte-for-byte unchanged in the tested path; member IDs are only mapped in presentation metadata.

This is a LOD recommendation, not a second production architecture.

## 1. Isolation and implementation

Analysis-only modules:
- `analysis/stage2a/fixtures.mjs` — deterministic 300/1,000 fixtures.
- `analysis/stage2a/measure.mjs` — exact grid overlap + KD-tree centre-separation diagnostics.
- `analysis/stage2a/evaluate.mjs` — projection, fit, fixed-glyph scene, exact metrics.
- `analysis/stage2a/cluster.mjs` — presentation-only cluster overview/focus.
- `analysis/stage2a/run.mjs` — fixed-repetition measurement harness, writes `results.json`.

Production module change:
- `src/engine/hypertree/layout/experimental-v2-refinement.js` accepts optional `diagnosticMaxNodes`.
  - Default remains 300.
  - Existing calls and application behavior are unchanged.
  - The analysis harness uses 1,000 explicitly to expose the binary-fixture refinement metrics instead of hiding the cap failure.

No application admission/default is changed. Normal application still uses `EDITOR_MAX_NODES = 300`, V2 `referenceProjectionRadiusCss = 240`, `workspaceScaleMax = 16`, and diagnostic limit 300.

## 2. Environment

- Node: `v24.12.0`
- OS/platform: Windows `win32` x64
- CPU: 13th Gen Intel Core i5-13420H, 12 logical CPUs
- Browser rendering/interaction: **NOT RUN**
- Viewport used analytically: 1600×900
- Glyph radius: 6 CSS px
- Repetitions: 3 per measurement
- Raw results: `analysis/stage2a/results.json`

Browser latency/FPS is not inferred from Node timing and is not measured.

## 3. Fixtures

All totals include the root. Every fixture uses long Korean names.

| Fixture | Nodes | Depth | Max fan-out |
|---|---:|---:|---:|
| flat-300 | 300 | 1 | 299 |
| flat-1000 | 1,000 | 1 | 999 |
| wide-300 | 300 | 2 | 24 |
| wide-1000 | 1,000 | 2 | 83 |
| balanced-300 | 300 | 5 | 3 |
| balanced-1000 | 1,000 | 6 | 3 |
| mixed-300 | 300 | 9 | 89 |
| mixed-1000 | 1,000 | 9 | 205 |
| deep-300 | 300 | 51 | 6 |
| deep-1000 | 1,000 | 51 | 20 |

The deep fixtures are genuine chains with leaf attachment along the chain, not a shallow wide fan.

## 4. Default V2 stage results

Failure times are failure-return times, not successful open times.

| Fixture | Result | Workspace scale | Overlaps | Edges | Failure time (ms) |
|---|---|---:|---:|---:|---:|
| flat-300 | PASS | 14.25 | 318 | 299 | — |
| flat-1000 | FAIL angular | 16 | — | — | 31–60 |
| wide-300 | PASS | 8 | 76 | 299 | — |
| wide-1000 | FAIL angular | 16 | — | — | 30–34 |
| balanced-300 | PASS | 3.75 | 9 | 299 | — |
| balanced-1000 | PASS | 10.75 | 968 | 999 | — |
| mixed-300 | PASS | 7.5 | 104 | 299 | — |
| mixed-1000 | FAIL angular | 16 | — | — | 22–26 |
| deep-300 | FAIL angular | 16 | — | — | 6–9 |
| deep-1000 | FAIL angular | 16 | — | — | 23–36 |

Angular evidence at failure:
- flat-1000 root: required 18.397 rad, available 6.283 rad at scale 16.
- wide-1000: required 0.930, available 0.536.
- mixed-1000: required 1.854, available 1.058.
- deep-1000: required 0.275, available 0.086.

Even successful 1,000-node cases have substantial 6px glyph overlap. Stage success is not readable-layout success.

## 5. Geometry-capacity probe

Changing only `referenceProjectionRadiusCss` from 240 to 960 lets flat-1000 stage at workspace scale 11.75. It still produces **4,605 overlapping pairs** at a 1600×900 fit with 6px glyphs. Raising angular capacity alone is therefore not a viable full-layout solution.

## 6. Binary refinement

Binary-1000: depth 9, max fan-out 2.

- Stage: PASS, scale 5.75.
- Default refinement diagnostics: rejected at the 300-node diagnostic cap.
- Explicit `diagnosticMaxNodes: 1000`:
  - 4 refinement candidates evaluated;
  - overlaps improved **2,041 → 1,971**;
  - final scene still has **1,971 overlaps**, 1,000 visible nodes, 999 edges;
  - refinement evaluation took ~1.2–1.5 seconds in Node.

The diagnostic cap was not removed. It is now explicitly opt-in for analysis, while normal defaults remain bounded.

## 7. Exact diagnostic parity and cost

At 300 nodes, exact broad-phase results match production pairwise diagnostics for overlap pairs, minimum centre separation, bounds, and visible counts. All 12 comparisons passed (3 repetitions × 4 successful shapes).

| Fixture | Production ms | Exact broad-phase ms | Match |
|---|---:|---:|---|
| flat-300 | 110–115 | 1.6–1.7 | YES |
| wide-300 | 104–131 | 1.4–2.3 | YES |
| balanced-300 | 4.4–7.2 | 0.9–1.6 | YES |
| mixed-300 | 75–114 | 0.6–1.5 | YES |

At 1,000 nodes (binary/refined scene):

| Run | Production O(N²) ms | Exact broad-phase ms | Match |
|---|---:|---:|---|
| 1 | 469.5 | 5.7 | YES |
| 2 | 435.4 | 5.1 | YES |
| 3 | 369.3 | 3.3 | YES |

The exact broad-phase is materially cheaper and reports the same 1,971 overlap pairs and minimum separation. No failed geometric check is silently omitted.

## 8. Cluster/focus LOD evidence

For flat-1000 with 40 members per cluster:
- clusters: 25
- overview: 26 nodes, 25 edges, 0 overlaps
- focused cluster: 42 nodes, 41 edges, 0 overlaps
- source tree unchanged before/after presentation construction
- presentation mapping covers all 999 child IDs

Proposed LOD behavior:
1. Overview shows the root plus sibling clusters; cluster nodes carry member IDs/counts only in presentation metadata.
2. Selecting a cluster focuses the root, that cluster, and its ≤40 members; other clusters remain summarized or are hidden with an explicit overview return.
3. Full document IDs/topology remain authoritative and are never rewritten by presentation grouping.
4. The existing 300-node admission and renderer caps remain unchanged.

## 9. Tests

Targeted layout suite: **45/45 PASS**, exit 0.
- Includes V2, refinement, crowding, local crowding, and the new Stage 2A parity/isolation tests.

Stage 2A tests:
- exact fixture counts/depth/fan-out;
- long Korean names;
- exact diagnostics parity at 300;
- exact diagnostics above the 300 cap;
- normal defaults unchanged;
- high-reference-radius stage-but-overlap result;
- explicit refinement diagnostic opt-in;
- cluster/focus non-mutation and zero overlaps.

Complete free regression (fresh): 1,179 tests, 1,178 pass, 1 skip, 0 fail, exit 0. The skip is the pre-existing fake-IndexedDB recovery serialization case; native IndexedDB remains NOT RUN.

## 10. PASS / FAIL / NOT RUN

**PASS**
- Reproducible 300/1,000 fixtures with root-inclusive totals.
- Direct isolated layout exercise.
- Exact broad-phase parity at 300.
- Exact diagnostics above the 300 cap.
- Explicit refinement diagnostic opt-in.
- Full-layout infeasibility evidence at 1,000.
- Cluster/focus LOD evidence at 1,000.
- Normal application remains free-only at 300.
- Targeted layout tests: 45/45 PASS.
- Complete free regression: 1,179 tests, 1,178 pass, 1 skip, 0 fail.

**FAIL**
- No full readable 1,000-node layout under current geometry.
- Deep-300 remains infeasible.
- Flat-1000 angular clearance fails at supported workspace scale.

**NOT RUN**
- Browser rendering, interaction, labels, hit testing, and FPS at 1,000.
- Production LOD implementation, focus navigation, and paid admission.
- Native IndexedDB browser serialization.
- Phone/tablet/enterprise/cloud/deployment.

This is a feasibility prototype, not paid-edition acceptance.

## 11. Unresolved blockers

- Cluster LOD is demonstrated only for the flat-1,000 overview/focus case; mixed and deep clustering require further design.
- Full 1,000-node labels/search/hit-testing are NOT RUN.
- V2 angular clearance requires a fundamentally different full geometry or lower information density.
- Browser-level performance cannot be inferred from Node timings.

