import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import {
  createExplorationModel, createExplorationSession,
  fitBlockReason, isNodeGestureOwned, performReparentInstallation, recoverAuthoritativeSession, stageExplorationFrame
} from '../../../src/engine/hypertree/exploration/index.js';
import { EXPERIMENTAL_CAMERA_LIMITS, resetCamera } from '../../../src/engine/hypertree/navigation/index.js';

const viewport = { width: 1100, height: 473 };
function node(id, kind, children) {
  const value = { id, name: id, kind, data: { $dim: 4, $angularWidth: 1 } };
  if (children) value.children = children;
  return value;
}
function tree() {
  return node('r', 'folder', [node('a', 'folder', [node('a1', 'file'), node('a2', 'file'), node('asub', 'folder', [node('asub1', 'file')])]), node('b', 'folder', [node('b1', 'file')])]);
}
function initial() {
  const source = tree();
  const { graph } = loadTree(source);
  const staged = stageExperimentalV2Layout(graph, { rootId: 'r', phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, { viewport, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current' }).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: 'r', phase: 'current' });
  return { tree: source, graph, baseLayout, model };
}
function setup() {
  const live = initial();
  let candidateEnv = null;
  let commitCalls = 0;
  let generation = 0;
  let labels = 0;
  let hits = 0;
  let captured = null;
  let fail = null;
  let frame;
  const session = createExplorationSession({
    model: live.model,
    frame: (args) => frame(args),
    invalidate: () => {},
    publish: () => {},
    initialCamera: resetCamera(EXPERIMENTAL_CAMERA_LIMITS),
    limits: EXPERIMENTAL_CAMERA_LIMITS
  });
  live.session = session;
  frame = (args) => {
    const env = candidateEnv || live;
    const prepared = stageExplorationFrame({
      graph: env.graph, baseLayout: env.baseLayout, view: env.model.view(), viewport,
      baseRadiusCss: 198.66, fit: args.fit, entry: args.entry, camera: args.camera,
      framing: args.framing, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, presentation: new Map(),
      adapters: {
        draw: () => { if (fail === 'draw') throw new Error('draw failed'); },
        labels: () => { if (fail === 'label') throw new Error('label failed'); labels += 1; },
        installHit: () => { if (fail === 'hit') throw new Error('hit failed'); hits += 1; }
      }
    });
    generation += 1;
    captured = prepared;
    return { camera: prepared.camera, framing: prepared.framing, scene: prepared.scene, hit: prepared.hit, containment: prepared.containment };
  };
  const action = (overrides = {}) => performReparentInstallation({
    tree: live.tree, graph: live.graph, model: live.model, session: live.session,
    sourceId: 'a1', targetId: 'b',
    gesture: { sourceId: 'a1', generation: 0, datasetToken: 0, structuralRootId: 'r' },
    generation: 0, datasetToken: 0, structuralRootId: 'r', viewport, baseRadiusCss: 198.66,
    frame,
    setCandidateEnv: (env) => { candidateEnv = env; },
    commit: (candidate, candidateSession) => {
      commitCalls += 1;
      live.tree = candidate.tree; live.graph = candidate.graph; live.baseLayout = candidate.baseLayout;
      live.model = candidate.model; live.session = candidateSession;
    },
    recover: ({ error }) => {
      if (fail === 'recovery') return false;
      return true;
    },
    ...overrides
  });
  return { live, action, session, get candidateEnv() { return candidateEnv; }, get commitCalls() { return commitCalls; },
    get generation() { return generation; }, get labels() { return labels; }, get hits() { return hits; },
    get captured() { return captured; }, setFail: (value) => { fail = value; } };
}

test('Fit ownership covers pointerdown through release', () => {
  assert.equal(isNodeGestureOwned(null), false);
  assert.equal(isNodeGestureOwned({}), true);
  assert.equal(isNodeGestureOwned({ sourceId: 'a1' }), true);
});

test('shared action installs candidate and commits only after success', () => {
  const s = setup();
  const oldTree = s.live.tree;
  const result = s.action();
  assert.equal(result.ok, true);
  assert.equal(s.commitCalls, 1);
  assert.notEqual(s.live.tree, oldTree);
  assert.equal(s.captured.scene.nodes.has('a1'), true);
  assert.ok(s.labels >= 1);
  assert.ok(s.hits >= 1);
  assert.ok(s.generation >= 1);
});

test('preparation failure preserves authoritative refs and original error', () => {
  const s = setup();
  const old = s.live;
  const result = s.action({ makeCandidate: () => { throw new Error('prep exploded'); } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'preparation-failed');
  assert.equal(result.message, 'Could not prepare the move.');
  assert.match(result.error.message, /prep exploded/);
  assert.equal(s.commitCalls, 0);
  assert.equal(s.live.tree, old.tree);
  assert.equal(s.candidateEnv, null);
});

test('draw, label, and hit failures preserve original authoritative state', () => {
  for (const [failure, stage] of [['draw', 'draw'], ['label', 'label'], ['hit', 'hit']]) {
    const s = setup();
    s.setFail(failure);
    const old = s.live;
    const result = s.action();
    assert.equal(result.ok, false, stage);
    assert.equal(result.message, 'Could not apply the move.');
    assert.match(result.error.message, new RegExp(`${stage} failed`));
    assert.equal(s.commitCalls, 0);
    assert.equal(s.live.tree, old.tree);
    assert.equal(s.live.model, old.model);
    assert.equal(s.candidateEnv, null);
    assert.equal(result.recovered, true);
  }
});

test('recovery failure reports inert outcome', () => {
  const s = setup();
  s.setFail('draw');
  const result = s.action({ recover: () => false });
  assert.equal(result.ok, false);
  assert.equal(result.recovered, false);
  assert.equal(s.commitCalls, 0);
});
test('data-target drop keeps topology and reports exact message', () => {
  const s = setup();
  const old = s.live;
  const result = s.action({ targetId: 'a2' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'data-target');
  assert.equal(result.message, 'Drop onto a folder, not a data item.');
  assert.equal(s.commitCalls, 0);
  assert.equal(s.live.tree, old.tree);
});
test('harness recovery adapter reports real session success/failure', () => {
  const s = setup();
  assert.equal(recoverAuthoritativeSession(s.session), true);
  s.session.run('prime', () => ({ ok: true, fit: false }), { fit: false, eventKind: 'programmatic' });
  s.setFail('draw');
  assert.equal(recoverAuthoritativeSession(s.session), false);
  assert.equal(s.session.getState().hitActive, false);
});

test('real recovery failure keeps original installation error and inert state', () => {
  const s = setup();
  s.setFail('draw');
  const result = s.action({ recover: () => recoverAuthoritativeSession(s.session) });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /draw failed/);
  assert.equal(result.recovered, false);
  assert.equal(s.commitCalls, 0);
});





test('rejected move paths use exact English messages and never commit mutation or history', () => {
  const cases = [
    { name: 'empty', sourceId: 'a1', targetId: null, message: 'Drop onto a folder to move this item.' },
    { name: 'self', sourceId: 'a', targetId: 'a', message: 'An item cannot be moved into itself.' },
    { name: 'descendant', sourceId: 'a', targetId: 'asub', message: 'A folder cannot be moved into one of its subfolders.' },
    { name: 'data', sourceId: 'a1', targetId: 'a2', message: 'Drop onto a folder, not a data item.' },
    { name: 'existing-parent', sourceId: 'a1', targetId: 'a', message: 'This item is already in that folder.' },
    { name: 'source-root', sourceId: 'r', targetId: 'b', message: 'The root folder cannot be moved.' },
    { name: 'stale-gesture', sourceId: 'a1', targetId: 'b', gesture: { sourceId: 'a1', generation: 9, datasetToken: 0, structuralRootId: 'r' }, message: 'The map changed. Please try dragging again.' },
    { name: 'stale-id', sourceId: 'missing', targetId: 'b', message: 'The map changed. Please try dragging again.' }
  ];
  for (const item of cases) {
    const s = setup(); const old = s.live; const before = JSON.stringify(s.live.tree);
    const gesture = item.gesture || { sourceId: item.sourceId, generation: 0, datasetToken: 0, structuralRootId: 'r' };
    const result = s.action({ sourceId: item.sourceId, targetId: item.targetId, gesture });
    assert.equal(result.ok, false, item.name);
    assert.equal(result.message, item.message, item.name);
    assert.equal(s.commitCalls, 0, item.name);
    assert.equal(JSON.stringify(s.live.tree), before, item.name);
    assert.equal(s.live.model, old.model, item.name);
  }
});
