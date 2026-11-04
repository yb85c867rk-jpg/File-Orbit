# Adaptive Harness Stage Builder

## Control-flow contract

`tests/harness/m5-adaptive-layout/layout-builder.mjs` is the shared stage
sequencer used by the browser harness and executable tests.

```text
baseline -> baseline staged
v1       -> v1 staged
v2       -> v2 staged
             -> refinement (if checked)
             -> crowding correction (if checked)
```

- `refinement` and `crowding` are function-scope result variables.
- The two controls are independent sibling conditionals; neither is nested in
  the other.
- When both are enabled: `v2 -> refinement -> crowding`.
- Crowding-only applies directly to the accepted v2 result.
- Baseline and v1 always return `refinement:null`, `crowding:null`.
- Refinement/crowding controls ignored for baseline/v1.
- No global crowding binding or error suppression.

## Regression

`tests/engine/layout/harness-build-layout.test.mjs` executes the shared builder,
not a reimplementation:

- baseline and v1 records plus scene preparation;
- v2 neither option;
- v2 refinement only;
- v2 crowding only;
- v2 both options;
- explicit stage-call order `['v2','refine','crowd']`;
- baseline construction reaches `prepareGraphScene()` without
  `ReferenceError: crowding is not defined`.

The harness `buildLayout()` calls `buildLayoutPlan()` with its real control
values and returns the stage record unchanged except for measured elapsed time.

Browser verification remains NOT RUN; executable coverage is Node-level.

