import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { computeRadialLayout } from '../../../src/engine/hypertree/layout/index.js';
import { createFocusAnimator } from '../../../src/engine/hypertree/focus/index.js';
import { f20 } from '../layout/fixtures.mjs';

function baseLayout() {
  const { graph } = loadTree(f20());
  return computeRadialLayout(graph, {
    rootId: 'n0',
    phases: ['current', 'start', 'end'],
    nodeOptions: { overridable: true },
    radius: 100,
    offset: 0.1
  });
}

function controlledScheduler(options = {}) {
  let now = 0;
  let nextId = 0;
  let requests = 0;
  const callbacks = new Map();
  return {
    now: () => {
      if (options.nowThrows) throw new Error('clock failed');
      if (options.nonFiniteNow) return Number.NaN;
      return now;
    },
    advance(ms) { now += ms; },
    requestFrame(cb) {
      requests += 1;
      if (options.throwOnRequest === requests) {
        if (options.retainFailedCallback) callbacks.set(++nextId, cb);
        throw new Error(`request failed ${requests}`);
      }
      const id = ++nextId;
      callbacks.set(id, cb);
      return id;
    },
    cancelFrame(id) {
      if (!options.retainCancelled) callbacks.delete(id);
    },
    fire() {
      const entries = [...callbacks.entries()];
      callbacks.clear();
      for (const [, cb] of entries) cb(now);
      return entries.length;
    },
    pending() { return callbacks.size; },
    requests() { return requests; }
  };
}

function recorder() {
  const frames = [];
  const completes = [];
  const errors = [];
  const settles = [];
  return {
    frames,
    completes,
    errors,
    settles,
    onFrame(frame) { frames.push(frame); },
    onComplete(frame) { completes.push(frame); },
    onError(event) { errors.push(event); },
    onSettled(event) { settles.push(event); }
  };
}

function makeAnimator(scheduler, record, duration = 300) {
  return createFocusAnimator({
    now: scheduler.now,
    requestFrame: scheduler.requestFrame,
    cancelFrame: scheduler.cancelFrame,
    duration,
    onFrame: record.onFrame,
    onComplete: record.onComplete,
    onError: record.onError,
    onSettled: record.onSettled
  });
}

test('initial clock throws or is non-finite enters failed state with no scheduling', () => {
  const base = baseLayout();
  for (const clock of [
    () => { throw new Error('clock failed'); },
    () => Number.NaN,
    () => Number.POSITIVE_INFINITY
  ]) {
    const record = recorder();
    const animator = createFocusAnimator({
      now: clock,
      requestFrame() { throw new Error('must not schedule'); },
      cancelFrame() {},
      duration: 300,
      onFrame: record.onFrame,
      onComplete: record.onComplete,
      onError: record.onError,
      onSettled: record.onSettled
    });
    const result = animator.start({ base, focusId: 'n13' });
    assert.equal(result.status, 'failed');
    assert.equal(animator.getState().state, 'failed');
    assert.equal(animator.getState().pendingFrame, false);
    assert.equal(record.frames.length, 0);
    assert.equal(record.errors.length, 1);
    assert.equal(record.settles.length, 1);
    assert.equal(record.completes.length, 0);
  }
});

test('initial requestFrame failure clears pending ownership and notifies once', () => {
  const base = baseLayout();
  const scheduler = controlledScheduler({ throwOnRequest: 1 });
  const record = recorder();
  const animator = makeAnimator(scheduler, record);
  const result = animator.start({ base, focusId: 'n13' });
  assert.equal(result.status, 'failed');
  assert.equal(animator.getState().state, 'failed');
  assert.equal(animator.getState().pendingFrame, false);
  assert.equal(record.frames.length, 1);
  assert.equal(record.completes.length, 0);
  assert.equal(record.errors.length, 1);
  assert.equal(record.settles.length, 1);
  scheduler.fire();
  assert.equal(record.frames.length, 1);
});

