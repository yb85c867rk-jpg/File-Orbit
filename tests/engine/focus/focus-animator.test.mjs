import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { computeRadialLayout } from '../../../src/engine/hypertree/layout/index.js';
import {
  createFocusAnimator
} from '../../../src/engine/hypertree/focus/index.js';
import { f20 } from '../layout/fixtures.mjs';

function setup() {
  const { graph } = loadTree(f20());
  return computeRadialLayout(graph, {
    rootId: 'n0',
    phases: ['current', 'start', 'end'],
    nodeOptions: { overridable: true },
    radius: 100,
    offset: 0.1
  });
}

function scheduler(retainCancelledCallbacks = false) {
  let now = 0;
  let nextId = 0;
  const callbacks = new Map();
  const cancelled = [];
  return {
    now: () => now,
    advance(ms) { now += ms; },
    requestFrame(cb) {
      const id = ++nextId;
      callbacks.set(id, cb);
      return id;
    },
    cancelFrame(id) {
      cancelled.push(id);
      if (!retainCancelledCallbacks) callbacks.delete(id);
    },
    fire() {
      const entries = [...callbacks.entries()];
      callbacks.clear();
      for (const [, cb] of entries) cb(now);
      return entries.length;
    },
    pending() { return callbacks.size; },
    cancelled
  };
}

function callbacks() {
  const frames = [];
  const completes = [];
  const errors = [];
  const cancels = [];
  return {
    frames,
    completes,
    errors,
    cancels,
    onFrame(frame) { frames.push(frame); },
    onComplete(frame) { completes.push(frame); },
    onError(event) { errors.push(event); },
    onCancel(event) { cancels.push(event); }
  };
}

test('duration zero uses the immediate path with exact final frame and completion', () => {
  const base = setup();
  const clock = scheduler();
  const cb = callbacks();
  const animator = createFocusAnimator({
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    duration: 0,
    onFrame: cb.onFrame,
    onComplete: cb.onComplete,
    onError: cb.onError
  });
  const result = animator.start({ base, focusId: 'n13' });
  assert.equal(result.status, 'completed');
  assert.equal(animator.getState().state, 'completed');
  assert.equal(cb.frames.length, 1);
  assert.equal(cb.frames[0].progress, 1);
  assert.equal(cb.completes.length, 1);
  assert.equal(animator.getState().pendingFrame, false);
  assert.equal(clock.pending(), 0);
  assert.equal(animator.getState().frameCount, 1);
});

test('elapsed-time progress, easing, and one pending callback maximum', () => {
  const base = setup();
  const clock = scheduler();
  const cb = callbacks();
  const animator = createFocusAnimator({
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    duration: 300,
    onFrame: cb.onFrame,
    onComplete: cb.onComplete,
    onError: cb.onError
  });
  animator.start({ base, focusId: 'n13' });
  assert.equal(animator.getState().state, 'running');
  assert.equal(clock.pending(), 1);
  assert.equal(cb.frames.length, 1);
  assert.equal(cb.frames[0].progress, 0);

  clock.advance(50);
  clock.fire();
  assert.equal(cb.frames.at(-1).progress, 50 / 300);
  assert.ok(Math.abs(cb.frames.at(-1).eased - (4 * (50 / 300) ** 3)) < 1e-12);
  assert.equal(clock.pending(), 1);
  assert.equal(animator.getState().pendingFrame, true);

  clock.advance(200);
  clock.fire();
  assert.equal(cb.frames.at(-1).progress, 250 / 300);
  assert.equal(clock.pending(), 1);

  clock.advance(200);
  clock.fire();
  assert.equal(cb.frames.at(-1).progress, 1);
  assert.equal(cb.frames.at(-1).eased, 1);
  assert.equal(animator.getState().state, 'completed');
  assert.equal(animator.getState().elapsedMs, 450);
  assert.equal(animator.getState().pendingFrame, false);
  assert.equal(clock.pending(), 0);
  assert.equal(cb.completes.length, 1);
});

test('busy requests are rejected without starting another frame chain', () => {
  const base = setup();
  const clock = scheduler();
  const cb = callbacks();
  const animator = createFocusAnimator({
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    duration: 300,
    onFrame: cb.onFrame,
    onComplete: cb.onComplete
  });
  animator.start({ base, focusId: 'n13' });
  const beforeFrames = cb.frames.length;
  const result = animator.start({ base, focusId: 'n6' });
  assert.equal(result.status, 'busy');
  assert.equal(cb.frames.length, beforeFrames);
  assert.equal(clock.pending(), 1);
  animator.destroy();
});

