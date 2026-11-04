import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMouseNavigationController,
  CAMERA_LIMITS
} from '../../../src/engine/hypertree/navigation/index.js';

function fakeCanvas() {
  const listeners = new Map();
  const added = [];
  const removed = [];
  const events = [];
  let captured = null;
  let prevented = 0;
  let stopped = 0;
  const canvas = {
    ownerDocument: null,
    clientLeft: 0,
    clientTop: 0,
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; },
    setPointerCapture(id) { captured = id; },
    releasePointerCapture(id) { if (captured === id) captured = null; },
    addEventListener(type, fn, options) {
      added.push([type, fn, options]);
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ fn, options });
    },
    removeEventListener(type, fn, options) {
      removed.push([type, fn, options]);
      const list = listeners.get(type) || [];
      const index = list.findIndex((entry) => entry.fn === fn);
      if (index >= 0) list.splice(index, 1);
    },
    dispatch(type, event) {
      events.push([type, event]);
      for (const entry of [...(listeners.get(type) || [])]) entry.fn(event);
    },
    pointer(type, x, y, pointerId = 1, extra = {}) {
      this.dispatch(type, {
        pointerType: 'mouse', pointerId, button: 0, isPrimary: true,
        clientX: x, clientY: y, preventDefault() { prevented += 1; },
        stopImmediatePropagation() { stopped += 1; },
        ...extra
      });
    },
    wheel(deltaY, deltaMode = 0, extra = {}) {
      this.dispatch('wheel', {
        deltaY, deltaMode, ctrlKey: false, metaKey: false,
        clientX: 400, clientY: 300,
        preventDefault() { prevented += 1; },
        ...extra
      });
    },
    click(x = 10, y = 10) {
      this.dispatch('click', {
        clientX: x, clientY: y,
        preventDefault() { prevented += 1; },
        stopImmediatePropagation() { stopped += 1; }
      });
    },
    get captured() { return captured; },
    get prevented() { return prevented; },
    get stopped() { return stopped; },
    added,
    removed
  };
  return canvas;
}

function setup(options = {}) {
  const canvas = fakeCanvas();
  const cameras = [];
  const drags = [];
  const errors = [];
  const nav = createMouseNavigationController(canvas, {
    viewport: { width: 800, height: 600 },
    camera: { zoom: 1, panX: 0, panY: 0 },
    threshold: 4,
    onDragStart: () => drags.push('start'),
    onDragEnd: () => drags.push('end'),
    onCameraChange: (camera, meta) => { cameras.push({ camera, meta }); return undefined; },
    onError: (event) => errors.push(event),
    ...options
  });
  return { canvas, nav, cameras, drags, errors };
}

test('primary mouse drag crosses threshold, pans, captures, and suppresses the generated click', () => {
  const { canvas, nav, cameras, drags } = setup();
  canvas.pointer('pointerdown', 100, 100);
  assert.equal(nav.getState().captureOwned, true);
  assert.equal(canvas.captured, 1);
  canvas.pointer('pointermove', 102, 102);
  assert.equal(cameras.length, 0);
  assert.equal(nav.getState().dragging, false);
  canvas.pointer('pointermove', 110, 108);
  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].camera.panX, 10);
  assert.equal(cameras[0].camera.panY, 8);
  assert.equal(nav.getState().dragging, true);
  assert.deepEqual(drags, ['start']);
  canvas.pointer('pointerup', 115, 112);
  assert.equal(canvas.captured, null);
  assert.equal(nav.getState().dragging, false);
  assert.equal(nav.getState().suppressNextClick, true);
  canvas.click(115, 112);
  assert.equal(canvas.stopped, 1);
  assert.equal(nav.getState().suppressNextClick, false);
  assert.deepEqual(drags, ['start', 'end']);
  nav.destroy();
});

