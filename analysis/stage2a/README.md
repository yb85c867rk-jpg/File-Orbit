# Stage 2A analysis harness

Run:
```sh
node analysis/stage2a/run.mjs
```

Outputs `results.json` with three repetitions per fixture plus parity, binary, 1,000-node diagnostic benchmark, reference-radius probe, and cluster/focus results.

This directory is analysis-only. It is not imported by the application. Normal application defaults remain 300 nodes, V2 reference radius 240, workspace scale max 16, and diagnostic cap 300.
