import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { Graph } from '../../../src/engine/hypertree/graph/index.js';
import { Polar } from '../../../src/engine/hypertree/math/index.js';
import {
  computeAngularWidths,
  normalizeNodeOptions,
  normalizePhases,
  resolveAngularWidth,
  resolveDim,
  resolveSpan,
  LayoutContractError
} from '../../../src/engine/hypertree/layout/index.js';
import {
  f20,
  f200,
  singleRoot,
  unequal,
  integerIds,
  deepChain,
  wide,
  F20_PREORDER
} from './fixtures.mjs';
import { legacyAngularWidths } from './legacy-layout-oracle.mjs';

const ANGULAR_TOL = 1e-12;

/** @param {number} actual @param {number} expected @param {string} label */
function close(actual, expected, label) {
  const allowed = ANGULAR_TOL + ANGULAR_TOL * Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= allowed, `${label}: ${actual} vs ${expected}`);
}

/** @param {object} s */
function assertUnchanged(s) {
  const n = s.node;
  assert.equal(n._depth, s.depth);
  assert.equal(n._flag, s.flag);
  assert.equal(n.pos, s.pos);
  assert.deepEqual([n.pos.rho, n.pos.theta], s.posValues);
  assert.equal(n.startPos, s.start);
  assert.deepEqual([n.startPos.rho, n.startPos.theta], s.startValues);
  assert.equal(n.endPos, s.end);
  assert.deepEqual([n.endPos.rho, n.endPos.theta], s.endValues);
  assert.equal(n.data.$span, s.span);
  assert.equal(n.data.$angularWidth, s.angularData);
  assert.equal(n.data.$dim, s.dimData);
  assert.equal(n.data['$dim-quotient'], s.quotient);
  assert.deepEqual(n.angleSpan, s.angleSpan);
  assert.equal(n.scale, s.scale);
  assert.equal(n._angularWidth, s.angular);
  assert.equal(n._treeAngularWidth, s.tree);
}

