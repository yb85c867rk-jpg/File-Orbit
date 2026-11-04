import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { computeRadialLayout } from '../../../src/engine/hypertree/layout/index.js';
import { createProjection, prepareGraphScene } from '../../../src/engine/hypertree/render/index.js';
import {
  createSelectionController,
  installSelectionFrame,
  redrawSelectionFrame
} from '../../../src/engine/hypertree/interaction/index.js';
import { f20 } from '../layout/fixtures.mjs';

function fakeCanvas() {
  const listeners = new Map();
  return {
    ownerDocument: null,
    clientLeft: 0,
    clientTop: 0,
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; },
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
      for (const fn of [...(listeners.get('click') || [])]) fn({ button: 0, clientX: x, clientY: y });
    }
  };
}

function setup() {
  const { graph } = loadTree(f20());
  const base = computeRadialLayout(graph, {
    rootId: 'n0',
    phases: ['current', 'start', 'end'],
    nodeOptions: { overridable: true },
    radius: 100,
    offset: 0.1
  });
  const nodeDims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const nodeKinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  const projection = createProjection({ width: 800, height: 600, radius: 100 });
  const scene = prepareGraphScene(base, { phase: 'current', projection, nodeDims, nodeKinds });
  return { scene };
}

test('selection redraw failure invalidates interaction, clears selection, and does not recurse', () => {
  const s = setup();
  const canvas = fakeCanvas();
  let cleanup = false;
  let callbackCount = 0;
  let reentrantCount = 0;
  const controller = createSelectionController(canvas, {
    onChange() {
      callbackCount += 1;
      if (cleanup) reentrantCount += 1;
    }
  });
  installSelectionFrame(controller, { scene: s.scene, generation: 1, selectedId: 'n1', draw() {} });
  assert.equal(controller.getState().selectedId, 'n1');
  assert.equal(controller.getState().nodeCount, 20);
  const original = new Error('label/draw failed');
  const result = redrawSelectionFrame({
    controller,
    draw() { throw original; },
    onCleanupStart() { cleanup = true; },
    onCleanupEnd() { cleanup = false; }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, original);
  assert.equal(controller.getState().nodeCount, 0);
  assert.equal(controller.getState().selectedId, null);
  assert.equal(callbackCount, 2);
  assert.equal(reentrantCount, 1);
  assert.equal(cleanup, false);

  const target = s.scene.nodes.get('n13');
  canvas.click(target.center.x, target.center.y);
  assert.equal(controller.getState().selectedId, null);

  // A later successful frame installation restores interaction and selection.
  installSelectionFrame(controller, { scene: s.scene, generation: 2, selectedId: 'n1', draw() {} });
  assert.equal(controller.getState().nodeCount, 20);
  assert.equal(controller.getState().selectedId, 'n1');
  canvas.click(s.scene.nodes.get('n1').center.x, s.scene.nodes.get('n1').center.y);
  assert.equal(controller.getState().selectedId, 'n1');
  controller.destroy();
});

test('async selection redraw is rejected and invalidates interaction', () => {
  const s = setup();
  const controller = createSelectionController(fakeCanvas());
  installSelectionFrame(controller, { scene: s.scene, generation: 1, selectedId: 'n1', draw() {} });
  const result = redrawSelectionFrame({
    controller,
    draw() { return Promise.resolve(); }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'async-frame-unsupported');
  assert.equal(controller.getState().nodeCount, 0);
  assert.equal(controller.getState().selectedId, null);
  controller.destroy();
});


