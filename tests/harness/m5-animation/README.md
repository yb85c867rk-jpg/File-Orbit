# M5 Animated Focus Harness

Deterministic browser harness for immediate Möbius focus with an optional
requestAnimationFrame-driven transition. It preserves mouse selection and adds
an explicit **Animate focus selected** button. There is no focus-on-click,
pan/zoom, touch, keyboard navigation, opening, preview, search, or file access.

## Run

From the authorized project root:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

```text
http://127.0.0.1:8765/tests/harness/m5-animation/
```

Equivalent loopback static server rooted at the project root works. Native ESM
requires HTTP; `file://` is not supported.

## Controls

- F20/F200, current/start/end phase, actual/synthetic DPR.
- Single-click selection.
- Duration in milliseconds, 0–10000; default 300. Duration 0 uses the immediate
  path.
- **Animate focus selected**.
- **Reset focus**, clear selection, resize, destroy/recreate.
- Reduced motion is checked when a transition starts via
  `prefers-reduced-motion: reduce`; when requested, duration is forced to 0 and
  the reason is reported.

Focus is immediate when requested by the button. Clicking a node only selects;
it does not automatically focus.

## Status

```js
window.__M5_ANIMATION_STATUS__
```

Includes animation lifecycle/state, requested and displayed focus, selected ID,
start/target/current parameters, elapsed/eased/raw progress, frame count,
completion/cancellation/failure reason, pending-frame ownership, reduced-motion
decision, candidate/displayed focus coordinates and center error, generation,
controller phase/viewport, graph/label counts, lifecycle, separated user and
programmatic events, numerical probes, and errors.

Manual status extraction:

```js
copy(JSON.stringify(window.__M5_ANIMATION_STATUS__, null, 2))
```

## Limits

Intermediate hit snapshots are not installed. Selection interaction is inactive
during animation. Browser animation verification is **NOT RUN** unless manually
executed; mocked timing and rendering are not FPS, smoothness, or device
evidence.