/** @param {object} tree @returns {string[]} */
function preorderIds(tree) {
  const out = [];
  const stack = [tree];
  while (stack.length > 0) {
    const node = stack.pop();
    out.push(node.id);
    const children = node.children || [];
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
  return out;
}

/** @param {Graph} graph @param {string} rootId @param {object} [nodeOptions] @param {string[]} [phases] */
function stage(graph, rootId, nodeOptions = { overridable: true }, phases = ['current', 'start', 'end']) {
  return computeAngularWidths(graph, { rootId, nodeOptions, phases });
}

test('resolver: overridable false ignores node data and uses config/defaults', () => {
  const { graph } = loadTree(f20());
  const n = graph.getNode('n1');
  n.data.$dim = 99;
  n.data.$angularWidth = 9;
  const options = normalizeNodeOptions({ overridable: false, dim: 3, angularWidth: 1 });
  assert.equal(resolveDim(n, 'current', options), 3);
  assert.equal(resolveAngularWidth(n, 'current', options), 1);
  assert.equal(resolveSpan(n, 'end', options), 1);
  assert.equal(n.data.$dim, 99);
  assert.equal(n.data.$angularWidth, 9);
});

test('resolver: selected phase -> current -> config -> default precedence', () => {
  const { graph } = loadTree(f20());
  const n = graph.getNode('n1');
  const options = normalizeNodeOptions({ overridable: true, dim: 3, angularWidth: 1, span: 1 });
  n.data.$dim = 7;
  n.startData.$dim = 8;
  n.endData.$dim = 9;
  assert.equal(resolveDim(n, 'current', options), 7);
  assert.equal(resolveDim(n, 'start', options), 8);
  assert.equal(resolveDim(n, 'end', options), 9);

  n.startData.$dim = 0;
  assert.equal(resolveDim(n, 'start', options), 0, 'explicit zero must be preserved');

  delete n.startData.$dim;
  assert.equal(resolveDim(n, 'start', options), 7, 'current fallback');
  delete n.data.$dim;
  assert.equal(resolveDim(n, 'start', options), 3, 'config fallback');

  n.data.$dim = Number.NaN;
  assert.throws(() => resolveDim(n, 'current', options), (e) => e.code === 'invalid-dim');
  n.data.$dim = -1;
  assert.throws(() => resolveDim(n, 'current', options), (e) => e.code === 'invalid-dim');
  n.data.$angularWidth = 0;
  assert.throws(() => resolveAngularWidth(n, 'current', options), (e) => e.code === 'invalid-angular-width');
  n.data.$span = 0;
  assert.equal(resolveSpan(n, 'current', options), 0);
  assert.throws(() => normalizeNodeOptions({ span: -1 }), (e) => e.code === 'invalid-option');
});

test('resolver: phase and option validation', () => {
  assert.deepEqual(normalizePhases(undefined), ['current', 'start', 'end']);
  assert.deepEqual(normalizePhases('end'), ['end']);
  assert.throws(() => normalizePhases('nope'), (e) => e.code === 'invalid-phase');
  assert.throws(() => normalizePhases(['current', 'current']), (e) => e.code === 'invalid-phase');
  assert.throws(() => normalizeNodeOptions({ overridable: 'yes' }), (e) => e.code === 'invalid-option');
  assert.throws(() => normalizeNodeOptions({ dim: Number.NaN }), (e) => e.code === 'invalid-option');
  assert.throws(() => normalizeNodeOptions({ dim: null }), (e) => e.code === 'invalid-option');
  assert.throws(() => normalizeNodeOptions({ angularWidth: 0 }), (e) => e.code === 'invalid-option');
});

test('staged result has expected API and does not mutate live graph', () => {
  const { graph } = loadTree(f20());
  const result = stage(graph, 'n0');
  assert.equal(result.rootId, 'n0');
  assert.deepEqual(result.phases, ['current', 'start', 'end']);
  assert.equal(result.firstPhase, 'current');
  assert.equal(result.nodeCount, 20);
  assert.equal(result.depths.size, 20);
  assert.equal(result.angularWidths.size, 20);
  assert.equal(result.treeAngularWidths.size, 20);
  assert.equal(result.children.size, 20);
  assert.deepEqual([...graph.nodes.keys()], [...F20_PREORDER]);
  for (const node of graph.nodes.values()) {
    assert.equal(node._depth, -1);
    assert.equal(node._flag, false);
  }
});

test('F20 legacy angular-width parity; modern root correction', () => {
  const tree = f20();
  const { graph } = loadTree(tree);
  const modern = stage(graph, 'n0');
  const legacy = legacyAngularWidths(tree, 'n0');
  assert.deepEqual(Object.keys(legacy.graph.nodes), [...F20_PREORDER]);

  assert.equal(legacy.rootAngularWidth, Infinity);
  assert.equal(legacy.rootTreeAngularWidth, Infinity);
  assert.equal(modern.angularWidths.get('n0'), 0);
  assert.ok(Number.isFinite(modern.treeAngularWidths.get('n0')));

  for (const id of graph.nodes.keys()) {
    assert.equal(modern.depths.get(id), legacy.depths.get(id), `depth ${id}`);
    if (id === 'n0') continue;
    close(modern.angularWidths.get(id), legacy.angularWidths.get(id), `angular ${id}`);
    close(modern.treeAngularWidths.get(id), legacy.treeAngularWidths.get(id), `tree ${id}`);
  }

  const rootChildren = [...graph.getNode('n0').adjacencies.keys()];
  const independentSum = rootChildren.reduce((sum, id) => sum + modern.treeAngularWidths.get(id), 0);
  close(modern.treeAngularWidths.get('n0'), independentSum, 'root correction child sum');
});

test('F200 legacy angular-width parity', () => {
  const tree = f200();
  const { graph } = loadTree(tree);
  const modern = stage(graph, 'n0');
  const legacy = legacyAngularWidths(tree, 'n0');
  assert.equal(modern.nodeCount, 200);
  assert.deepEqual([...graph.nodes.keys()], preorderIds(tree));
  for (const id of graph.nodes.keys()) {
    assert.equal(modern.depths.get(id), legacy.depths.get(id), `depth ${id}`);
    if (id === 'n0') continue;
    close(modern.angularWidths.get(id), legacy.angularWidths.get(id), `angular ${id}`);
    close(modern.treeAngularWidths.get(id), legacy.treeAngularWidths.get(id), `tree ${id}`);
  }
  assert.equal(modern.angularWidths.get('n0'), 0);
  assert.ok(Number.isFinite(modern.treeAngularWidths.get('n0')));
});

test('single root and unequal weights', () => {
  const single = loadTree(singleRoot());
  const singleStage = stage(single.graph, 'n0');
  assert.equal(singleStage.angularWidths.get('n0'), 0);
  assert.equal(singleStage.treeAngularWidths.get('n0'), 0);

  const uneven = loadTree(unequal());
  const result = stage(uneven.graph, 'r');
  assert.equal(result.angularWidths.get('a'), 1);
  assert.equal(result.angularWidths.get('b'), 2);
  assert.equal(result.angularWidths.get('c'), 1.5);
  assert.equal(result.treeAngularWidths.get('r'), 4.5);
});

test('root angularWidth is validated before root correction', () => {
  const cases = [
    { tree: singleRoot(), rootId: 'n0' },
    { tree: unequal(), rootId: 'r' }
  ];
  for (const { tree, rootId } of cases) {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { graph } = loadTree(tree);
      const root = graph.getNode(rootId);
      root.data.$angularWidth = value;
      assert.throws(
        () => stage(graph, rootId),
        (error) => error.code === 'invalid-angular-width' && error.nodeId === rootId,
        `root ${rootId} value ${value}`
      );
    }
    const { graph } = loadTree(tree);
    const root = graph.getNode(rootId);
    root.data.$angularWidth = 2;
    assert.equal(stage(graph, rootId).angularWidths.get(rootId), 0);
  }

  const { graph } = loadTree(unequal());
  const root = graph.getNode('r');
  root.data.$angularWidth = 2;
  root.endData.$angularWidth = 3;
  assert.equal(stage(graph, 'r', { overridable: true }, ['end']).angularWidths.get('r'), 0);
  delete root.endData.$angularWidth;
  assert.equal(stage(graph, 'r', { overridable: true }, ['end']).angularWidths.get('r'), 0);
  root.data.$angularWidth = 0;
  assert.throws(
    () => stage(graph, 'r', { overridable: true }, ['end']),
    (error) => error.code === 'invalid-angular-width'
  );
});

