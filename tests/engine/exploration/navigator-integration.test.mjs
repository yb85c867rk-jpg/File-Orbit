import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import {
  createExplorationModel,
  createExplorationNavigator,
  createExplorationSession,
  deriveSubtreeView,
  explorationLabelPriorityIds,
  handleExplorationCanvasClick,
  prepareExplorationFrame,
  stageExplorationFrame
} from '../../../src/engine/hypertree/exploration/index.js';
import { EXPERIMENTAL_CAMERA_LIMITS, createCamera } from '../../../src/engine/hypertree/navigation/index.js';
import { DEFAULT_SELECTION } from '../../../src/engine/hypertree/render/index.js';
import { createHitSnapshot, hitTestNode } from '../../../src/engine/hypertree/interaction/index.js';
import { f20 } from '../layout/fixtures.mjs';

const viewport = { width: 1100, height: 473 };
const baseRadiusCss = 198.66;

function scheduler() {
  let now = 0;
  let pending = null;
  return {
    now: () => now,
    requestFrame: (cb) => { pending = cb; return 1; },
    cancelFrame: () => { pending = null; },
    advance: (ms) => { now = ms; const cb = pending; pending = null; if (cb) cb(); }
  };
}

function setup({ reducedMotion = false, failingDraw = false, labelSink = null, presentation = undefined } = {}) {
  const tree = f20();
  const { graph } = loadTree(tree);
  const staged = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, { viewport, padding: 24, projectionBaseRadiusCss: baseRadiusCss, phase: 'current' }).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: tree.id, phase: 'current' });
  const ctx = { graph, baseLayout, model, frameState: null, diagnostics: [] };
  const session = createExplorationSession({
    model,
    initialCamera: createCamera({ zoom: 1, panX: 0, panY: 0 }, EXPERIMENTAL_CAMERA_LIMITS),
    limits: EXPERIMENTAL_CAMERA_LIMITS,
    invalidate: () => { ctx.frameState = null; },
    publish: () => {},
    frame: ({ fit, entry, camera, framing }) => {
      const prepared = stageExplorationFrame({
        graph, baseLayout, view: model.view(), viewport, padding: 24, baseRadiusCss,
        fit, entry, camera, framing, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS,
        adapters: {
          draw: () => {},
          labels: () => { if (labelSink) labelSink({ kind: 'session', view: model.view(), priorityIds: explorationLabelPriorityIds({ view: model.view(), structuralRootId: model.structuralRootId, selectedId: model.selectedId }) }); },
          installHit: () => {}
        }
      });
      ctx.frameState = { scene: prepared.scene, hit: prepared.hit, camera: prepared.camera, framing: prepared.framing, filtered: prepared.filtered, containment: prepared.containment };
      return { camera: prepared.camera, framing: prepared.framing, scene: prepared.scene, hit: prepared.hit };
    }
  });
  session.run('initial', () => ({ ok: true, fit: true }), { fit: false });
  const clock = scheduler();
  const navigator = createExplorationNavigator({
    graph, baseLayout, model, session, viewport, baseRadiusCss,
    cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, duration: 780, reducedMotion, presentation,
    draw: failingDraw ? () => { throw new Error('draw-failed'); } : () => {},
    labels: (scene, meta) => {
      if (!meta || !meta.targetView) throw new Error('label-target-missing');
      if (labelSink) labelSink({ kind: 'transition', view: meta.targetView, progress: meta.progress, priorityIds: explorationLabelPriorityIds({ view: meta.targetView, structuralRootId: model.structuralRootId, selectedId: model.selectedId }) });
    },
    onStart: () => { ctx.frameState = null; },
    onFrame: ({ prepared, progress, camera }) => {
      ctx.frameState = { scene: prepared.scene, hit: null, camera, progress, filtered: prepared.filtered, containment: prepared.containment };
    },
    onError: ({ error }) => { ctx.frameState = null; ctx.error = error; },
    onSettled: () => {},
    transitionOptions: { now: clock.now, requestFrame: clock.requestFrame, cancelFrame: clock.cancelFrame }
  });
  return { ctx, session, navigator, clock, targetView: model.view() };
}

