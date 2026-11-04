import test from 'node:test';
import assert from 'node:assert/strict';

import { createNodeDragGesture } from '../../../src/engine/hypertree/exploration/index.js';

class Canvas extends EventTarget {
  constructor(hit = null) { super(); this.hit = hit; this.captured = null; this.pointerBubbles = 0; }
  setPointerCapture(id) { this.captured = id; }
  releasePointerCapture(id) { if (this.captured === id) this.captured = null; }
}
function ev(type, props) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 0, ...props });
  return event;
}
function setup({ enabled = true, hit = { id: 'file' } } = {}) {
  const canvas = new Canvas();
  const calls = { start: 0, move: 0, drop: 0, cancel: 0 };
  const gesture = createNodeDragGesture({
    canvas,
    hitAt: () => hit,
    isEnabled: () => enabled,
    onStart: () => { calls.start += 1; },
    onMove: () => { calls.move += 1; },
    onDrop: () => { calls.drop += 1; },
    onCancel: () => { calls.cancel += 1; }
  });
  return { canvas, gesture, calls };
}

test('below-threshold node press is not a drag and does not suppress click', () => {
  const { canvas, gesture, calls } = setup();
  let clicks = 0;
  canvas.addEventListener('click', () => { clicks += 1; });
  canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
  canvas.dispatchEvent(ev('pointerup', { clientX: 11, clientY: 10 }));
  canvas.dispatchEvent(ev('click', { clientX: 11, clientY: 10 }));
  assert.equal(calls.drop, 0);
  assert.equal(clicks, 1);
  assert.equal(gesture.dragging, false);
  gesture.destroy();
});

test('node drag drops once, captures pointer, and suppresses exactly one click', () => {
  const { canvas, gesture, calls } = setup();
  let clicks = 0;
  canvas.addEventListener('click', () => { clicks += 1; });
  canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
  assert.equal(canvas.captured, 1);
  canvas.dispatchEvent(ev('pointermove', { clientX: 20, clientY: 10 }));
  assert.equal(calls.move, 1);
  canvas.dispatchEvent(ev('pointerup', { clientX: 20, clientY: 10 }));
  assert.equal(calls.drop, 1);
  assert.equal(canvas.captured, null);
  canvas.dispatchEvent(ev('click', { clientX: 20, clientY: 10 }));
  canvas.dispatchEvent(ev('click', { clientX: 20, clientY: 10 }));
  assert.equal(clicks, 1);
  gesture.destroy();
});

test('background pointerdown is left to the navigation controller', () => {
  const { canvas, gesture } = setup({ hit: null });
  let backgrounds = 0;
  canvas.addEventListener('pointerdown', () => { backgrounds += 1; });
  canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
  assert.equal(backgrounds, 1);
  gesture.destroy();
});

test('pointercancel, lost capture, destroy, and disabled transition clean up', () => {
  const { canvas, gesture, calls } = setup();
  canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
  canvas.dispatchEvent(ev('pointercancel', { clientX: 10, clientY: 10 }));
  assert.equal(calls.cancel, 1);
  assert.equal(canvas.captured, null);
  canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
  canvas.dispatchEvent(new Event('lostpointercapture'));
  assert.equal(calls.cancel, 2);
  gesture.destroy();
  const disabled = setup({ enabled: false });
  disabled.canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
  assert.equal(disabled.calls.start, 0);
  disabled.gesture.destroy();
});
test('cancelled drag clears one-shot suppression before the next genuine click', async () => {
  const { canvas, gesture } = setup();
  let clicks = 0;
  canvas.addEventListener('click', () => { clicks += 1; });
  canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
  canvas.dispatchEvent(ev('pointermove', { clientX: 20, clientY: 10 }));
  canvas.dispatchEvent(ev('pointercancel', { clientX: 20, clientY: 10 }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  canvas.dispatchEvent(ev('click', { clientX: 20, clientY: 10 }));
  assert.equal(clicks, 1);
  gesture.destroy();
});

