import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNodeDragGesture } from '../../../src/engine/hypertree/exploration/index.js';
import { createPointerUpDropHandler } from '../../../src/engine/hypertree/exploration/drop-controller.js';
import { createDropFeedback } from '../../../src/engine/hypertree/exploration/drop-feedback.js';

class FakeHost {
  constructor() { this.listeners = []; }
  addEventListener(type, handler, capture = false) { this.listeners.push({ type, handler, capture: Boolean(capture) }); }
  removeEventListener(type, handler, capture = false) { this.listeners = this.listeners.filter((entry) => !(entry.type === type && entry.handler === handler && entry.capture === Boolean(capture))); }
  setPointerCapture() {}
  releasePointerCapture() {}
  fire(type, event) { for (const entry of [...this.listeners]) if (entry.type === type) entry.handler(event); }
}
function pointer(type, x, y) { return { type, button: 0, pointerType: 'mouse', isPrimary: true, pointerId: 1, clientX: x, clientY: y, preventDefault() {}, stopPropagation() {} }; }

function setup() {
  const host = new FakeHost();
  const element = { textContent: '' };
  const feedback = createDropFeedback(element, { setTimer: (fn, duration) => ({ fn, duration }), clearTimer: () => {} });
  let gesture = null;
  let generation = 1;
  let datasetToken = 2;
  let structuralRootId = 'r';
  let release = { label: null, hit: null };
  let hover = { label: null, hit: null };
  const calls = { cleanup: 0, restore: 0, publish: 0, perform: [] };
  const handler = createPointerUpDropHandler({
    getGesture: () => gesture,
    getDragIdentity: () => ({ generation, datasetToken, structuralRootId, frameReady: true }),
    overlay: { labelAtPoint: (x) => (x >= 20 ? release.label : hover.label) },
    getDetails: (id) => ({ kind: id === 'data' ? 'file' : 'folder' }),
    hitAtEvent: (event) => (event.clientX >= 20 ? release.hit : hover.hit),
    cleanup: () => { calls.cleanup += 1; },
    feedback: (message) => feedback.show(message),
    performReparent: (sourceId, targetId, gestureValue) => { calls.perform.push({ sourceId, targetId, gesture: gestureValue }); return { ok: true }; },
    restore: () => { calls.restore += 1; },
    publish: () => { calls.publish += 1; }
  });
  const drag = createNodeDragGesture({
    canvas: host, threshold: 4, hitAt: () => ({ id: 'data' }),
    onStart: ({ id }) => { gesture = { sourceId: id, generation, datasetToken, structuralRootId }; },
    onDrop: handler
  });
  return {
    host, drag, element, calls,
    setRelease(value) { release = value; },
    setHover(value) { hover = value; },
    setStale() { generation = 9; },
    get gesture() { return gesture; }
  };
}
function dragTo(s, x, y) {
  s.host.fire('pointerdown', pointer('pointerdown', 0, 0));
  s.host.fire('pointermove', pointer('pointermove', x, y));
  s.host.fire('pointerup', pointer('pointerup', x, y));
}

test('actual drag controller callback posts exact English feedback for data release with no mutation', () => {
  const s = setup();
  s.setRelease({ label: { id: 'data' }, hit: { id: 'folder' } });
  dragTo(s, 20, 20);
  assert.equal(s.element.textContent, 'Drop onto a folder, not a data item.');
  assert.equal(s.calls.perform.length, 0);
  assert.equal(s.calls.cleanup, 1);
  assert.equal(s.calls.restore, 1);
  assert.equal(s.calls.publish, 1);
  s.drag.destroy();
});
test('folder hover followed by data release uses the release destination', () => {
  const s = setup();
  s.setHover({ label: { id: 'folderlabel' }, hit: { id: 'folder' } });
  s.setRelease({ label: { id: 'data' }, hit: { id: 'folder' } });
  dragTo(s, 20, 20);
  assert.equal(s.element.textContent, 'Drop onto a folder, not a data item.');
  assert.equal(s.calls.perform.length, 0);
  s.drag.destroy();
});
test('data hover followed by empty release reports empty without mutation', () => {
  const s = setup();
  s.setHover({ label: { id: 'data' }, hit: null });
  s.setRelease({ label: null, hit: null });
  dragTo(s, 20, 20);
  assert.equal(s.element.textContent, 'Drop onto a folder to move this item.');
  assert.equal(s.calls.perform.length, 0);
  s.drag.destroy();
});
test('valid folder release reparents once and stale gesture rejects before mutation', () => {
  const s = setup();
  s.setRelease({ label: null, hit: { id: 'folder' } });
  dragTo(s, 20, 20);
  assert.deepEqual(s.calls.perform.map((call) => call.targetId), ['folder']);
  s.drag.destroy();

  const stale = setup();
  stale.setRelease({ label: { id: 'data' }, hit: { id: 'folder' } });
  stale.host.fire('pointerdown', pointer('pointerdown', 0, 0));
  stale.host.fire('pointermove', pointer('pointermove', 20, 20));
  stale.setStale();
  stale.host.fire('pointerup', pointer('pointerup', 20, 20));
  assert.equal(stale.calls.perform.length, 0);
  stale.drag.destroy();
});
test('main harness consumes the shared controller adapter, not the old inline onDrop', () => {
  const main = readFileSync(new URL('../../harness/m5-exploration/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /onDrop: createPointerUpDropHandler\(/);
  assert.doesNotMatch(main, /const hit = hitAtEvent\(event\);\s*const target = resolveDropTarget/);
  assert.doesNotMatch(main, /[\uAC00-\uD7AF]/);
});