test('subsequent requestFrame failure is terminal and stale callbacks stay inert', () => {
  const base = baseLayout();
  const scheduler = controlledScheduler({ throwOnRequest: 2, retainFailedCallback: true });
  const record = recorder();
  const animator = makeAnimator(scheduler, record);
  animator.start({ base, focusId: 'n13' });
  assert.equal(record.frames.length, 1);
  scheduler.advance(150);
  scheduler.fire();
  assert.equal(animator.getState().state, 'failed');
  assert.equal(animator.getState().pendingFrame, false);
  assert.equal(record.completes.length, 0);
  assert.equal(record.errors.length, 1);
  assert.equal(record.settles.length, 1);
  const before = record.frames.length;
  scheduler.fire();
  assert.equal(record.frames.length, before);
  assert.equal(animator.getState().state, 'failed');
});

test('clock failures inside scheduled callbacks fail without further drawing', () => {
  const base = baseLayout();
  for (const mode of ['throw', 'nan']) {
    const scheduler = controlledScheduler();
    const record = recorder();
    let shouldFail = false;
    const animator = createFocusAnimator({
      now: () => {
        if (shouldFail) {
          if (mode === 'throw') throw new Error('callback clock failed');
          return Number.NaN;
        }
        return scheduler.now();
      },
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame,
      duration: 300,
      onFrame: record.onFrame,
      onComplete: record.onComplete,
      onError: record.onError
    });
    animator.start({ base, focusId: 'n13' });
    const framesBefore = record.frames.length;
    shouldFail = true;
    scheduler.fire();
    assert.equal(animator.getState().state, 'failed');
    assert.equal(animator.getState().pendingFrame, false);
    assert.equal(record.errors.length, 1);
    assert.equal(record.frames.length, framesBefore);
    scheduler.fire();
    assert.equal(record.frames.length, framesBefore);
  }
});

test('unsupported clock and scheduler configuration rejects explicitly', () => {
  assert.throws(
    () => createFocusAnimator({ now: 5, requestFrame() {}, cancelFrame() {}, onFrame() {}, onComplete() {} }),
    (error) => error.code === 'invalid-animation'
  );
  assert.throws(
    () => createFocusAnimator({ requestFrame: {}, cancelFrame() {}, onFrame() {}, onComplete() {} }),
    (error) => error.code === 'invalid-animation'
  );
  assert.throws(
    () => createFocusAnimator({ requestFrame() {}, cancelFrame: {}, onFrame() {}, onComplete() {} }),
    (error) => error.code === 'invalid-animation'
  );
  const base = baseLayout();
  const animator = createFocusAnimator({
    now: () => 0,
    requestFrame() {},
    onFrame() {},
    onComplete() {},
    duration: 300
  });
  assert.throws(
    () => animator.start({ base, focusId: 'n13' }),
    (error) => error.code === 'invalid-animation'
  );
});

test('destroy releases last-frame view data after completion, running, and failure', () => {
  const base = baseLayout();

  const completedScheduler = controlledScheduler();
  const completed = makeAnimator(completedScheduler, recorder(), 0);
  completed.start({ base, focusId: 'n13' });
  assert.equal(completed.getState().state, 'completed');
  assert.equal(completed.getState().lastFrame.view.staged.nodes.size, 20);
  completed.destroy();
  completed.destroy();
  assert.equal(completed.getState().state, 'destroyed');
  assert.equal(completed.getState().lastFrame, null);
  assert.equal(completed.getState().pendingFrame, false);

  const runningScheduler = controlledScheduler();
  const running = makeAnimator(runningScheduler, recorder());
  running.start({ base, focusId: 'n13' });
  running.destroy();
  assert.equal(running.getState().state, 'destroyed');
  assert.equal(running.getState().lastFrame, null);
  assert.equal(running.getState().pendingFrame, false);
  runningScheduler.fire();
  assert.equal(running.getState().state, 'destroyed');

  const failScheduler = controlledScheduler();
  const failed = createFocusAnimator({
    now: failScheduler.now,
    requestFrame: failScheduler.requestFrame,
    cancelFrame: failScheduler.cancelFrame,
    duration: 300,
    onFrame() { throw new Error('frame failed'); },
    onComplete() {},
    onError() {}
  });
  failed.start({ base, focusId: 'n13' });
  assert.equal(failed.getState().state, 'failed');
  failed.destroy();
  assert.equal(failed.getState().state, 'destroyed');
  assert.equal(failed.getState().lastFrame, null);
  assert.equal(failed.getState().pendingFrame, false);
});
