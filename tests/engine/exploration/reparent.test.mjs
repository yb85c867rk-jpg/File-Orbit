import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import { buildReparentCandidate, cloneTree, createExplorationModel, findParent, findTreeNode, prepareExplorationFrame, resolveDropTarget } from '../../../src/engine/hypertree/exploration/index.js';
import { EXPERIMENTAL_CAMERA_LIMITS } from '../../../src/engine/hypertree/navigation/index.js';
import { createHitSnapshot, hitTestNode } from '../../../src/engine/hypertree/interaction/index.js';

const viewport = { width: 1100, height: 473 };
function leaf(id, kind = 'file', children) {
  const value = { id, name: id, kind, data: Object.assign(Object.create(null), { $dim: 4, $angularWidth: 1 }) };
  if (children) value.children = children;
  return value;
}
function tree() {
  return leaf('r', 'folder', [
    leaf('a', 'folder', [leaf('a1', 'file'), leaf('a2', 'file'), leaf('a3', 'folder', [leaf('a3x', 'file')])]),
    leaf('b', 'folder', [leaf('b1', 'file')]),
    leaf('c', 'folder', [leaf('c1', 'file')])
  ]);
}
test('file move appends last child and preserves other sibling order', () => {
  const before = tree();
  const move = buildReparentCandidate({ tree: before, sourceId: 'a1', targetId: 'b' });
  assert.equal(move.ok, true);
  assert.deepEqual(findParent(before, 'a1').id, 'a');
  assert.deepEqual(before.children[0].children.map((n) => n.id), ['a1', 'a2', 'a3']);
  assert.deepEqual(findParent(move.candidateTree, 'a1').id, 'b');
  assert.deepEqual(findTreeNode(move.candidateTree, 'b').children.map((n) => n.id), ['b1', 'a1']);
  assert.deepEqual(findTreeNode(move.candidateTree, 'a').children.map((n) => n.id), ['a2', 'a3']);
  assert.equal(move.candidateTree.children[0].children[0].id, 'a2');
  assert.equal(move.candidateTree.children[0].children[0].data.$dim, 4);
});

test('folder move carries complete subtree and updates parent', () => {
  const before = tree();
  const move = buildReparentCandidate({ tree: before, sourceId: 'a', targetId: 'c' });
  assert.equal(move.ok, true);
  const moved = findParent(move.candidateTree, 'a');
  assert.equal(moved.id, 'c');
  assert.deepEqual(moved.children.map((n) => n.id), ['c1', 'a']);
  assert.deepEqual(findParent(move.candidateTree, 'a1').id, 'a');
  assert.deepEqual(findParent(move.candidateTree, 'a2').id, 'a');
  assert.deepEqual(move.subtreeIds, new Set(['a', 'a1', 'a2', 'a3', 'a3x']));
  const loaded = loadTree(move.candidateTree);
  const staged = stageExperimentalV2Layout(loaded.graph, { rootId: 'r', phases: ['current'], nodeOptions: { overridable: true } });
  assert.equal(staged.depths.get('a'), 2);
  assert.equal(staged.depths.get('a1'), 3);
  assert.notDeepEqual(before, move.candidateTree);
  assert.deepEqual(findParent(before, 'a').id, 'r');
});

test('invalid structural moves reject without mutating source', () => {
  const before = tree();
  const cases = [
    ['r', 'a', 'source-root'],
    ['a', 'a', 'self'],
    ['a', 'a3', 'descendant-target'],
    ['a1', 'a2', 'data-target'],
    ['missing', 'a', 'stale-id'],
    ['a1', 'missing', 'stale-id']
  ];
  for (const [source, target, reason] of cases) {
    const result = buildReparentCandidate({ tree: before, sourceId: source, targetId: target });
    assert.equal(result.ok, false, reason);
    assert.equal(result.reason, reason);
  }
  assert.deepEqual(before.children[0].children.map((n) => n.id), ['a1', 'a2', 'a3']);
  assert.equal(before.children[0].children[0].id, 'a1');
});

test('existing parent is a no-op and clone is independent', () => {
  const before = tree();
  const same = buildReparentCandidate({ tree: before, sourceId: 'a1', targetId: 'a' });
  assert.equal(same.ok, false);
  assert.equal(same.noop, true);
  const clone = cloneTree(before);
  assert.notEqual(clone, before);
  clone.children[0].children[0].name = 'mutated';
  assert.equal(before.children[0].children[0].name, 'a1');
});

test('candidate topology stages, fits, and installs matching final hits', () => {
  const before = tree();
  const move = buildReparentCandidate({ tree: before, sourceId: 'a1', targetId: 'b' });
  assert.equal(move.ok, true);
  const { graph } = loadTree(move.candidateTree);
  const staged = stageExperimentalV2Layout(graph, { rootId: 'r', phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, { viewport, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current' }).staged;
  assert.equal(findParent(move.candidateTree, 'a1').id, 'b');
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: 'r', phase: 'current' });
  model.enterFolder('b');
  const frame = prepareExplorationFrame({ graph, baseLayout, view: model.view(), viewport, padding: 24, baseRadiusCss: 198.66, fit: true, camera: null, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS });
  const hit = createHitSnapshot(frame.scene);
  assert.ok(frame.scene.nodes.has('a1'));
  assert.equal(hitTestNode(hit, frame.scene.nodes.get('a1').center), 'a1');
  assert.equal(frame.containment.contained, true);
  assert.deepEqual(findParent(before, 'a1').id, 'a');
});
test('pointerup target is authoritative; hover, empty, and stale gestures resolve correctly', () => {
  const gesture = { sourceId: 'a1', generation: 7, datasetToken: 2, structuralRootId: 'r', targetId: 'b' };
  const release = resolveDropTarget({ sourceId: 'a1', hitId: 'c', gesture, generation: 7, datasetToken: 2, structuralRootId: 'r' });
  assert.equal(release.ok, true);
  assert.equal(release.targetId, 'c');
  assert.notEqual(release.targetId, gesture.targetId);
  const empty = resolveDropTarget({ sourceId: 'a1', hitId: null, gesture, generation: 7, datasetToken: 2, structuralRootId: 'r' });
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, 'empty');
  const staleFrame = resolveDropTarget({ sourceId: 'a1', hitId: 'c', gesture, generation: 8, datasetToken: 2, structuralRootId: 'r' });
  assert.equal(staleFrame.reason, 'stale-gesture');
  const staleDataset = resolveDropTarget({ sourceId: 'a1', hitId: 'c', gesture, generation: 7, datasetToken: 3, structuralRootId: 'r' });
  assert.equal(staleDataset.reason, 'stale-gesture');
  const file = resolveDropTarget({ sourceId: 'a1', hitId: 'a2', gesture, generation: 7, datasetToken: 2, structuralRootId: 'r' });
  assert.equal(file.targetId, 'a2');
});