test('root validation honors overridable=false and leaves live state unchanged', () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const { graph } = loadTree(unequal());
    graph.getNode('r').data.$angularWidth = value;
    const result = computeAngularWidths(graph, {
      rootId: 'r',
      phases: ['current'],
      nodeOptions: { overridable: false, angularWidth: 1 }
    });
    assert.equal(result.angularWidths.get('r'), 0);
  }

  const { graph } = loadTree(unequal());
  const snapshots = [];
  for (const [i, node] of [...graph.nodes.values()].entries()) {
    node._depth = 70 + i;
    node._flag = i % 2 === 0;
    node.pos.setc(i, i + 1);
    node.startPos.setc(i + 2, i + 3);
    node.endPos.setc(i + 4, i + 5);
    node.data.$span = i;
    node.data['$dim-quotient'] = i / 10;
    node.angleSpan = { begin: i, end: i + 1 };
    node.scale = 30 + i;
    node._angularWidth = 5 + i;
    node._treeAngularWidth = 6 + i;
    snapshots.push({
      node,
      depth: node._depth,
      flag: node._flag,
      pos: node.pos,
      posValues: [node.pos.rho, node.pos.theta],
      start: node.startPos,
      startValues: [node.startPos.rho, node.startPos.theta],
      end: node.endPos,
      endValues: [node.endPos.rho, node.endPos.theta],
      span: node.data.$span,
      quotient: node.data['$dim-quotient'],
      angleSpan: { ...node.angleSpan },
      scale: node.scale,
      angular: node._angularWidth,
      tree: node._treeAngularWidth,
      angularData: node.data.$angularWidth,
      dimData: node.data.$dim
    });
  }
  graph.getNode('r').data.$angularWidth = 0;
  snapshots[0].angularData = 0;
  assert.throws(() => stage(graph, 'r'), (error) => error.code === 'invalid-angular-width');
  snapshots.forEach(assertUnchanged);
});

test('first selected phase controls angular width resolution', () => {
  const { graph } = loadTree(unequal());
  const b = graph.getNode('b');
  b.data.$angularWidth = 2;
  b.endData.$angularWidth = 4;
  b.startData.$angularWidth = 3;

  const end = stage(graph, 'r', { overridable: true }, ['end']);
  assert.equal(end.firstPhase, 'end');
  assert.equal(end.angularWidths.get('b'), 4);

  const currentFirst = stage(graph, 'r', { overridable: true }, ['current', 'end']);
  assert.equal(currentFirst.angularWidths.get('b'), 2);
  assert.throws(() => stage(graph, 'r', undefined, ['bogus']), (e) => e.code === 'invalid-phase');
});

test('integer-like IDs keep M2 insertion order', () => {
  const { graph } = loadTree(integerIds());
  const result = stage(graph, 'r');
  assert.deepEqual([...result.angularWidths.keys()], ['r', '10', '2', '1']);
  assert.deepEqual([...result.depths.keys()], ['r', '10', '2', '1']);
});

