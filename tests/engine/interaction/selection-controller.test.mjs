import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSelectionController,
  GraphRenderError
} from '../../../src/engine/hypertree/interaction/index.js';
import { clientToCanvasCss } from '../../../src/engine/hypertree/interaction/pointer.js';

function fakeCanvas({ left = 10, top = 20, width = 200, height = 100, border = 0, padding = 0 } = {}) {
  const listeners = new Map();
  const added = [];
  const removed = [];
  const canvas = {
    ownerDocument: padding
      ? { defaultView: { getComputedStyle: () => ({
        paddingLeft: `${padding}px`,
        paddingTop: `${padding}px`
      }) } }
      : null,
    clientLeft: border,
    clientTop: border,
    getBoundingClientRect() { return { left, top, width, height }; },
    addEventListener(type, fn) {
      added.push([type, fn]);
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      removed.push([type, fn]);
      const list = listeners.get(type) || [];
      const index = list.indexOf(fn);
      if (index >= 0) list.splice(index, 1);
    },
    click(clientX, clientY, button = 0) {
      for (const fn of [...(listeners.get('click') || [])]) {
        fn({ button, clientX, clientY });
      }
    },
    listenerCount(type = 'click') { return (listeners.get(type) || []).length; },
    added,
    removed
  };
  return canvas;
}

function node(id, x, y, options = {}) {
  return {
    id,
    kind: options.kind || 'folder',
    shape: options.shape || 'circle',
    visible: options.visible !== false,
    depth: options.depth || 0,
    center: { x, y },
    radius: options.radius ?? 10
  };
}

function scene(nodes, metadata = {}) {
  return {
    rootId: nodes[0]?.id,
    phase: metadata.phase || 'current',
    projection: metadata.projection || { width: 200, height: 100 },
    nodes: new Map(nodes.map((n) => [n.id, n]))
  };
}

function callbacks() {
  const events = [];
  return { events, onChange: (event) => events.push(event) };
}

test('primary click selects, empty click clears, same selection is deterministic', () => {
  const canvas = fakeCanvas();
  const { events, onChange } = callbacks();
  const controller = createSelectionController(canvas, { onChange });
  controller.update({
    scene: scene([node('a', 40, 40), node('b', 120, 40)]),
    generation: 1,
    phase: 'current',
    viewport: { width: 200, height: 100 }
  });
  canvas.click(10 + 40, 20 + 40);
  assert.equal(controller.getState().selectedId, 'a');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { selectedId: 'a', previousId: null, nodeId: 'a', reason: 'click' });

  canvas.click(10 + 40, 20 + 40);
  assert.equal(events.length, 1);
  assert.equal(controller.getState().selectedId, 'a');

  canvas.click(10 + 5, 20 + 5);
  assert.equal(controller.getState().selectedId, null);
  assert.equal(events.length, 2);
  assert.equal(events[1].reason, 'empty');
  controller.destroy();
});

test('unsupported buttons and invalid event coordinates are ignored', () => {
  const canvas = fakeCanvas();
  const controller = createSelectionController(canvas);
  controller.update({ scene: scene([node('a', 40, 40)]), viewport: { width: 200, height: 100 } });
  canvas.click(50, 60, 2);
  canvas.click(50, 60, -1);
  assert.equal(controller.getState().selectedId, null);
  canvas.click(Number.NaN, 60, 0);
  assert.equal(controller.getState().selectedId, null);
  canvas.click(50, 60, 0);
  assert.equal(controller.getState().selectedId, 'a');
  controller.destroy();
});

test('DPR is never applied; nonzero origin and page scrolling are handled', () => {
  const canvas = fakeCanvas({ left: 120, top: 240, border: 2, padding: 4 });
  const point = clientToCanvasCss(canvas, 150, 270);
  assert.equal(point.x, 150 - 120 - 2 - 4);
  assert.equal(point.y, 270 - 240 - 2 - 4);
  const controller = createSelectionController(canvas);
  controller.update({ scene: scene([node('a', 24, 24)]), viewport: { width: 200, height: 100 } });
  canvas.click(120 + 2 + 4 + 24, 240 + 2 + 4 + 24);
  assert.equal(controller.getState().selectedId, 'a');
  controller.destroy();
});

test('diamond geometry is exact in hit testing', () => {
  const canvas = fakeCanvas();
  const controller = createSelectionController(canvas);
  controller.update({
    scene: scene([node('d', 80, 50, { shape: 'diamond', radius: 10 })]),
    viewport: { width: 200, height: 100 }
  });
  canvas.click(10 + 85, 20 + 55);
  assert.equal(controller.getState().selectedId, 'd');
  controller.clear();
  canvas.click(10 + 86, 20 + 55);
  assert.equal(controller.getState().selectedId, null);
  controller.destroy();
});

