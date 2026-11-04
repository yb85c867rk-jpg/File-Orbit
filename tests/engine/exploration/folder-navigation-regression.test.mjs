import test from 'node:test';
import assert from 'node:assert/strict';
import { f20 } from '../layout/fixtures.mjs';
import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import { createExplorationModel, createExplorationSession, createExplorationNavigator } from '../../../src/engine/hypertree/exploration/index.js';
import { handleExplorationCanvasClick } from '../../../src/engine/hypertree/exploration/click-action.js';
import { prepareExplorationFrame } from '../../../src/engine/hypertree/exploration/frame.js';
import { resetCamera, EXPERIMENTAL_CAMERA_LIMITS } from '../../../src/engine/hypertree/navigation/index.js';
import { snapshotContainsHittableId } from '../../../src/engine/hypertree/interaction/index.js';
import { finalizeTransitionNavigation } from '../../../src/engine/hypertree/exploration/navigation-cleanup.js';

const viewport = { width: 1100, height: 473 };
const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: viewport.width, height: viewport.height }) };
function fixture() {
  const tree = f20();
  const { graph } = loadTree(tree);
  const staged = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, { viewport, padding: 24, phase: 'current', projectionBaseRadiusCss: 198.66 }).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: tree.id, phase: 'current' });
  return { tree, graph, baseLayout, model };
}
function scheduler() {
  let now = 0;
  let next = 1;
  const pending = new Map();
  return {
    now: () => now,
    requestFrame: (callback) => { const id = next++; pending.set(id, callback); return id; },
    cancelFrame: (id) => pending.delete(id),
    step(ms = 20) { now += ms; const current = [...pending.entries()]; pending.clear(); for (const [, callback] of current) callback(now); },
    get size() { return pending.size; }
  };
}
function setup(options = {}) {
  const { tree, graph, baseLayout, model } = fixture();
  let lastFrame = null;
  const frame = (args) => {
    const prepared = prepareExplorationFrame({
      graph, baseLayout, view: args.entry?.view || model.view(), viewport,
      baseRadiusCss: 198.66, fit: args.fit, camera: args.camera, framing: args.framing,
      cameraLimits: EXPERIMENTAL_CAMERA_LIMITS
    });
    lastFrame = prepared;
    return { camera: prepared.camera, framing: args.framing, scene: prepared.scene, filtered: prepared.filtered, hit: prepared.hit, containment: prepared.containment };
  };
  const session = createExplorationSession({ model, frame, invalidate: () => {}, publish: () => {}, initialCamera: resetCamera(EXPERIMENTAL_CAMERA_LIMITS), limits: EXPERIMENTAL_CAMERA_LIMITS });
  const clock = scheduler();
  let recoveryRuns = 0;
  let terminal = false;
  const runSession = session.run.bind(session);
  session.run = (event, prepare, options) => { if (event === 'recovery') recoveryRuns += 1; return runSession(event, prepare, options); };
  const calls = { start: 0, frames: 0, labels: 0, settled: 0, errors: 0, restored: 0, suspended: 0 };
  const nav = createExplorationNavigator({
    graph, baseLayout, model, session, viewport, baseRadiusCss: 198.66,
    cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, duration: 780,
    prepare: options.prepare || prepareExplorationFrame,
    createTransition: options.createTransition,
    transitionOptions: { now: clock.now, requestFrame: clock.requestFrame, cancelFrame: clock.cancelFrame },
    draw: () => {}, labels: options.labels || (() => { calls.labels += 1; }),
    onStart: () => { terminal = false; calls.start += 1; calls.suspended += 1; },
    onFrame: () => { calls.frames += 1; },
    onError: ({ error: frameError }) => { if (terminal) return; calls.errors += 1; finalizeTransitionNavigation({ overlay: null, transitionLabels: false, session, error: frameError, restoreNavigation: () => { calls.restored += 1; } }); terminal = true; },
    onSettled: () => { if (terminal) return; terminal = true; calls.settled += 1; calls.restored += 1; }
  });
  return { tree, graph, baseLayout, model, session, nav, clock, calls, get lastFrame() { return lastFrame; }, get recoveryRuns() { return recoveryRuns; } };
}
function click(fixtureValue) {
  return handleExplorationCanvasClick({
    event: { button: 0, clientX: 50, clientY: 50 }, canvas,
    frameState: { hit: { nodes: [{ id: 'n6', kind: 'folder', shape: 'circle', visible: true, center: { x: 50, y: 50 }, radius: 20 }], padding: 0 } },
    session: fixtureValue.session, model: fixtureValue.model, graph: fixtureValue.graph,
    onFolder: ({ id }) => fixtureValue.nav.enterFolder(id)
  });
}
test('n6 folder click animates, renders intermediate frames, and installs target scope', () => {
  const s = setup();
  const result = click(s);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'transition');
  assert.equal(s.calls.start, 1);
  assert.equal(s.nav.busy, true);
  s.clock.step(100);
  assert.ok(s.calls.frames > 0);
  while (s.clock.size > 0 && s.model.focusedFolderId !== 'n6') s.clock.step(100);
  assert.equal(s.model.focusedFolderId, 'n6');
  assert.equal(s.calls.settled, 1);
  assert.equal(s.calls.restored, 1);
  assert.equal(s.nav.busy, false);
  assert.equal(snapshotContainsHittableId(s.lastFrame.hit, 'n6'), true);
  const center = s.lastFrame.scene.nodes.get('n6').center;
  assert.ok(Math.hypot(center.x - viewport.width / 2, center.y - viewport.height / 2) < 1);
  assert.ok(s.calls.labels > 0);
});
test('target preparation failure preserves target-fit-failed and does not claim success', () => {
  const s = setup({ prepare: () => { throw new Error('fit exploded'); } });
  const result = click(s);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'target-fit-failed');
  assert.match(result.error, /fit exploded/);
  assert.equal(s.calls.start, 0);
  assert.equal(s.model.focusedFolderId, 'n0');
  assert.equal(s.calls.settled, 0);
});
test('transition start failure reports original diagnostic and releases ownership once', () => {
  const s = setup({ createTransition: () => { throw new Error('start exploded'); } });
  const result = click(s);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'transition-start-failed');
  assert.match(result.error, /start exploded/);
  assert.equal(s.calls.start, 1);
  assert.equal(s.calls.errors, 1);
  assert.equal(s.calls.restored, 1);
  assert.equal(s.nav.busy, false);
  assert.equal(s.model.focusedFolderId, 'n0');
});test('label startup failure flows through transition error cleanup without claiming success', () => {
  const s = setup({ labels: () => { throw new Error('label startup exploded'); } });
  const result = click(s);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'transition-start-failed');
  assert.match(result.error, /label startup exploded/);
  assert.ok(s.calls.errors >= 1);
  assert.ok(s.calls.restored >= 1);
  assert.equal(s.calls.settled, 0);
});test('transition failure installs a usable recovery frame and allows the next click', () => {
  let labelCalls = 0;
  const s = setup({ labels: () => { labelCalls += 1; if (labelCalls > 1) throw new Error('label update exploded'); } });
  const result = click(s);
  assert.equal(result.ok, true);
  s.clock.step(100);
  assert.equal(s.calls.errors, 1);
  assert.equal(s.calls.restored, 1);
  assert.equal(s.recoveryRuns, 1);
  assert.equal(s.model.focusedFolderId, 'n0');
  assert.equal(snapshotContainsHittableId(s.lastFrame.hit, 'n0'), true);
  assert.equal(s.nav.busy, false);
});test('failed recovery leaves interaction suspended without restoration', () => {
  let labelCalls = 0;
  const s = setup({ labels: () => { labelCalls += 1; if (labelCalls > 1) throw new Error('label update exploded'); } });
  click(s);
  const originalRun = s.session.run.bind(s.session);
  s.session.run = (event, prepare, options) => event === 'recovery' ? { ok: false, error: new Error('recovery failed') } : originalRun(event, prepare, options);
  s.clock.step(100);
  assert.equal(s.calls.errors, 1);
  assert.equal(s.recoveryRuns, 0);
  assert.equal(s.calls.restored, 0);
  assert.equal(s.calls.settled, 0);
  assert.equal(s.nav.busy, false);
});