test('click below threshold remains a genuine click; next post-drag click works', () => {
  const { canvas, nav, cameras } = setup();
  canvas.pointer('pointerdown', 100, 100);
  canvas.pointer('pointermove', 102, 102);
  canvas.pointer('pointerup', 102, 102);
  canvas.click(102, 102);
  assert.equal(canvas.stopped, 0);
  assert.equal(cameras.length, 0);
  assert.equal(nav.getState().dragging, false);

  canvas.pointer('pointerdown', 200, 200);
  canvas.pointer('pointermove', 220, 220);
  canvas.pointer('pointerup', 220, 220);
  canvas.click(220, 220);
  assert.equal(canvas.stopped, 1);
  canvas.pointer('pointerdown', 300, 300);
  canvas.pointer('pointerup', 300, 300);
  canvas.click(300, 300);
  assert.equal(canvas.stopped, 1);
  nav.destroy();
});

test('pointercancel and lost capture clean up state and capture ownership', () => {
  const { canvas, nav, cameras } = setup();
  canvas.pointer('pointerdown', 100, 100);
  assert.equal(nav.getState().captureOwned, true);
  canvas.pointer('pointercancel', 100, 100);
  assert.equal(nav.getState().captureOwned, false);
  assert.equal(canvas.captured, null);
  assert.equal(nav.getState().activePointerId, null);

  canvas.pointer('pointerdown', 100, 100, 2);
  canvas.pointer('pointermove', 120, 120, 2);
  assert.equal(cameras.length, 1);
  canvas.dispatch('lostpointercapture', { pointerId: 2 });
  assert.equal(nav.getState().activePointerId, null);
  assert.equal(nav.getState().dragging, false);
  nav.destroy();
});

test('secondary buttons and non-mouse pointers are ignored', () => {
  const { canvas, nav, cameras } = setup();
  canvas.pointer('pointerdown', 100, 100, 1, { button: 2 });
  canvas.pointer('pointerdown', 100, 100, 1, { pointerType: 'touch' });
  assert.equal(nav.getState().activePointerId, null);
  canvas.pointer('pointerdown', 100, 100, 1, { button: 0 });
  canvas.pointer('pointermove', 130, 130);
  assert.equal(cameras.length, 1);
  nav.destroy();
});

test('wheel normalizes deltaMode, anchors at pointer, and bypasses ctrl/meta', () => {
  const { canvas, nav, cameras } = setup();
  canvas.wheel(-2, 1);
  assert.equal(cameras.length, 1);
  assert.ok(cameras[0].camera.zoom > 1);
  assert.equal(canvas.prevented, 1);

  canvas.wheel(10, 0, { ctrlKey: true });
  canvas.wheel(10, 0, { metaKey: true });
  assert.equal(cameras.length, 1);
  assert.equal(canvas.prevented, 1);

  canvas.wheel(99999, 0);
  assert.equal(cameras.at(-1).camera.zoom, CAMERA_LIMITS.minZoom);
  nav.destroy();
});

test('async camera replacement is rejected and does not update camera state', () => {
  const canvas = fakeCanvas();
  const nav = createMouseNavigationController(canvas, {
    viewport: { width: 800, height: 600 },
    camera: { zoom: 1, panX: 0, panY: 0 },
    onCameraChange: async () => undefined
  });
  canvas.pointer('pointerdown', 100, 100);
  canvas.pointer('pointermove', 120, 120);
  assert.equal(nav.getState().camera.panX, 0);
  assert.equal(nav.getState().error.code, 'async-frame-unsupported');
  nav.destroy();
});

test('failed camera replacement leaves old camera and error, and cleanup removes exact listeners', () => {
  const canvas = fakeCanvas();
  let calls = 0;
  const nav = createMouseNavigationController(canvas, {
    viewport: { width: 800, height: 600 },
    camera: { zoom: 1, panX: 0, panY: 0 },
    onCameraChange: () => { calls += 1; throw new Error('render failed'); }
  });
  canvas.pointer('pointerdown', 100, 100);
  canvas.pointer('pointermove', 120, 120);
  assert.equal(calls, 1);
  assert.equal(nav.getState().camera.panX, 0);
  assert.equal(nav.getState().error.message, 'render failed');
  nav.destroy();
  nav.destroy();
  assert.equal(canvas.added.length, 7);
  assert.equal(canvas.removed.length, 7);
  assert.equal(canvas.added[0][1], canvas.removed[0][1]);
});