test('clear is notification-aware and update can clear a disappeared selection', () => {
  const canvas = fakeCanvas();
  const { events, onChange } = callbacks();
  const controller = createSelectionController(canvas, { onChange });
  controller.update({ scene: scene([node('a', 40, 40)]), generation: 1, viewport: { width: 200, height: 100 } });
  canvas.click(50, 60);
  controller.clear();
  assert.equal(controller.getState().selectedId, null);
  assert.equal(events.at(-1).reason, 'clear');

  controller.update({ scene: scene([node('a', 40, 40)]), generation: 2, viewport: { width: 200, height: 100 } });
  canvas.click(50, 60);
  assert.equal(controller.getState().selectedId, 'a');
  controller.update({ scene: scene([node('b', 120, 40)]), generation: 3, viewport: { width: 200, height: 100 } });
  assert.equal(controller.getState().selectedId, null);
  assert.equal(events.at(-1).reason, 'update');
  assert.equal(controller.getState().generation, 3);

  controller.update({ scene: scene([node('b', 120, 40)]), generation: 4, viewport: { width: 200, height: 100 } });
  canvas.click(130, 60);
  assert.equal(controller.getState().selectedId, 'b');
  controller.update({ scene: scene([node('b', 120, 40, { visible: false })]), generation: 5, viewport: { width: 200, height: 100 } });
  assert.equal(controller.getState().selectedId, null);
  controller.destroy();
});

test('invalid replacement preserves prior snapshot, selection, and generation', () => {
  const canvas = fakeCanvas();
  const { events, onChange } = callbacks();
  const controller = createSelectionController(canvas, { onChange });
  const valid = scene([node('a', 40, 40)]);
  controller.update({ scene: valid, generation: 5, viewport: { width: 200, height: 100 } });
  canvas.click(50, 60);
  const beforeState = controller.getState();
  const beforeEvents = events.length;

  const bad = scene([node('a', 40, 40)]);
  bad.nodes.get('a').center.x = Number.NaN;
  assert.throws(
    () => controller.update({ scene: bad, generation: 6, viewport: { width: 200, height: 100 } }),
    (error) => error.code === 'invalid-hit-scene'
  );
  assert.deepEqual(controller.getState(), beforeState);
  assert.equal(events.length, beforeEvents);
  canvas.click(50, 60);
  assert.equal(controller.getState().selectedId, 'a');
  controller.destroy();
});

test('invalidate makes stale clicks inert until a new snapshot is installed', () => {
  const canvas = fakeCanvas();
  const controller = createSelectionController(canvas);
  controller.update({ scene: scene([node('a', 40, 40)]), generation: 1, viewport: { width: 200, height: 100 } });
  canvas.click(50, 60);
  controller.invalidate();
  assert.equal(controller.getState().selectedId, null);
  assert.equal(controller.getState().nodeCount, 0);
  canvas.click(50, 60);
  assert.equal(controller.getState().selectedId, null);
  controller.update({ scene: scene([node('a', 40, 40)]), generation: 2, viewport: { width: 200, height: 100 } });
  canvas.click(50, 60);
  assert.equal(controller.getState().selectedId, 'a');
  controller.destroy();
});

test('zero-sized viewport clears selection and refuses hits', () => {
  const canvas = fakeCanvas();
  const controller = createSelectionController(canvas);
  controller.update({ scene: scene([node('a', 40, 40)]), generation: 1, viewport: { width: 200, height: 100 } });
  canvas.click(50, 60);
  assert.equal(controller.getState().selectedId, 'a');
  controller.update({ scene: scene([node('a', 40, 40)], { projection: { width: 0, height: 100 } }), generation: 2 });
  assert.equal(controller.getState().selectedId, null);
  canvas.click(50, 60);
  assert.equal(controller.getState().selectedId, null);
  controller.destroy();
});

test('callback errors are recorded after coherent state and do not break the controller', () => {
  const canvas = fakeCanvas();
  let calls = 0;
  const controller = createSelectionController(canvas, {
    onChange() {
      calls += 1;
      throw new Error('callback failed');
    }
  });
  controller.update({ scene: scene([node('a', 40, 40)]), viewport: { width: 200, height: 100 } });
  canvas.click(50, 60);
  assert.equal(calls, 1);
  assert.equal(controller.getState().selectedId, 'a');
  assert.equal(controller.getState().lastCallbackError.message, 'callback failed');
  canvas.click(50, 60);
  assert.equal(calls, 1);
  controller.clear();
  assert.equal(calls, 2);
  assert.equal(controller.getState().selectedId, null);
  controller.destroy();
});