test('deep chain at the declared limit and wide tree', () => {
  const deep = loadTree(deepChain(10000));
  const deepResult = stage(deep.graph, 'd0');
  assert.equal(deepResult.nodeCount, 10000);
  assert.equal(deepResult.depths.get('d9999'), 9999);
  assert.ok(Number.isFinite(deepResult.treeAngularWidths.get('d0')));

  const broad = loadTree(wide(1000));
  const broadResult = stage(broad.graph, 'w0');
  assert.equal(broadResult.nodeCount, 1001);
  assert.equal(broadResult.treeAngularWidths.get('w0'), 1000);
});

test('rejects invalid weights, flags, topology, and aggregate overflow', () => {
  const badWeight = loadTree(unequal()).graph;
  badWeight.getNode('b').data.$angularWidth = 0;
  assert.throws(() => stage(badWeight, 'r'), (e) => e.code === 'invalid-angular-width');
  badWeight.getNode('b').data.$angularWidth = Number.NaN;
  assert.throws(() => stage(badWeight, 'r'), (e) => e.code === 'invalid-angular-width');

  const ignored = loadTree(f20()).graph;
  ignored.getNode('n1').ignore = true;
  assert.throws(() => stage(ignored, 'n0'), (e) => e.code === 'unsupported-visibility-flag');

  const hidden = loadTree(f20()).graph;
  hidden.getAdjacence('n0', 'n1')._hiding = true;
  assert.throws(() => stage(hidden, 'n0'), (e) => e.code === 'unsupported-visibility-flag');

  const disconnected = new Graph();
  disconnected.addNode({ id: 'r', name: 'R', kind: 'folder', data: { $angularWidth: 1 } });
  disconnected.addNode({ id: 'x', name: 'X', kind: 'file', data: { $angularWidth: 1 } });
  assert.throws(() => stage(disconnected, 'r'), (e) => e.code === 'unreachable-node');
  assert.throws(() => stage(disconnected, 'missing'), (e) => e.code === 'invalid-root');
  assert.throws(
    () => computeAngularWidths(loadTree(f20()).graph, { rootId: 'n0', nodeOptions: { overridable: true }, limits: { maxDepth: 2 } }),
    (e) => e.code === 'depth-limit'
  );

  const cyclic = new Graph();
  for (const id of ['a', 'b', 'c']) cyclic.addNode({ id, name: id, kind: 'folder', data: { $angularWidth: 1 } });
  cyclic.addAdjacence(cyclic.getNode('a'), cyclic.getNode('b'));
  cyclic.addAdjacence(cyclic.getNode('b'), cyclic.getNode('c'));
  cyclic.addAdjacence(cyclic.getNode('c'), cyclic.getNode('a'));
  assert.throws(() => stage(cyclic, 'a'), (e) => e.code === 'invalid-topology');

  const overflow = loadTree(unequal()).graph;
  overflow.getNode('a').data.$angularWidth = Number.MAX_VALUE;
  overflow.getNode('b').data.$angularWidth = Number.MAX_VALUE;
  assert.throws(() => stage(overflow, 'r'), (e) => e.code === 'numeric-overflow');
});

test('success and failure leave all live state and identities unchanged', () => {
  const { graph } = loadTree(f20());
  for (const [i, node] of [...graph.nodes.values()].entries()) {
    node._depth = 100 + i;
    node._flag = i % 2 === 0;
    node.pos.setc(i, i + 1);
    node.startPos.setc(i + 2, i + 3);
    node.endPos.setc(i + 4, i + 5);
    node.data.$span = i;
    node.data['$dim-quotient'] = i / 10;
    node.angleSpan = { begin: i, end: i + 1 };
    node.scale = 42 + i;
    node._angularWidth = 7 + i;
    node._treeAngularWidth = 8 + i;
  }
  const snapshots = [...graph.nodes.values()].map((node) => ({
    node,
    depth: node._depth,
    flag: node._flag,
    pos: node.pos,
    posValues: [node.pos.rho, node.pos.theta],
    start: node.startPos,
    startValues: [node.startPos.rho, node.startPos.theta],
    end: node.endPos,
    endValues: [node.endPos.rho, node.endPos.theta],
    span: node.data.$span,
    angularData: node.data.$angularWidth,
    dimData: node.data.$dim,
    quotient: node.data['$dim-quotient'],
    angleSpan: { ...node.angleSpan },
    scale: node.scale,
    angular: node._angularWidth,
    tree: node._treeAngularWidth
  }));

  const result = stage(graph, 'n0');
  assert.equal(result.nodeCount, 20);
  snapshots.forEach(assertUnchanged);

  graph.getNode('n2').data.$angularWidth = 0;
  snapshots.find((s) => s.node.id === 'n2').angularData = 0;
  assert.throws(() => stage(graph, 'n0'), (e) => e.code === 'invalid-angular-width');
  snapshots.forEach(assertUnchanged);
});