function clickFolder(ctx, session, navigator, id, extra = {}) {
  const node = ctx.frameState?.hit?.nodes.find((item) => item.id === id);
  assert.ok(node, `hit ${id}`);
  return handleExplorationCanvasClick({
    event: { button: 0, clientX: node.center.x, clientY: node.center.y, ...extra },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }), clientLeft: 0, clientTop: 0 },
    frameState: ctx.frameState,
    session,
    model: ctx.model,
    graph: ctx.graph,
    onFolder: ({ id: folderId }) => navigator.enterFolder(folderId),
    onDiagnostic: (diagnostic) => ctx.diagnostics.push(diagnostic)
  });
}

test('actual click routes through transition, not immediate session', () => {
  const { ctx, session, navigator, clock } = setup();
  const result = clickFolder(ctx, session, navigator, 'n1');
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'transition');
  assert.equal(navigator.busy, true);
  assert.equal(navigator.transition.duration, 780);
  assert.equal(ctx.model.focusedFolderId, 'n0');
  assert.equal(ctx.frameState.hit, null);
  assert.equal(ctx.frameState.progress, 0);
  assert.equal(ctx.frameState.scene.nodes.get('n5').opacity, 1);
  assert.equal(ctx.frameState.scene.nodes.get('n3').opacity, 1);
  const sourceOnlyEdge = ctx.frameState.scene.edges.find((edge) => edge.fromId === 'n2' && edge.toId === 'n5');
  assert.equal(sourceOnlyEdge.opacity, 1);
  clock.advance(390);
  assert.equal(navigator.busy, true);
  assert.equal(navigator.transition.duration, 780);
  assert.equal(ctx.frameState.progress, 0.5);
  assert.equal(ctx.frameState.hit, null);
  assert.equal(ctx.frameState.scene.nodes.get('n5').opacity, 0.5);
  assert.equal(ctx.frameState.scene.nodes.get('n3').opacity, 1);
  const midpointEdge = ctx.frameState.scene.edges.find((edge) => edge.fromId === 'n2' && edge.toId === 'n5');
  assert.equal(midpointEdge.opacity, 0.5);
  assert.equal(ctx.model.focusedFolderId, 'n0');
  const busy = navigator.enterFolder('n1');
  assert.equal(busy.ok, false);
  assert.equal(busy.reason, 'transition-busy');
  clock.advance(780);
  assert.equal(navigator.busy, false);
  assert.equal(ctx.model.focusedFolderId, 'n1');
  assert.ok(ctx.frameState.hit);
  assert.ok(ctx.frameState.scene.nodes.has('n0'));
  assert.ok(ctx.frameState.scene.nodes.has('n2') === true);
  assert.equal(ctx.frameState.scene.nodes.has('n5'), false);
  const center = { x: viewport.width / 2, y: viewport.height / 2 };
  const focused = ctx.frameState.scene.nodes.get('n1');
  assert.ok(Math.hypot(focused.center.x - center.x, focused.center.y - center.y) <= 1e-6);
  assert.equal(hitTestNode(ctx.frameState.hit, ctx.frameState.scene.nodes.get('n0').center), 'n0');
});

test('final installed frame equals immediate target camera and scope', () => {
  const { ctx, session, navigator, clock } = setup();
  const targetView = deriveSubtreeView({
    graph: ctx.graph, baseLayout: ctx.baseLayout, focusedFolderId: 'n1',
    structuralRootId: ctx.model.structuralRootId, phase: 'current'
  });
  const target = prepareExplorationFrame({
    graph: ctx.graph, baseLayout: ctx.baseLayout, view: targetView,
    viewport, baseRadiusCss, fit: true, camera: null, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS
  });
  clickFolder(ctx, session, navigator, 'n1');
  clock.advance(780);
  assert.deepEqual(ctx.frameState.camera, target.camera);
  assert.deepEqual([...ctx.frameState.scene.nodes.keys()].sort(), [...target.scene.nodes.keys()].sort());
});

test('reduced motion and current-folder click use immediate path', () => {
  const reduced = setup({ reducedMotion: true });
  const result = clickFolder(reduced.ctx, reduced.session, reduced.navigator, 'n1');
  assert.equal(result.mode, 'immediate');
  assert.equal(reduced.navigator.busy, false);
  assert.equal(reduced.ctx.model.focusedFolderId, 'n1');

  const current = setup();
  const same = clickFolder(current.ctx, current.session, current.navigator, 'n0');
  assert.equal(same.mode, 'immediate');
  assert.equal(same.changed, false);
  assert.equal(current.ctx.model.focusedFolderId, 'n0');
});