test('cancel before first callback and stale callbacks do not draw', () => {
  const base = setup();
  const clock = scheduler(true);
  const cb = callbacks();
  const animator = createFocusAnimator({
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    duration: 300,
    onFrame: cb.onFrame,
    onComplete: cb.onComplete,
    onCancel: cb.onCancel
  });
  animator.start({ base, focusId: 'n13' });
  const framesBefore = cb.frames.length;
  animator.cancel('reset');
  assert.equal(animator.getState().state, 'cancelled');
  assert.equal(clock.pending(), 1); // retained stale callback in this test scheduler
  assert.equal(cb.cancels.length, 1);
  assert.equal(cb.frames.length, framesBefore);
  assert.equal(animator.getState().pendingFrame, false);

  // Simulate a scheduler callback that was already queued despite cancellation.
  clock.fire();
  assert.equal(cb.frames.length, framesBefore);
  assert.equal(animator.getState().state, 'cancelled');
  assert.equal(clock.pending(), 0);
});

test('cancel during animation and destroy are terminal and idempotent', () => {
  const base = setup();
  const clock = scheduler();
  const cb = callbacks();
  const animator = createFocusAnimator({
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    duration: 300,
    onFrame: cb.onFrame,
    onComplete: cb.onComplete,
    onCancel: cb.onCancel
  });
  animator.start({ base, focusId: 'n13' });
  clock.advance(100);
  clock.fire();
  assert.equal(animator.getState().state, 'running');
  animator.cancel('resize');
  assert.equal(animator.getState().state, 'cancelled');
  animator.destroy();
  animator.destroy();
  assert.equal(animator.getState().state, 'destroyed');
  assert.equal(clock.pending(), 0);
  assert.throws(() => animator.start({ base, focusId: 'n6' }), (error) => error.code === 'invalid-lifecycle');
});

test('frame and completion exceptions fail without scheduled work', () => {
  const base = setup();
  const clock = scheduler();
  const errors = [];
  let mode = 'frame';
  const animator = createFocusAnimator({
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    duration: 300,
    onFrame() {
      if (mode === 'frame') throw new Error('draw failed');
      return undefined;
    },
    onComplete() {
      if (mode === 'complete') throw new Error('install failed');
    },
    onError(event) { errors.push(event); }
  });
  animator.start({ base, focusId: 'n13' });
  assert.equal(animator.getState().state, 'failed');
  assert.equal(errors.length, 1);
  assert.equal(clock.pending(), 0);

  // A fresh controller can fail during completion after final drawing.
  const clock2 = scheduler();
  const animator2 = createFocusAnimator({
    now: clock2.now,
    requestFrame: clock2.requestFrame,
    cancelFrame: clock2.cancelFrame,
    duration: 300,
    onFrame() {},
    onComplete() { throw new Error('install failed'); },
    onError(event) { errors.push(event); }
  });
  mode = 'complete';
  animator2.start({ base, focusId: 'n13' });
  clock2.advance(300);
  clock2.fire();
  assert.equal(animator2.getState().state, 'failed');
  assert.equal(clock2.pending(), 0);
  assert.equal(errors.length, 2);
  animator.destroy();
  animator2.destroy();
});

test('async frame callbacks are rejected instead of counted as displayed evidence', () => {
  const base = setup();
  const clock = scheduler();
  const errors = [];
  const animator = createFocusAnimator({
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    duration: 300,
    onFrame() { return Promise.resolve(); },
    onComplete() {},
    onError(event) { errors.push(event); }
  });
  animator.start({ base, focusId: 'n13' });
  assert.equal(animator.getState().state, 'failed');
  assert.equal(animator.getState().frameCount, 0);
  assert.equal(errors.length, 1);
  assert.equal(clock.pending(), 0);
  animator.destroy();
});

test('duration and scheduler validation are explicit', () => {
  const base = setup();
  assert.throws(() => createFocusAnimator({ duration: Number.NaN, onFrame() {}, onComplete() {} }),
    (error) => error.code === 'invalid-animation');
  assert.throws(() => createFocusAnimator({ duration: -1, onFrame() {}, onComplete() {} }),
    (error) => error.code === 'invalid-animation');
  assert.throws(() => createFocusAnimator({ duration: 10001, onFrame() {}, onComplete() {} }),
    (error) => error.code === 'invalid-animation');
  const noScheduler = createFocusAnimator({
    now: () => 0,
    duration: 300,
    onFrame() {},
    onComplete() {}
  });
  assert.throws(
    () => noScheduler.start({ base, focusId: 'n13' }),
    (error) => error.code === 'invalid-animation'
  );
  assert.equal(noScheduler.getState().state, 'idle');
});

