# Experimental Local Crowding Correction

- Status: **DEFERRED — EXPERIMENTAL, opt-in, not production-ready**.
- Reference view: v2 + Refine v2, correction Off.
- Existing global correction remains separate and unmodified.
- Local and global corrections are never applied sequentially in this comparison.
- Browser visual verification: **NOT RUN**.

## Contract and bounds

```text
max supported nodes            400
max collision-region nodes     24
candidate patterns             5 + original
candidate/evaluation budget    6
max angular change             0.20 of the node's existing angular interval
max radial inward change       0.10 of available parent/depth headroom
max layout displacement        angle 0.20 + radial 0.75 normalized budget
max mean fitted displacement   90 CSS px
max fitted displacement        220 CSS px
max unrelated mean movement    90 CSS px
```

## Method

1. Evaluate the selected v2/refined layout through the final pipeline.
2. Collect actual circle/diamond overlap pairs in the fitted scene.
3. Group leaf collision components; discard regions larger than 24 nodes.
4. Affected leaves only may move. No internal node, root, branch interval, or
   sibling order changes.
5. Candidates choose a deterministic subset (every 2nd or 3rd affected leaf),
   an optional collision-directed angular shift inside the existing interval,
   and an optional small inward radial shift.
6. Every candidate is re-fit and re-rendered with fixed 6 CSS px glyphs.
7. Acceptance requires:
   - preserved counts/visibility;
   - full glyph containment;
   - fewer overlap pairs;
   - no new overlap involving a node outside the affected set;
   - movement budgets satisfied.
8. Otherwise return the original staged object unchanged with
   `no-improving-candidate`.

This is pair-measured but **not pair-targeted node dragging**. No node editing or
drag-and-drop is implemented.

## Actual comparison

Primary 1100×473, fixed 6 px, padding 24, same fit policy:

| Fixture | Off overlaps | Local outcome | Local overlaps | Global overlaps | Global mean displacement |
|---|---:|---|---:|---:|---:|
| F20 | 0 | no-crowding | 0 | 0 | 0 |
| F200 | 104 | **no-improving-candidate** | **104** | 54 | 172.7 |
| crowdedFolder | 0 | no-crowding | 0 | 0 | 0 |
| denseNeighbors | 0 | no-crowding | 0 | 0 | 0 |
| mixedDeepWide | 0 | no-crowding | 0 | 0 | 0 |
| longLabels | 0 | no-crowding | 0 | 0 | 0 |

F200 at 1100×473:

```text
affected nodes      52
collision regions   11
local candidates    5
result              no-improving-candidate
overlaps            104 -> 104
displacement        0
residual            104 pairs
```

F200 at 800×600:

```text
Off     48
Local   48 (no-improving-candidate)
Global  10
```

The permitted local movement does **not materially reduce F200 crowding**.
Candidates either add overlaps or fail to reduce them. This is reported as a
limitation, not solved.

Residual local collisions remain concentrated in the dense right-hand branches
at intermediate depths; no local candidate stayed within all movement budgets
while reducing final overlaps.

## Harness

Correction control:

```text
Correction: Off | Local experimental | Existing global experimental
```

`Refine v2` remains independent. Local/global are alternatives, not a sequence.

Status distinguishes:

- requested/applied correction mode;
- local affected/region counts;
- candidates/attempts;
- before/after overlaps;
- local/fitted/unrelated displacement and budget compliance;
- residual collision count/by-depth/sample;
- fit/projection/current-frame match.

Labels are unchanged (`legacy`/`around` policies remain separate).

## Tests

- local tests: **6/6 PASS**.
- combined experimental: **59/59 PASS**.
- M4: **71/71 PASS**.
- M5 with fit/reset: **111/111 PASS**.
- M3: **50/50 PASS**.
- unique total: **446**.
- syntax: PASS.
- browser: NOT RUN.

## Recommendation

Keep local correction **EXPERIMENTAL and opt-in**, but do not promote it: it
does not materially improve F200 under the declared budgets. The global
correction remains a separate experimental comparison with its known visual
tradeoff. No second local algorithm was started.
## Known limitations (deferred, intentionally not fixed in this slice)

1. **End-only phases are incomplete.** The local module's internal movement and
   displacement inspection still reads `current`-phase positions. A staged
   layout whose selected phase set excludes `current` can throw even when the
   selected phase itself is valid. The module is therefore demonstrated only
   with the harness's phase set that includes `current`.
2. **Radial budget mismatch is documented, not reconciled.** The actual inward
   radial movement is capped at `0.10` of available headroom in the candidate
   construction, while exported `LOCAL_CROWDING_MAX_RADIAL_FRACTION` is `0.75`
   and the acceptance layout budget uses `angle 0.20 + radial 0.75`. The
   exported value is a coarse acceptance cap, not the movement actually applied.

These limitations mean local crowding is **not production-ready**. The
experiment is closed as deferred; do not promote it or use it as the reference
view. No new crowding algorithm is authorized from this slice.




































