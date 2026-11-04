import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { computeRadialLayout } from '../../../src/engine/hypertree/layout/index.js';
import { createFocusView } from '../../../src/engine/hypertree/focus/index.js';
import { createProjection, prepareGraphScene } from '../../../src/engine/hypertree/render/index.js';
import {
  createSelectionController,
  hitTestNode,
  createHitSnapshot,
  installSelectionFrame
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
  return { graph, base, nodeDims, nodeKinds, projection };
}

function sceneFor(setup, focusId) {
  const view = createFocusView(setup.base, { focusId, phase: 'current' });
  const scene = prepareGraphScene(view.staged, {
    phase: 'current',
    projection: setup.projection,
    nodeDims: setup.nodeDims,
    nodeKinds: setup.nodeKinds
  });
  return { view, scene };
}

test('focus frame installation restores selection and hit geometry is transformed', () => {
  const s = setup();
  const focused = sceneFor(s, 'n13');
  const canvas = fakeCanvas();
  const events = [];
  const controller = createSelectionController(canvas, { onChange: (event) => events.push(event) });
  const beforeHit = createHitSnapshot(focused.scene);
  const target = focused.scene.nodes.get('n13');
  assert.equal(hitTestNode(beforeHit, { x: target.center.x, y: target.center.y }), null);

  installSelectionFrame(controller, {
    scene: focused.scene,
    draw() {}
  });
  // Focus must not re-root or change topology/order/depth.
  assert.equal(focused.view.staged.rootId, s.base.rootId);
  assert.deepEqual([...focused.view.staged.nodes.keys()], [...s.base.nodes.keys()]);
  for (const id of s.base.nodes.keys()) {
    assert.equal(focused.view.staged.nodes.get(id).depth, s.base.nodes.get(id).depth);
  }
  controller.destroy();
});

test('selection restoration across focus remains explicit and no click listener is added', () => {
  const s = setup();
  const canvas = fakeCanvas();
  const controller = createSelectionController(canvas);
  const baseScene = sceneFor(s, null).scene;
  installSelectionFrame(controller, { scene: baseScene, generation: 1, draw() {} });
  controller.restoreSelection('n6');
  assert.equal(controller.getState().selectedId, 'n6');

  const focused = sceneFor(s, 'n13');
  installSelectionFrame(controller, {
    scene: focused.scene,
    generation: 2,
    selectedId: 'n6',
    draw() {}
  });
  assert.equal(controller.getState().selectedId, 'n6');
  controller.destroy();
});


