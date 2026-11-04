import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { computeRadialLayout } from '../../../src/engine/hypertree/layout/index.js';
import { createFocusView } from '../../../src/engine/hypertree/focus/index.js';
import { createProjection, prepareGraphScene } from '../../../src/engine/hypertree/render/index.js';
import {
  createSelectionController,
  installSelectionFrame,
  GraphRenderError
} from '../../../src/engine/hypertree/interaction/index.js';
import { focusCoordinateEvidence } from '../../harness/m5-focus/evidence.mjs';
import { f20 } from '../layout/fixtures.mjs';

function setup() {
  const { graph } = loadTree(f20());
  const base = computeRadialLayout(graph, {
    rootId: 'n0',
    phases: ['current', 'start', 'end'],
    nodeOptions: { overridable: true },
    radius: 100,
    offset: 0.1
  });
  return { graph, base };
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
    }
  };
}

function sceneFor(s, focusId) {
  const view = createFocusView(s.base, { focusId, phase: 'current' });
  const graph = s.graph;
  const nodeDims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const nodeKinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  const projection = createProjection({ width: 800, height: 600, radius: 100 });
  return {
    view,
    scene: prepareGraphScene(view.staged, {
      phase: 'current',
      projection,
      nodeDims,
      nodeKinds
    })
  };
}

test('coordinate evidence distinguishes candidate from displayed focus', () => {
  const s = setup();
  const { view } = sceneFor(s, 'n13');
  const candidateOnly = focusCoordinateEvidence(view, null);
  assert.ok(candidateOnly.candidate);
  assert.equal(candidateOnly.displayed, null);
  assert.ok(Math.hypot(candidateOnly.candidate.focusedPosition.x, candidateOnly.candidate.focusedPosition.y) <= 1e-12);
  assert.notDeepEqual(candidateOnly.candidate.focusedPosition, candidateOnly.candidate.baseFocusPosition);

  const displayed = focusCoordinateEvidence(view, view);
  assert.deepEqual(displayed.displayed, displayed.candidate);
  const reset = createFocusView(s.base, { focusId: null, phase: 'current' });
  const resetEvidence = focusCoordinateEvidence(reset, reset);
  assert.equal(resetEvidence.candidate, null);
  assert.equal(resetEvidence.displayed, null);
});

test('failure after focus transformation but before installation reports no displayed focus', () => {
  const s = setup();
  const { view, scene } = sceneFor(s, 'n13');
  const controller = createSelectionController(fakeCanvas());
  assert.throws(
    () => installSelectionFrame(controller, {
      scene,
      generation: 1,
      draw() { throw new GraphRenderError('draw-failed', 'candidate not displayed'); }
    }),
    (error) => error.code === 'draw-failed'
  );
  assert.equal(controller.getState().nodeCount, 0);
  const evidence = focusCoordinateEvidence(view, null);
  assert.ok(evidence.candidate);
  assert.equal(evidence.displayed, null);
  controller.destroy();
});
