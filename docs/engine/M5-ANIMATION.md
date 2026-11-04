# M5 Animated Focus — Contract and Source Mapping

- Status: **animated focus slice implemented**; automatic focus-on-click, pan/zoom, touch, keyboard navigation, opening, previews, search, filesystem, Vue, and native integration are NOT implemented.
- Legacy reference: unchanged `vendor/jit/jit.2.0.1.js`, SHA-256 `4A413A0A21435AEE893EBE3572CAEB5EA81B14C437FA8BEC3AABB5F7A921546F`.
- Browser animation verification: **NOT RUN**.

## 1. Pure transition arithmetic

A view is represented by the Möbius parameter:

```text
T_c(z) = (z + c) / (1 + conjugate(c) z)
```

- Base view: `c = 0`.
- Completed focus on base point `f`: `c = -f`.
- Every frame resolves every node from the authoritative base layout.
- Intermediate frames interpolate **c**, never node Cartesian/polar positions.
- Progress is clamped to `[0,1]`.
- Easing: deterministic ease-in-out cubic.

API:

```js
focusParameter(base, focusId, phase)
sampleFocusTransition(base, {
  focusId,
  phase,
  fromParameter,
  progress
})
```

Validation:

- start/end parameters finite and strictly inside the open unit disk;
- every transformed node result finite and inside the open disk;
- no coordinate clamping;
- center tolerance `1e-12` retained for completed target view;
- endpoint progress 0/1 uses exact parameter objects, matching accepted
  immediate-focus results.

No cumulative transformation is performed. Returned positions are independently
owned and the base layout is not mutated.

## 2. Animation controller

File: `focus-animator.js`.

```js
const animator = createFocusAnimator({
  duration,             // default 300 ms; 0 uses immediate path
  now,                  // monotonic clock injection
  requestFrame,
  cancelFrame,
  onFrame,              // synchronous draw callback
  onComplete,           // synchronous final-install callback
  onError,
  onCancel,
  onSettled
});
```

State machine:

```text
idle -> running -> completed
                -> cancelled
                -> failed
                -> destroyed
```

Rules:

- duration finite `0..10000` ms;
- progress from elapsed time, not frame count;
- at most one pending rAF;
- no setInterval/perpetual loop;
- callbacks use a cancellation token; queued stale callbacks cannot draw;
- `duration=0` draws/completes synchronously without scheduling;
- busy start requests return `{status:'busy'}` and do not retarget/queue;
- `onFrame` and `onComplete` must be synchronous; thenables are rejected;
- failure/completion/cancellation leaves zero scheduled callbacks;
- destroy is idempotent and clears retained last-frame/view/base/config references; diagnostics keep `lastFrame:null`, `pendingFrame:false`;
- destroy releases animator-owned references only; frame snapshots already retained by external callers cannot be revoked.
- clock/scheduler function configuration is validated; animation requires requestFrame and cancelFrame;
- clock exceptions/non-finite readings and requestFrame failures in start or later callbacks route through one terminal failure path, clearing pending ownership and preserving stale-token protection;
- intermediate progress is never a completed target focus.

## 3. Frame integration

Harness `tests/harness/m5-animation/`:

1. Invalidate selection interaction at animation start.
2. Sample every frame from the base; rebuild scene, node sizes, hyperlines,
   labels, and draw.
3. Do not install hit snapshots on intermediate frames.
4. On successful final frame:
   - draw exact final view, including restored selection ring;
   - install hit snapshot with a strictly increasing generation;
   - restore selected ID only if still hittable;
   - mark displayed focus completed only after installation.
5. On preparation/drawing/label/install failure:
   - cancel scheduled work;
   - invalidate interaction;
   - report failure and do not claim displayed target focus;
   - no pixel-transactional rollback claim.

Selection restoration uses controller `restoreSelection`, not a synthetic click.

## 4. Cancellation policy

- Reset during animation: cancel; install base view immediately.
- Resize/DPR during animation: cancel; restore last completed focus using the new
  viewport; install its matching interaction frame.
- Fixture/phase replacement: cancel; reset focus/selection; install new base.
- Destroy: cancel and release owned resources.
- Recreate: base view, no selection.
- Cancellation never leaves an intermediate view paired with old hit geometry.

## 5. Reduced motion

Harness checks `prefers-reduced-motion: reduce` at transition start. When true,
duration is forced to 0 and status records `animationSkippedReason:
'prefers-reduced-motion'`. Preference observation is browser-only and outside
the pure engine. No preference-change observer is implemented.

## 6. Verification

Focus tests cover:

- start/end parameter equivalence to immediate focus
- intermediate coherent transforms / no cumulative drift
- F20/F200 finite open-disk results
- input immutability
- elapsed-time progress under irregular intervals
- duration 0 and immediate path
- one pending rAF maximum
- busy requests
- cancellation before first callback / stale callbacks / destroy
- sampling/draw/completion exceptions
- async callback rejection
- final draw before hit installation
- intermediate clicks inert
- selection restoration without click evidence
- final hit geometry

M4 render/static: **58/58**.

M5 selection/controller: **28/28**.

M5 focus/animation: **40/40**.

M5 navigation: **22/22**.
Combined M5: **90/90**.

Browser animation verification: **NOT RUN**. Mocked timing/rendering is not FPS,
smoothness, memory, or device evidence.

## 7. Harness

`tests/harness/m5-animation/` includes F20/F200, phase, actual/synthetic DPR,
selection, explicit animated-focus/reset, resize, destroy/recreate, duration
control, reduced-motion handling, status, and separated user/programmatic/
numerical evidence.

```text
http://127.0.0.1:8765/tests/harness/m5-animation/
```

```js
copy(JSON.stringify(window.__M5_ANIMATION_STATUS__, null, 2))
```

## 8. Limitations

- No automatic focus-on-click.
- No pan/zoom, touch, keyboard navigation, or accessibility certification.
- No opening/previews/search/filesystem/Vue/native.
- No full M5/application/browser/device parity claim.
- Animation smoothness/FPS/memory are unmeasured.









