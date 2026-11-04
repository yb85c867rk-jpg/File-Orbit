import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { folderRadiusForDepth } from '../../../src/engine/hypertree/exploration/presentation.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import {
  createExplorationModel,
  createExplorationTransition,
  deriveSubtreeView,
  prepareExplorationFrame,
  isTransitionBusy, shouldAnimateTransition,
  transitionOpacity
} from '../../../src/engine/hypertree/exploration/index.js';
import { EXPERIMENTAL_CAMERA_LIMITS } from '../../../src/engine/hypertree/navigation/index.js';
import { f20 } from '../layout/fixtures.mjs';

const viewport = { width: 1100, height: 473 };
const baseRadiusCss = 198.66;
function setup() {
  const tree = f20();
  const { graph } = loadTree(tree);
  const staged = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, { viewport, padding: 24, projectionBaseRadiusCss: baseRadiusCss, phase: 'current' }).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: tree.id, phase: 'current' });
  const sourceView = model.view();
  const source = prepareExplorationFrame({ graph, baseLayout, view: sourceView, viewport, baseRadiusCss, fit: true, camera: null, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS });
  const targetView = deriveSubtreeView({ graph, baseLayout, focusedFolderId: 'n1', structuralRootId: tree.id, phase: 'current' });
  const target = prepareExplorationFrame({ graph, baseLayout, view: targetView, viewport, baseRadiusCss, fit: true, camera: null, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS });
  return { graph, baseLayout, model, sourceView, targetView, sourceCamera: source.camera, targetCamera: target.camera, target };
}
function scheduler() {
  let now = 0;
  let pending = null;
  let nextId = 1;
  const frames = [];
  return {
    now: () => now,
    requestFrame: (cb) => { const id = nextId++; pending = { id, cb }; return id; },
    cancelFrame: () => { pending = null; },
    advance: (ms) => { now = ms; const p = pending; pending = null; if (p) p.cb(); },
    get hasPending() { return pending !== null; },
    frames
  };
}

test('mocked irregular timestamps produce eased progress and exact endpoint', () => {
  const ctx = setup();
  const clock = scheduler();
  const drawings = [];
  const labels = [];
  const frames = [];
  const transition = createExplorationTransition({
    graph: ctx.graph, baseLayout: ctx.baseLayout,
    sourceView: ctx.sourceView, targetView: ctx.targetView,
    sourceCamera: ctx.sourceCamera, targetCamera: ctx.targetCamera,
    viewport, baseRadiusCss, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS,
    duration: 780, now: clock.now, requestFrame: clock.requestFrame, cancelFrame: clock.cancelFrame,
    draw: (scene) => drawings.push(scene),
    labels: (scene) => labels.push(scene),
    onFrame: (sample) => frames.push(sample.progress),
    onComplete: () => {
      ctx.model.enterFolder('n1');
      return { ok: true };
    }
  });
  assert.equal(transition.active, true);
  assert.equal(frames[0], 0);
  clock.advance(100);
  clock.advance(250);
  assert.ok(frames.includes(100 / 780));
  assert.ok(frames.includes(250 / 780));
  for (const scene of drawings) {
    for (const node of scene.nodes.values()) {
      assert.ok(Number.isFinite(node.center.x) && Number.isFinite(node.center.y));
      if (node.kind === 'folder') assert.equal(node.radius, folderRadiusForDepth(ctx.baseLayout.depths.get(node.id)));
    }
  }
  clock.advance(780);
  assert.equal(transition.active, false);
  assert.equal(ctx.model.focusedFolderId, 'n1');
  assert.equal(frames.at(-1), 1);
  assert.ok(labels.length > 0);
});

