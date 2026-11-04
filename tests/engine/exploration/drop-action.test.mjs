import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePointerUpDrop, resolvePointerUpDrop } from '../../../src/engine/hypertree/exploration/drop-action.js';
import { createDropFeedback } from '../../../src/engine/hypertree/exploration/drop-feedback.js';

function setup({ label = null, detailsKind = 'file', hit = null, gesture = null } = {}) {
  const calls = { perform: [], cleanup: 0, restore: 0, publish: 0 };
  const element = { textContent: '' };
  let timer = null;
  const feedback = createDropFeedback(element, {
    setTimer: (fn, duration) => { timer = { fn, duration }; return timer; },
    clearTimer: () => { timer = null; }
  });
  const currentGesture = gesture || { sourceId: 'x', generation: 1, datasetToken: 2, structuralRootId: 'r' };
  const event = { button: 0, clientX: 30, clientY: 40, target: { id: 'drag-source' } };
  const options = {
    sourceId: 'x', event, gesture: currentGesture, generation: 1, datasetToken: 2, structuralRootId: 'r',
    frameReady: true,
    overlay: { labelAtPoint: (x, y) => { assert.equal(x, 30); assert.equal(y, 40); return label; } },
    getDetails: () => ({ kind: detailsKind }),
    hitAtEvent: () => hit,
    cleanup: () => { calls.cleanup += 1; },
    feedback: (message) => feedback.show(message),
    performReparent: (sourceId, targetId, gestureValue) => { calls.perform.push({ sourceId, targetId, gesture: gestureValue }); return { ok: true }; },
    restore: () => { calls.restore += 1; },
    publish: () => { calls.publish += 1; }
  };
  return { options, calls, element, feedback, get timer() { return timer; }, setTimer: (value) => { timer = value; } };
}
test('data release over a visible data label rejects with exact feedback and no mutation', () => {
  const s = setup({ label: { id: 'd' }, hit: { id: 'a' } });
  const result = handlePointerUpDrop(s.options);
  assert.equal(result.action, 'rejected');
  assert.equal(result.reason, 'data-target');
  assert.equal(s.element.textContent, 'Drop onto a folder, not a data item.');
  assert.equal(s.calls.perform.length, 0);
  assert.equal(s.calls.cleanup, 1);
  assert.equal(s.calls.restore, 1);
  assert.equal(s.timer.duration, 2000);
});
test('folder hover followed by data release uses the release data target', () => {
  const s = setup({ label: { id: 'd' }, hit: { id: 'folder' } });
  const resolved = resolvePointerUpDrop(s.options);
  assert.equal(resolved.reason, 'data-target');
  assert.equal(resolved.targetId, 'd');
  assert.equal(resolved.dataTarget, true);
});
test('data hover followed by empty release remains empty-target rejection', () => {
  const s = setup({ label: null, hit: null });
  const result = handlePointerUpDrop(s.options);
  assert.equal(result.reason, 'empty');
  assert.equal(s.element.textContent, 'Drop onto a folder to move this item.');
  assert.equal(s.calls.perform.length, 0);
});
test('valid folder drop still reaches authoritative reparent action', () => {
  const s = setup({ label: null, hit: { id: 'a' } });
  const result = handlePointerUpDrop(s.options);
  assert.equal(result.action, 'reparent');
  assert.equal(result.targetId, 'a');
  assert.deepEqual(s.calls.perform.map((call) => call.targetId), ['a']);
  assert.equal(s.element.textContent, '');
});
test('stale gesture rejects before destination mutation', () => {
  const s = setup({ label: { id: 'd' }, hit: { id: 'a' }, gesture: { sourceId: 'x', generation: 9, datasetToken: 2, structuralRootId: 'r' } });
  const result = handlePointerUpDrop(s.options);
  assert.equal(result.reason, 'stale-gesture');
  assert.equal(s.element.textContent, 'The map changed. Please try dragging again.');
  assert.equal(s.calls.perform.length, 0);
});
