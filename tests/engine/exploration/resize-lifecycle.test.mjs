import test from 'node:test';
import assert from 'node:assert/strict';
import { f20 } from '../layout/fixtures.mjs';
import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import { createExplorationModel, createExplorationSession, createExplorationNavigator } from '../../../src/engine/hypertree/exploration/index.js';
import { performViewportResizeAction } from '../../../src/engine/hypertree/exploration/resize-action.js';
import { prepareExplorationFrame } from '../../../src/engine/hypertree/exploration/frame.js';
import { resetCamera, EXPERIMENTAL_CAMERA_LIMITS } from '../../../src/engine/hypertree/navigation/index.js';

function scheduler() {
  let now = 0; let next = 1; const pending = new Map();
  return {
    now: () => now,
    requestFrame: (cb) => { const id = next++; pending.set(id, cb); return id; },
    cancelFrame: (id) => pending.delete(id),
    step(ms = 20) { now += ms; const entries = [...pending.entries()]; pending.clear(); for (const [, cb] of entries) cb(now); },
    get size() { return pending.size; }
  };
}
function setup(width = 1100, height = 473) {
  const view = { width, height };
  const tree = f20(); const { graph } = loadTree(tree);
  const staged = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, { viewport: view, padding: 24, phase: 'current', projectionBaseRadiusCss: Math.min(width, height) * 0.42 }).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: tree.id, phase: 'current' });
  let failResize = false;
  let lastFrame = null;
  const frame = (args) => {
    if (args.entry?.eventKind === 'resize' && failResize) throw new Error('resize frame exploded');
    const prepared = prepareExplorationFrame({ graph, baseLayout, view: args.entry?.view || model.view(), viewport: view, baseRadiusCss: Math.min(view.width, view.height) * 0.42, fit: args.fit, camera: args.camera, framing: args.framing, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS });
    lastFrame = prepared;
    return { camera: prepared.camera, framing: args.framing, scene: prepared.scene, filtered: prepared.filtered, hit: prepared.hit, containment: prepared.containment };
  };
  const session = createExplorationSession({ model, frame, invalidate: () => {}, publish: () => {}, initialCamera: resetCamera(EXPERIMENTAL_CAMERA_LIMITS), limits: EXPERIMENTAL_CAMERA_LIMITS });
  const initial = session.run('initial-overview', () => ({ ok: true, fit: true }), { fit: false, eventKind: 'programmatic' });
  assert.equal(initial.ok, true);
  const clock = scheduler();
  let navigator = null;
  let navigation = null;
  let navigatorCreates = 0;
  let navigationCreates = 0;
  let active = true;
  const createNavigator = () => {
    navigatorCreates += 1;
    navigator = createExplorationNavigator({
      graph, baseLayout, model, session, viewport: { ...view }, baseRadiusCss: Math.min(view.width, view.height) * 0.42,
      cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, duration: 780,
      transitionOptions: { now: clock.now, requestFrame: clock.requestFrame, cancelFrame: clock.cancelFrame },
      draw: () => {}, labels: () => {},
      onSettled: () => {}, onError: () => {}
    });
  };
  const resize = (nextWidth, nextHeight) => {
    const previous = { ...view };
    view.width = nextWidth; view.height = nextHeight;
    return performViewportResizeAction({
      session, fit: session.getState().framing === 'fit',
      cancelTransition: () => { if (navigator) { navigator.cancel('resize'); navigator = null; } },
      teardown: () => { navigation = null; },
      recreate: () => {},
      createNavigator: () => { if (!active) throw new Error('inactive'); createNavigator(); },
      createNavigation: () => { navigationCreates += 1; navigation = {}; },
      onFailure: () => { navigator = null; navigation = null; active = false; }
    });
  };
  createNavigator(); navigationCreates += 1;
  return { view, graph, model, session, get navigator() { return navigator; }, get navigation() { return navigation; }, get navigatorCreates() { return navigatorCreates; }, get navigationCreates() { return navigationCreates; }, get active() { return active; }, get lastFrame() { return lastFrame; }, clock, resize, setFailResize: (value) => {
    failResize = value;
    if (value) {
      const original = session.run.bind(session);
      session.run = (event, prepare, opts) => event === 'resize' ? { ok: false, reason: 'resize-frame-failed', error: new Error('resize frame exploded') } : original(event, prepare, opts);
    }
  } };
}
function folderInScope(s) {
  return [...s.model.view().visibleSet].find((id) => id !== s.model.focusedFolderId && s.graph.nodes.get(id)?.kind === 'folder');
}
function clickAndFinish(s, id) {
  const result = s.navigator.enterFolder(id);
  assert.equal(result.ok, true, JSON.stringify(result));
  while (s.clock.size > 0 && s.model.focusedFolderId !== id) s.clock.step(100);
  assert.equal(s.model.focusedFolderId, id);
  const node = s.lastFrame.scene.nodes.get(id);
  assert.ok(Math.hypot(node.center.x - s.view.width / 2, node.center.y - s.view.height / 2) < 1);
}
test('resize recreates navigator and off-center folder click works at 874x622', () => {
  const s = setup(1100, 473);
  const before = s.navigatorCreates;
  assert.equal(s.resize(874, 622).ok, true);
  assert.equal(s.navigatorCreates, before + 1);
  assert.ok(s.navigator);
  clickAndFinish(s, 'n6');
});
test('repeat resize and another folder click', () => {
  const s = setup(1100, 473);
  s.resize(874, 622);
  clickAndFinish(s, 'n6');
  const next = folderInScope(s);
  assert.ok(next);
  assert.equal(s.resize(900, 500).ok, true);
  clickAndFinish(s, next);
});
test('resize during a transition cancels it and navigation still works', () => {
  const s = setup(1100, 473);
  const started = s.navigator.enterFolder('n6');
  assert.equal(started.ok, true);
  s.clock.step(100);
  assert.equal(s.navigator.busy, true);
  assert.equal(s.resize(874, 622).ok, true);
  assert.equal(s.model.focusedFolderId, 'n0');
  clickAndFinish(s, 'n6');
});
test('failed resized-frame installation does not enable navigation', () => {
  const s = setup(1100, 473);
  const before = s.navigatorCreates;
  s.setFailResize(true);
  const result = s.resize(874, 622);
  assert.equal(result.ok, false);
  assert.equal(s.navigator, null);
  assert.equal(s.navigation, null);
  assert.equal(s.active, false);
  assert.equal(s.navigatorCreates, before);
});


