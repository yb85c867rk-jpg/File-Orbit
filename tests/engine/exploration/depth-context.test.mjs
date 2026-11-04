import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import { buildFilteredViewLayout, createExplorationModel, deriveSubtreeView } from '../../../src/engine/hypertree/exploration/index.js';
import { f20, f200 } from '../layout/fixtures.mjs';

const viewport = { width: 1100, height: 473 };
const options = { viewport, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current' };
function node(id, kind, children) {
  const value = { id, name: id, kind, data: Object.assign(Object.create(null), { $dim: 4, $angularWidth: 1 }) };
  if (children) value.children = children;
  return value;
}
function controlledTree() {
  return node('r', 'folder', [
    node('a', 'folder', [
      node('a1', 'folder', [node('a1x', 'file')]),
      node('a2', 'file')
    ]),
    node('b', 'folder', [
      node('b1', 'folder', [node('b1x', 'file')]),
      node('b2', 'file')
    ])
  ]);
}
function setup(tree = controlledTree()) {
  const { graph } = loadTree(tree);
  const staged = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, options).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: tree.id, phase: 'current' });
  return { graph, baseLayout, model };
}
function referenceDepths(root) {
  const depths = new Map();
  const parents = new Map();
  const order = [];
  const stack = [[root, null, 0]];
  while (stack.length) {
    const [item, parent, depth] = stack.pop();
    depths.set(item.id, depth);
    if (parent !== null) parents.set(item.id, parent);
    order.push(item.id);
    const children = item.children || [];
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push([children[i], item.id, depth + 1]);
  }
  return { depths, parents, order };
}
function referenceVisible(tree, focusedId) {
  const ref = referenceDepths(tree);
  const focusDepth = ref.depths.get(focusedId);
  const subtree = new Set();
  const stack = [focusedId];
  while (stack.length) {
    const id = stack.pop();
    subtree.add(id);
    const find = (item) => item.id === id ? item : (item.children || []).map(find).find(Boolean);
    const item = find(tree);
    for (const child of item?.children || []) stack.push(child.id);
  }
  const visible = new Set([...ref.depths.keys()].filter((id) => ref.depths.get(id) <= focusDepth));
  for (const id of subtree) visible.add(id);
  return { visible, contextDepth: focusDepth, subtree };
}

test('controlled depth-2 folders include all depth-0/1/2 nodes and only their own deeper descendants', () => {
  const { model } = setup();
  const a1 = model.enterFolder('a1');
  assert.equal(a1.ok, true);
  const av = model.view();
  assert.equal(av.focusedStructuralDepth, 2);
  assert.deepEqual([...av.visibleSet].sort(), ['a', 'a1', 'a1x', 'a2', 'b', 'b1', 'b2', 'r']);
  assert.equal(av.visibleSet.has('b1x'), false);
  assert.equal(av.visibleEdgeCount, 7);
  assert.equal(av.contextCount, 7);
  assert.equal(av.subtreeCount, 2);
  assert.equal(av.contextOverlapCount, 1);

  const b1 = model.enterFolder('b1');
  assert.equal(b1.ok, true);
  const bv = model.view();
  assert.deepEqual([...bv.visibleSet].sort(), ['a', 'a1', 'a2', 'b', 'b1', 'b1x', 'b2', 'r']);
  assert.equal(bv.visibleSet.has('a1x'), false);
  assert.equal(bv.visibleEdgeCount, 7);
});

test('shallower folder and root restore depth context correctly', () => {
  const { model } = setup();
  model.enterFolder('b1');
  model.enterFolder('a');
  const av = model.view();
  assert.equal(av.focusedStructuralDepth, 1);
  assert.deepEqual([...av.visibleSet].sort(), ['a', 'a1', 'a1x', 'a2', 'b', 'r']);
  assert.equal(av.visibleSet.has('b1'), false);
  assert.equal(av.visibleEdgeCount, 5);
  model.enterFolder('r');
  assert.equal(model.view().focusedStructuralDepth, 0);
  assert.deepEqual([...model.view().visibleSet].sort(), ['a', 'a1', 'a1x', 'a2', 'b', 'b1', 'b1x', 'b2', 'r']);
  assert.equal(model.view().visibleEdgeCount, 8);
});

test('same-depth lateral folders change descendant scope and preserve exact original edges', () => {
  const { model } = setup();
  model.enterFolder('a2'); // file rejected
  assert.equal(model.focusedFolderId, 'r');
  model.enterFolder('a1');
  const a = model.view();
  model.enterFolder('b1');
  const b = model.view();
  assert.notDeepEqual(a.visibleSet, b.visibleSet);
  assert.equal(b.contextCount, a.contextCount);
  for (const [parent, child] of b.visibleEdges) {
    assert.ok(b.visibleSet.has(parent) && b.visibleSet.has(child));
  }
  assert.equal(b.visibleEdges.length, b.visibleIds.length - 1);
});

test('F20/F200 membership matches an independent original-depth reference', () => {
  for (const make of [f20, f200]) {
    const tree = make();
    const { graph, baseLayout, model } = setup(tree);
    for (const [id, graphNode] of graph.nodes) {
      if (graphNode.kind === 'folder') {
        const expected = referenceVisible(tree, id);
        model.enterFolder(baseLayout.rootId);
        model.enterFolder(id);
        const view = model.view();
        assert.equal(view.focusedStructuralDepth, expected.contextDepth, id);
        assert.deepEqual([...view.visibleSet].sort(), [...expected.visible].sort(), id);
        for (const childId of expected.subtree) assert.ok(view.visibleSet.has(childId), `${id}/${childId}`);
        assert.equal(view.visibleEdgeCount, expectedEdges(baseLayout, view.visibleSet), id);
        assert.equal(view.visibleIds.length, new Set(view.visibleIds).size);
      }
    }
  }
});
function expectedEdges(baseLayout, visibleSet) {
  let count = 0;
  for (const [parent, children] of baseLayout.children) {
    if (!visibleSet.has(parent)) continue;
    for (const child of children) if (visibleSet.has(child)) count += 1;
  }
  return count;
}

test('filtered view and authoritative base remain immutable', () => {
  const { baseLayout, model, graph } = setup();
  const before = [...baseLayout.nodes].map(([id, n]) => [id, n.positions.get('current').theta, n.positions.get('current').rho]);
  model.enterFolder('a1');
  const filtered = buildFilteredViewLayout({ baseLayout, view: model.view() });
  assert.deepEqual([...filtered.nodes.keys()].sort(), [...model.view().visibleSet].sort());
  assert.equal(graph.nodes.size, 9);
  assert.deepEqual([...baseLayout.nodes].map(([id, n]) => [id, n.positions.get('current').theta, n.positions.get('current').rho]), before);
});