test('transition draw failure leaves target uncommitted and hit inert', () => {
  const { ctx, session, navigator } = setup({ failingDraw: true });
  const result = clickFolder(ctx, session, navigator, 'n1');
  assert.equal(result.ok, false);
  assert.equal(ctx.model.focusedFolderId, 'n0');
  assert.equal(ctx.frameState, null);
  assert.match(String(ctx.error?.message || ctx.error), /draw-failed/);
});
test('cancel releases transition ownership without committing target', () => {
  const { ctx, session, navigator } = setup();
  const result = clickFolder(ctx, session, navigator, 'n1');
  assert.equal(result.mode, 'transition');
  assert.equal(navigator.busy, true);
  assert.equal(navigator.transition.duration, 780);
  navigator.cancel('resize');
  assert.equal(navigator.busy, false);
  assert.equal(ctx.model.focusedFolderId, 'n0');
  assert.equal(ctx.frameState.hit, null);
});
test('actual transition label callback receives target view and updates initial/intermediate/final priorities', () => {
  const labels = [];
  const { ctx, session, navigator, clock } = setup({
    labelSink: (entry) => labels.push(entry)
  });
  const result = clickFolder(ctx, session, navigator, 'n1');
  assert.equal(result.mode, 'transition');
  const initial = labels.filter((entry) => entry.kind === 'transition');
  assert.ok(initial.length >= 1);
  assert.equal(initial[0].view.focusedFolderId, 'n1');
  assert.equal(initial[0].priorityIds[0], 'n1');
  assert.ok(initial[0].priorityIds.includes('n0'));
  const countAtStart = initial.length;
  clock.advance(390);
  const intermediate = labels.filter((entry) => entry.kind === 'transition');
  assert.ok(intermediate.length > countAtStart);
  assert.equal(intermediate.at(-1).view.focusedFolderId, 'n1');
  clock.advance(780);
  const finalLabels = labels.filter((entry) => entry.kind === 'session');
  assert.ok(finalLabels.length >= 1);
  assert.equal(finalLabels.at(-1).view.focusedFolderId, 'n1');
  assert.equal(finalLabels.at(-1).priorityIds[0], 'n1');
});

test('label callback failure leaves interaction inert and target uncommitted', () => {
  let fail = false;
  const { ctx, session, navigator } = setup({
    labelSink: () => { if (fail) throw new Error('label-failed'); }
  });
  fail = true;
  const result = clickFolder(ctx, session, navigator, 'n1');
  assert.equal(result.ok, false);
  assert.equal(ctx.model.focusedFolderId, 'n0');
  assert.equal(ctx.frameState, null);
  assert.match(String(ctx.error?.message || ctx.error), /label-failed/);
});
test('structural root stays white when another folder is centered; selection ring stays indigo', () => {
  const presentation = { rootFill: '#D6B36A' };
  const { ctx, session, navigator, clock } = setup({ presentation });
  const rootFrame = prepareExplorationFrame({
    graph: ctx.graph, baseLayout: ctx.baseLayout, view: ctx.model.view(),
    viewport, baseRadiusCss, fit: true, camera: null, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, presentation
  });
  assert.equal(rootFrame.scene.nodes.get('n0').fill, '#F8FAFC');
  assert.equal(DEFAULT_SELECTION.color, '#818cf8');
  const targetView = deriveSubtreeView({
    graph: ctx.graph, baseLayout: ctx.baseLayout, focusedFolderId: 'n1',
    structuralRootId: ctx.model.structuralRootId, phase: 'current'
  });
  const focusedFrame = prepareExplorationFrame({
    graph: ctx.graph, baseLayout: ctx.baseLayout, view: targetView,
    viewport, baseRadiusCss, fit: true, camera: null, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, presentation
  });
  assert.equal(focusedFrame.scene.nodes.get('n0').fill, '#F8FAFC');
  assert.equal(focusedFrame.scene.nodes.get('n1').fill, '#D1D5DB');
  clickFolder(ctx, session, navigator, 'n1');
  clock.advance(390);
  assert.equal(ctx.frameState.scene.nodes.get('n0').fill, '#F8FAFC');
  assert.equal(ctx.frameState.scene.nodes.get('n1').fill, '#D1D5DB');
});







