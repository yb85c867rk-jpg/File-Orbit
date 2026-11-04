import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import {
  createExplorationModel, createExplorationSession, recoverAuthoritativeSession, stageExplorationFrame
} from '../../../src/engine/hypertree/exploration/index.js';
import { EXPERIMENTAL_CAMERA_LIMITS, resetCamera } from '../../../src/engine/hypertree/navigation/index.js';
import { performRenameInstallation } from '../../../src/engine/hypertree/editor/index.js';

const viewport = { width: 1100, height: 473 };
function node(id, kind, name, children) {
  return { id, name, kind, data: Object.assign(Object.create(null), { $dim: 4, $angularWidth: 1 }), children: children || [] };
}
function tree() {
  return node('r', 'folder', 'Root', [node('a', 'folder', 'Alpha', [node('x', 'file', 'Data')]), node('b', 'file', 'Beta')]);
}
function setup() {
  const source = tree();
  const { graph } = loadTree(source);
  const staged = stageExperimentalV2Layout(graph, { rootId: 'r', phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, {
    viewport, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current'
  }).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: 'r', phase: 'current' });
  model.select('a');
  const live = { tree: source, graph, baseLayout, model, session: null };
  let candidateEnv = null;
  let fail = null;
  let frames = 0;
  let commitCalls = 0;
  let recoveredCalls = 0;
  let committed = false;
  let frameSnapshot = null;
  const frame = (args) => {
    const env = candidateEnv || live;
    const prepared = stageExplorationFrame({
      graph: env.graph, baseLayout: env.baseLayout, view: env.model.view(), viewport,
      baseRadiusCss: 198.66, fit: args.fit, entry: args.entry, camera: args.camera,
      framing: args.framing, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, presentation: new Map(),
      adapters: {
        draw: () => { if (fail === 'draw' && candidateEnv) throw new Error('draw failed'); },
        labels: () => { if (fail === 'label' && candidateEnv) throw new Error('label failed'); },
        installHit: () => { if (fail === 'hit' && candidateEnv) throw new Error('hit failed'); }
      }
    });
    if (candidateEnv && fail !== 'draw' && fail !== 'label' && fail !== 'hit') {
      frames += 1;
      frameSnapshot = prepared;
    }
    return { camera: prepared.camera, framing: prepared.framing, scene: prepared.scene, hit: prepared.hit, containment: prepared.containment };
  };
  const session = createExplorationSession({
    model, frame, invalidate: () => {}, publish: () => {},
    initialCamera: resetCamera(EXPERIMENTAL_CAMERA_LIMITS),
    limits: EXPERIMENTAL_CAMERA_LIMITS
  });
  live.session = session;
  const action = (overrides = {}) => performRenameInstallation({
    tree: live.tree, graph: live.graph, baseLayout: live.baseLayout, model: live.model, session: live.session,
    targetId: 'a', draftName: 'Renamed', datasetToken: 1, baseRevision: 0,
    expectedDatasetToken: 1, expectedRevision: 0, structuralRootId: 'r', frame,
    setCandidateEnv: (env) => { candidateEnv = env; },
    commit: (candidate, candidateSession) => {
      commitCalls += 1;
      assert.equal(commitCalls, 1);
      assert.equal(candidate.baseLayout, live.baseLayout);
      committed = true;
      live.tree = candidate.tree; live.graph = candidate.graph; live.model = candidate.model; live.session = candidateSession;
    },
    recover: () => {
      recoveredCalls += 1;
      return recoverAuthoritativeSession(live.session);
    },
    ...overrides
  });
  return {
    live, action, session, frame,
    get candidateEnv() { return candidateEnv; }, get frames() { return frames; }, get commitCalls() { return commitCalls; },
    get recoveredCalls() { return recoveredCalls; }, get committed() { return committed; }, get frameSnapshot() { return frameSnapshot; },
    setFail: (value) => { fail = value; }, setCandidateEnv: (value) => { candidateEnv = value; }
  };
}