test('midpoint visibility is a union and final camera equals immediate target', () => {
  const ctx = setup();
  const clock = scheduler();
  let midpoint = null;
  let finalCamera = null;
  const transition = createExplorationTransition({
    graph: ctx.graph, baseLayout: ctx.baseLayout,
    sourceView: ctx.sourceView, targetView: ctx.targetView,
    sourceCamera: ctx.sourceCamera, targetCamera: ctx.targetCamera,
    viewport, baseRadiusCss, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS,
    duration: 780, now: clock.now, requestFrame: clock.requestFrame, cancelFrame: clock.cancelFrame,
    draw: () => {}, labels: () => {},
    onFrame: (sample) => { if (sample.progress === 0.5) midpoint = sample; },
    onComplete: () => { finalCamera = ctx.targetCamera; return { ok: true }; }
  });
  clock.advance(390);
  assert.ok(midpoint);
  assert.ok(midpoint.view.parameter);
  const midScene = midpoint.prepared.scene;
  assert.ok(midScene.nodes.size >= ctx.sourceView.visibleIds.length);
  assert.ok(midScene.nodes.size >= ctx.targetView.visibleIds.length);
  clock.advance(780);
  assert.deepEqual(finalCamera, ctx.targetCamera);
  assert.equal(transition.active, false);
});

test('cancel and stale callback do not draw, and frame failure is bounded', () => {
  const ctx = setup();
  const clock = scheduler();
  let draws = 0;
  const transition = createExplorationTransition({
    graph: ctx.graph, baseLayout: ctx.baseLayout,
    sourceView: ctx.sourceView, targetView: ctx.targetView,
    sourceCamera: ctx.sourceCamera, targetCamera: ctx.targetCamera,
    viewport, baseRadiusCss, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS,
    duration: 780, now: clock.now, requestFrame: clock.requestFrame, cancelFrame: clock.cancelFrame,
    draw: () => { draws += 1; }, labels: () => {}, onComplete: () => ({ ok: true })
  });
  assert.equal(draws, 1);
  transition.cancel('resize');
  clock.advance(100);
  assert.equal(draws, 1);
  assert.equal(transition.active, false);

  const ctx2 = setup();
  const clock2 = scheduler();
  let error = null;
  assert.throws(() => createExplorationTransition({
    graph: ctx2.graph, baseLayout: ctx2.baseLayout,
    sourceView: ctx2.sourceView, targetView: ctx2.targetView,
    sourceCamera: ctx2.sourceCamera, targetCamera: ctx2.targetCamera,
    viewport, baseRadiusCss, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS,
    duration: 780, now: clock2.now, requestFrame: clock2.requestFrame, cancelFrame: clock2.cancelFrame,
    draw: () => { throw new Error('draw-failed'); }, labels: () => {},
    onError: (payload) => { error = payload.error; }, onComplete: () => ({ ok: true })
  }), /draw-failed/);
  assert.match(error.message, /draw-failed/);
});

test('reduced motion and duration zero choose the immediate path', () => {
  assert.equal(shouldAnimateTransition({ reducedMotion: true, duration: 780 }), false);
  assert.equal(shouldAnimateTransition({ reducedMotion: false, duration: 0 }), false);
  assert.equal(shouldAnimateTransition({ reducedMotion: false, duration: 780 }), true);
});
test('busy transition is detectable without starting a second animation', () => {
  assert.equal(isTransitionBusy(null), false);
  assert.equal(isTransitionBusy({ active: false }), false);
  assert.equal(isTransitionBusy({ active: true }), true);
});
test('opacity partition is retained=1, exiting=1-eased, entering=eased', () => {
  const ctx = setup();
  const fullToFolder = transitionOpacity(ctx.sourceView, ctx.targetView, 0.5);
  assert.equal(fullToFolder.get('n3'), 1);
  assert.equal(fullToFolder.get('n5'), 0.5);
  assert.equal(transitionOpacity(ctx.sourceView, ctx.targetView, 0).get('n5'), 1);
  assert.equal(transitionOpacity(ctx.sourceView, ctx.targetView, 1).get('n5'), 0);
  const folderToRoot = transitionOpacity(ctx.targetView, ctx.sourceView, 0.5);
  assert.equal(folderToRoot.get('n5'), 0.5);
  assert.equal(folderToRoot.get('n3'), 1);
});




