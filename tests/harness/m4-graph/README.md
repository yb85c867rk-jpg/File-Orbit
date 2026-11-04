# M4 Static Hypertree Graph Harness

Deterministic browser harness for static Hypertree nodes and hyperline edges.
It draws no labels, icons, hit targets, focus state, or interaction.

## Run

From the authorized project root:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8765/tests/harness/m4-graph/
```

Any equivalent static loopback server rooted at the project root works. Native
ESM imports require an HTTP origin; `file://` is not supported.

## Controls

- Fixture: deterministic F20 or F200 tree.
- Phase: current/start/end.
- DPR: actual browser DPR or synthetic 1/1.25/2/3, clearly distinguished.
- Resize: calls `surface.resize()` on the existing canvas.
- Recreate: destroys and rebuilds the canvas/layout.
- Destroy: idempotently removes the harness canvas.

## Status

Runtime machine-readable object:

```js
window.__M4_GRAPH_STATUS__
```

It reports operation, fixture/phase, actual/synthetic DPR, CSS/backing sizes,
canvas identity preservation, requested/prepared/drawn node and edge counts,
surface state, and errors. `status.json` is the static NOT_RUN checkpoint.

## Limits

This harness does not establish browser text/label rendering, hit testing,
focus, animation, mobile compatibility, visual sharpness, or full graph/engine
completion. Actual browser graph verification is **NOT RUN** unless manually
executed through this loopback page and recorded separately.