test('two navigation instances own independent listeners and cameras', () => {
  const a = setup();
  const b = setup();
  a.canvas.pointer('pointerdown', 100, 100);
  a.canvas.pointer('pointermove', 120, 120);
  assert.equal(a.cameras.length, 1);
  assert.equal(b.cameras.length, 0);
  assert.equal(a.nav.getState().camera.panX, 20);
  assert.equal(b.nav.getState().camera.panX, 0);
  a.nav.destroy();
  b.nav.destroy();
});
test('invalid pointer coordinates abort active drag, release capture, and stay inert', () => {
  const canvas = fakeCanvas();
  const errors = [];
  const nav = createMouseNavigationController(canvas, {
    viewport: { width: 800, height: 600 },
    camera: { zoom: 1, panX: 0, panY: 0 },
    onCameraChange: () => {},
    onError: (event) => errors.push(event)
  });
  canvas.pointer('pointerdown', 100, 100);
  canvas.pointer('pointermove', 120, 120);
  assert.equal(nav.getState().dragging, true);
  canvas.pointer('pointermove', Number.NaN, 120);
  assert.equal(nav.getState().activePointerId, null);
  assert.equal(nav.getState().dragging, false);
  assert.equal(nav.getState().captureOwned, false);
  assert.equal(canvas.captured, null);
  assert.equal(errors.length, 1);
  assert.equal(nav.getState().camera.panX, 20);
  assert.equal(nav.getState().suppressNextClick, true);
  canvas.click(120, 120);
  assert.equal(canvas.stopped, 1);
  // Stale move/up cannot resume the failed drag.
  canvas.pointer('pointermove', 140, 140);
  canvas.pointer('pointerup', 140, 140);
  assert.equal(nav.getState().activePointerId, null);
  // Next genuine gesture works.
  nav.update({ camera: { zoom: 1, panX: 0, panY: 0 }, viewport: { width: 800, height: 600 } });
  canvas.pointer('pointerdown', 50, 50);
  canvas.pointer('pointermove', 70, 70);
  assert.equal(nav.getState().activePointerId, 1);
  assert.equal(nav.getState().camera.panX, 20);
  nav.destroy();
});

test('invalid pointerup coordinates abort capture and invalid wheel coordinates fail safely', () => {
  const canvas = fakeCanvas();
  const errors = [];
  const cameras = [];
  const nav = createMouseNavigationController(canvas, {
    viewport: { width: 800, height: 600 },
    camera: { zoom: 1, panX: 0, panY: 0 },
    onCameraChange: (camera) => cameras.push(camera),
    onError: (event) => errors.push(event)
  });
  canvas.pointer('pointerdown', 100, 100);
  canvas.pointer('pointerup', Number.NaN, 100);
  assert.equal(nav.getState().activePointerId, null);
  assert.equal(nav.getState().captureOwned, false);
  assert.equal(errors.length, 1);
  const zoomBefore = nav.getState().camera.zoom;
  canvas.wheel(10, 0, { clientX: Number.NaN });
  assert.equal(nav.getState().camera.zoom, zoomBefore);
  assert.equal(errors.length, 2);
  assert.equal(canvasesSafe(canvas), true);
  nav.destroy();
});

function canvasesSafe(canvas) {
  return canvas.prevented === 0;
}
test('invalid pointerdown does not start capture and allows a later genuine down', () => {
  const canvas = fakeCanvas();
  const errors = [];
  const nav = createMouseNavigationController(canvas, {
    viewport: { width: 800, height: 600 },
    camera: { zoom: 1, panX: 0, panY: 0 },
    onCameraChange: () => {},
    onError: (event) => errors.push(event)
  });
  canvas.pointer('pointerdown', Number.NaN, 100);
  assert.equal(nav.getState().activePointerId, null);
  assert.equal(nav.getState().captureOwned, false);
  assert.equal(errors.length, 1);
  canvas.pointer('pointerdown', 100, 100);
  assert.equal(nav.getState().activePointerId, 1);
  assert.equal(nav.getState().captureOwned, true);
  nav.destroy();
});

