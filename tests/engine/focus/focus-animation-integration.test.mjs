import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { computeRadialLayout } from '../../../src/engine/hypertree/layout/index.js';
import { createFocusAnimator } from '../../../src/engine/hypertree/focus/index.js';
import { createProjection, prepareGraphScene } from '../../../src/engine/hypertree/render/index.js';
import {
  createSelectionController,
  installSelectionFrame,
  createHitSnapshot,
  hitTestNode
} from '../../../src/engine/hypertree/interaction/index.js';
import { f20 } from '../layout/fixtures.mjs';

function scheduler() {
  let now = 0;
  let nextId = 0;
  const callbacks = new Map();
  return {
    now: () => now,
    advance(ms) { now += ms; },
    requestFrame(cb) { const id = ++nextId; callbacks.set(id, cb); return id; },
    cancelFrame(id) { callbacks.delete(id); },
    fire() {
      const entries = [...callbacks.entries()];
      callbacks.clear();
      for (const [, cb] of entries) cb(now);
    },
    pending() { return callbacks.size; }
  };
}

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
  const baseScene = prepareGraphScene(base, {
    phase: 'current',
    projection,
    nodeDims,
    nodeKinds
  });
  return { base, nodeDims, nodeKinds, projection, baseScene };
}

function frameScene(s, view) {
  return prepareGraphScene(view.staged, {
    phase: 'current',
    projection: s.projection,
    nodeDims: s.nodeDims,
    nodeKinds: s.nodeKinds
  });
}

test('final animation frame is drawn before final hit installation; intermediate clicks are inert', () => {
  const s = setup();
  const canvas = fakeCanvas();
  const events = [];
  const controller = createSelectionController(canvas, { onChange: (event) => events.push(event) });
  installSelectionFrame(controller, {
    scene: s.baseScene,
    generation: 1,
    selectedId: 'n1',
    draw() {}
  });
  assert.equal(controller.getState().selectedId, 'n1');

  const clock = scheduler();
  let finalScene = null;
  let finalDrawn = false;
  let installed = false;
  const frameProgress = [];
  const animator = createFocusAnimator({
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    duration: 300,
    onFrame(frame) {
      const scene = frameScene(s, frame.view);
      frameProgress.push(frame.progress);
      if (frame.progress === 1) {
        finalScene = scene;
        finalDrawn = true;
      }
    },
    onComplete() {
      assert.equal(finalDrawn, true);
      assert.equal(controller.getState().nodeCount, 0);
      controller.update({ scene: finalScene, generation: 2 });
      controller.restoreSelection('n1');
      installed = true;
    }
  });

  controller.invalidate();
  const result = animator.start({ base: s.base, focusId: 'n13', duration: 300 });
  assert.equal(result.status, 'started');
  assert.equal(controller.getState().nodeCount, 0);
  const target = s.baseScene.nodes.get('n13');
  canvas.click(target.center.x, target.center.y);
  assert.equal(controller.getState().selectedId, null);

  clock.advance(150);
  clock.fire();
  assert.equal(controller.getState().nodeCount, 0);
  assert.equal(finalDrawn, false);
  clock.advance(200);
  clock.fire();
  assert.equal(finalDrawn, true);
  assert.equal(installed, true);
  assert.equal(controller.getState().nodeCount, 20);
  assert.equal(controller.getState().selectedId, 'n1');
  assert.equal(animator.getState().state, 'completed');
  assert.equal(events.some((event) => event.reason === 'click'), false);

  const focusScene = frameScene(s, animator.getState().lastFrame.view);
  const focusTarget = focusScene.nodes.get('n13');
  const snapshot = createHitSnapshot(focusScene);
  assert.equal(hitTestNode(snapshot, { x: focusTarget.center.x, y: focusTarget.center.y }), null);
  assert.ok(frameProgress.at(-1) === 1);
  controller.destroy();
  animator.destroy();
});

test('cancellation before completion leaves no hit snapshot and no completion', () => {
  const s = setup();
  const canvas = fakeCanvas();
  const controller = createSelectionController(canvas);
  installSelectionFrame(controller, { scene: s.baseScene, generation: 1, selectedId: 'n6', draw() {} });
  const clock = scheduler();
  let completed = false;
  const animator = createFocusAnimator({
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    duration: 300,
    onFrame() {},
    onComplete() { completed = true; }
  });
  controller.invalidate();
  animator.start({ base: s.base, focusId: 'n13', duration: 300 });
  animator.cancel('resize');
  assert.equal(completed, false);
  assert.equal(controller.getState().nodeCount, 0);
  const target = s.baseScene.nodes.get('n13');
  canvas.click(target.center.x, target.center.y);
  assert.equal(controller.getState().selectedId, null);
  assert.equal(clock.pending(), 0);
  controller.destroy();
  animator.destroy();
});

test('drawing failure leaves interaction inert and no final installation', () => {
  const s = setup();
  const canvas = fakeCanvas();
  const controller = createSelectionController(canvas);
  installSelectionFrame(controller, { scene: s.baseScene, generation: 1, selectedId: 'n6', draw() {} });
  const clock = scheduler();
  let installed = false;
  const animator = createFocusAnimator({
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    duration: 300,
    onFrame() { throw new Error('draw failed'); },
    onComplete() { installed = true; },
    onError() {
      controller.invalidate();
    }
  });
  controller.invalidate();
  animator.start({ base: s.base, focusId: 'n13', duration: 300 });
  assert.equal(animator.getState().state, 'failed');
  assert.equal(installed, false);
  assert.equal(controller.getState().nodeCount, 0);
  const target = s.baseScene.nodes.get('n13');
  canvas.click(target.center.x, target.center.y);
  assert.equal(controller.getState().selectedId, null);
  controller.destroy();
  animator.destroy();
});