test('destroy is idempotent, removes exactly its listener, and isolates instances', () => {
  const canvas = fakeCanvas();
  const other = fakeCanvas();
  const controller = createSelectionController(canvas);
  const second = createSelectionController(other);
  assert.equal(canvas.listenerCount(), 1);
  assert.equal(other.listenerCount(), 1);
  controller.destroy();
  controller.destroy();
  assert.equal(canvas.listenerCount(), 0);
  assert.equal(canvas.added.length, 1);
  assert.equal(canvas.removed.length, 1);
  assert.equal(canvas.added[0][0], canvas.removed[0][0]);
  assert.equal(canvas.added[0][1], canvas.removed[0][1]);
  assert.equal(other.listenerCount(), 1);
  assert.throws(() => controller.getState(), (error) => error.code === 'invalid-lifecycle');
  second.destroy();
  assert.equal(other.listenerCount(), 0);
});
test('CSS coordinate conversion is invariant across DPR values and page scroll', () => {
  const points = [];
  for (const dpr of [1, 1.25, 2, 3]) {
    const canvas = fakeCanvas({ left: -80, top: -40 });
    canvas.width = 200 * dpr;
    canvas.height = 100 * dpr;
    points.push(clientToCanvasCss(canvas, 20, 30));
  }
  assert.equal(points.every((point) => point.x === 100 && point.y === 70), true);
});
test('scene phase/projection are authoritative; duplicate args must agree', () => {
  const canvas = fakeCanvas();
  const controller = createSelectionController(canvas);
  const prepared = scene([node('a', 40, 40)], { phase: 'current', projection: { width: 200, height: 100 } });
  controller.update({ scene: prepared, generation: 5, phase: 'current', viewport: { width: 200, height: 100 } });
  assert.equal(controller.getState().phase, 'current');
  assert.deepEqual(controller.getState().viewport, { width: 200, height: 100 });

  assert.throws(
    () => controller.update({ scene: prepared, generation: 6, phase: 'end' }),
    (error) => error.code === 'invalid-frame'
  );
  assert.throws(
    () => controller.update({ scene: prepared, generation: 6, viewport: { width: 999, height: 999 } }),
    (error) => error.code === 'invalid-frame'
  );
  assert.equal(controller.getState().generation, 5);

  controller.update({ scene: prepared, generation: 6 });
  assert.equal(controller.getState().phase, 'current');
  assert.deepEqual(controller.getState().viewport, { width: 200, height: 100 });
  controller.destroy();
});

test('generation must strictly increase; stale/same replacements preserve installed frame', () => {
  const canvas = fakeCanvas();
  const controller = createSelectionController(canvas);
  const prepared = scene([node('a', 40, 40)]);
  controller.update({ scene: prepared, generation: 5 });
  const before = controller.getState();
  for (const generation of [4, 5, 0, -1, 1.5]) {
    assert.throws(
      () => controller.update({ scene: prepared, generation }),
      (error) => error.code === 'invalid-frame'
    );
    assert.deepEqual(controller.getState(), before);
  }
  controller.update({ scene: prepared });
  assert.equal(controller.getState().generation, 6);
  controller.destroy();
});

test('invalid frame metadata preserves callback history', () => {
  const canvas = fakeCanvas();
  const controller = createSelectionController(canvas, { onChange() { throw new Error('history'); } });
  const prepared = scene([node('a', 40, 40)]);
  controller.update({ scene: prepared, generation: 1 });
  canvas.click(50, 60);
  const errorBefore = controller.getState().lastCallbackError;
  assert.equal(errorBefore.message, 'history');
  assert.throws(
    () => controller.update({ scene: prepared, generation: 2, phase: 'end' }),
    (error) => error.code === 'invalid-frame'
  );
  assert.equal(controller.getState().lastCallbackError, errorBefore);
  assert.equal(controller.getState().selectedId, 'a');
  controller.destroy();
});
test('explicit selection restoration preserves state without fabricating a click', () => {
  const canvas = fakeCanvas();
  const { events, onChange } = callbacks();
  const controller = createSelectionController(canvas, { onChange });
  const prepared = scene([node('a', 40, 40), node('b', 120, 40)]);
  controller.update({ scene: prepared, generation: 1 });
  const restored = controller.restoreSelection('a');
  assert.equal(restored.selectedId, 'a');
  assert.equal(events.length, 1);
  assert.equal(events[0].reason, 'restore');
  controller.restoreSelection('b');
  assert.equal(controller.getState().selectedId, 'b');
  assert.equal(events.at(-1).reason, 'restore');
  controller.restoreSelection('missing');
  assert.equal(controller.getState().selectedId, null);
  controller.invalidate();
  assert.throws(() => controller.restoreSelection('a'), (error) => error.code === 'invalid-frame');
  controller.destroy();
});



