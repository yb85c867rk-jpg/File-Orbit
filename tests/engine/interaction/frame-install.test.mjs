import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GraphRenderError,
  createSelectionController,
  installSelectionFrame
} from '../../../src/engine/hypertree/interaction/index.js';

function fakeCanvas() {
  const listeners = new Map();
  return {
    ownerDocument: null,
    clientLeft: 0,
    clientTop: 0,
    getBoundingClientRect() { return { left: 10, top: 20, width: 200, height: 100 }; },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      const index = list.indexOf(fn);
      if (index >= 0) list.splice(index, 1);
    },
    click(x, y) {
      for (const fn of [...(listeners.get('click') || [])]) fn({ button: 0, clientX: 10 + x, clientY: 20 + y });
    }
  };
}

function scene(id = 'a') {
  return {
    rootId: id,
    phase: 'current',
    projection: { width: 200, height: 100, radius: 50 },
    nodes: new Map([[id, {
      id,
      kind: 'folder',
      shape: 'circle',
      visible: true,
      center: { x: 50, y: 40 },
      radius: 10
    }]])
  };
}

test('drawing failure leaves selection interaction invalidated and inert', () => {
  const canvas = fakeCanvas();
  const controller = createSelectionController(canvas);
  const drawCalls = [];
  const installed = installSelectionFrame(controller, {
    scene: scene(),
    generation: 1,
    draw() { drawCalls.push('drawn'); }
  });
  assert.equal(installed.state.generation, 1);
  canvas.click(50, 40);
  assert.equal(controller.getState().selectedId, 'a');

  assert.throws(
    () => installSelectionFrame(controller, {
      scene: scene('b'),
      generation: 2,
      draw() {
        assert.equal(controller.getState().nodeCount, 0);
        throw new GraphRenderError('draw-failed', 'simulated draw failure');
      }
    }),
    (error) => error.code === 'draw-failed'
  );
  assert.equal(drawCalls.length, 1);
  assert.equal(controller.getState().nodeCount, 0);
  assert.equal(controller.getState().selectedId, null);
  canvas.click(50, 40);
  assert.equal(controller.getState().selectedId, null);
  controller.destroy();
});

test('hit-snapshot update failure after drawing also leaves interaction invalidated', () => {
  const canvas = fakeCanvas();
  const controller = createSelectionController(canvas);
  installSelectionFrame(controller, { scene: scene(), generation: 1, draw() {} });
  let drew = false;
  assert.throws(
    () => installSelectionFrame(controller, {
      scene: scene('b'),
      generation: 1,
      draw() { drew = true; }
    }),
    (error) => error.code === 'invalid-frame'
  );
  assert.equal(drew, true);
  assert.equal(controller.getState().nodeCount, 0);
  canvas.click(50, 40);
  assert.equal(controller.getState().selectedId, null);
  controller.destroy();
});

test('successful frame installation draws before installing the hit snapshot', () => {
  const canvas = fakeCanvas();
  const controller = createSelectionController(canvas);
  const drawStates = [];
  const result = installSelectionFrame(controller, {
    scene: scene('a'),
    generation: 4,
    draw() {
      drawStates.push(controller.getState().nodeCount);
    }
  });
  assert.deepEqual(drawStates, [0]);
  assert.equal(result.state.nodeCount, 1);
  assert.equal(result.state.generation, 4);
  assert.equal(result.state.phase, 'current');
  assert.deepEqual(result.state.viewport, { width: 200, height: 100 });
  canvas.click(50, 40);
  assert.equal(controller.getState().selectedId, 'a');
  controller.destroy();
});
test('successful replacement can restore an explicit selection without click evidence', () => {
  const canvas = fakeCanvas();
  const events = [];
  const controller = createSelectionController(canvas, { onChange: (event) => events.push(event) });
  installSelectionFrame(controller, { scene: scene('a'), generation: 1, draw() {} });
  controller.restoreSelection('a');
  const before = events.length;
  const result = installSelectionFrame(controller, {
    scene: scene('a'),
    generation: 2,
    selectedId: 'a',
    draw() {}
  });
  assert.equal(result.state.selectedId, 'a');
  assert.equal(controller.getState().selectedId, 'a');
  assert.ok(events.length > before);
  assert.equal(events.at(-1).reason, 'restore');
  assert.equal(events.at(-1).selectedId, 'a');
  controller.destroy();
});