test('rename installs metadata-only candidate and preserves layout/camera', () => {
  const s = setup();
  const oldCamera = s.session.getState().camera;
  const oldLayout = s.live.baseLayout;
  const oldTree = s.live.tree;
  const result = s.action();
  assert.equal(result.ok, true);
  assert.equal(result.revision, 1);
  assert.equal(s.commitCalls, 1);
  assert.equal(s.live.tree.children[0].name, 'Renamed');
  assert.equal(s.live.tree.children[0].id, 'a');
  assert.equal(s.live.tree.children[0].data.$dim, 4);
  assert.equal(s.live.baseLayout, oldLayout);
  assert.equal(s.live.baseLayout.nodes.get('a').positions.get('current').rho, oldLayout.nodes.get('a').positions.get('current').rho);
  assert.equal(s.live.model.focusedFolderId, 'r');
  assert.equal(s.live.model.selectedId, 'a');
  assert.equal(s.live.session.getState().camera.x, oldCamera.x);
  assert.equal(s.live.session.getState().camera.y, oldCamera.y);
  assert.equal(s.live.session.getState().camera.zoom, oldCamera.zoom);
  assert.equal(s.live.session.getState().framing, s.session.getState().framing);
  assert.notEqual(s.live.tree, oldTree);
  assert.equal(s.frames, 1);
  assert.equal(s.committed, true);
});

test('rename no-op installs no frame and increments no revision', () => {
  const s = setup();
  const tree = s.live.tree;
  const result = s.action({ draftName: ' Alpha ' });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'noop');
  assert.equal(s.commitCalls, 0);
  assert.equal(s.frames, 0);
  assert.equal(s.live.tree, tree);
});

test('stale dataset/revision rejects before candidate or frame', () => {
  const s = setup();
  const tree = s.live.tree;
  assert.equal(s.action({ datasetToken: 2, expectedDatasetToken: 1 }).reason, 'stale-dataset');
  assert.equal(s.action({ baseRevision: 3, expectedRevision: 0 }).reason, 'stale-revision');
  assert.equal(s.commitCalls, 0);
  assert.equal(s.frames, 0);
  assert.equal(s.live.tree, tree);
});

test('candidate draw/label/hit failure preserves authoritative tree and camera', () => {
  for (const failure of ['draw', 'label', 'hit']) {
    const s = setup();
    s.setFail(failure);
    const oldTree = s.live.tree;
    const oldSession = s.live.session;
    const oldCamera = oldSession.getState().camera;
    const result = s.action();
    assert.equal(result.ok, false, failure);
    assert.match(result.error.message, new RegExp(`${failure} failed`));
    assert.equal(result.recovered, true);
    assert.equal(s.live.tree, oldTree);
    assert.equal(s.live.session, oldSession);
    assert.equal(s.commitCalls, 0);
    assert.equal(s.live.session.getState().camera.x, oldCamera.x);
    assert.equal(s.live.session.getState().camera.zoom, oldCamera.zoom);
  }
});

test('failed recovery leaves interaction inert and preserves original error', () => {
  const s = setup();
  s.setFail('draw');
  const oldTree = s.live.tree;
  const result = s.action({ recover: () => false });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /draw failed/);
  assert.equal(result.recovered, false);
  assert.equal(s.live.tree, oldTree);
});
test('root, folder, and data rename preserve ID and kind', () => {
  for (const [targetId, name] of [['r', 'Renamed root'], ['a', 'Renamed folder'], ['x', 'Renamed data']]) {
    const s = setup();
    const result = s.action({ targetId, draftName: name });
    assert.equal(result.ok, true);
    const node = s.live.graph.nodes.get(targetId);
    assert.equal(node.name, name);
    assert.equal(node.id, targetId);
    assert.equal(node.kind, targetId === 'x' ? 'file' : 'folder');
  }
});

test('301-node tree rejects before candidate/session', () => {
  const s = setup();
  const big = tree();
  while (big.children.length < 300) big.children.push(node(`extra${big.children.length}`, 'file', `Extra ${big.children.length}`));
  const result = s.action({ tree: big, targetId: 'r', draftName: 'Too big' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'editor-node-limit');
  assert.equal(s.frames, 0);
  assert.equal(s.commitCalls, 0);
});

