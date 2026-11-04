import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree, LIMITS, TreeLoadError } from '../../../src/engine/hypertree/data/index.js';
import { Graph } from '../../../src/engine/hypertree/graph/index.js';
import { Polar } from '../../../src/engine/hypertree/math/index.js';
import { Complex } from '../../../src/engine/hypertree/math/index.js';
import {
  Legacy,
  buildLegacyTree,
  legacyNodeIds,
  legacyEdgePairs,
  legacySetPolar,
  legacyGetPolar,
  legacyBfsIds,
  legacySubnodeIds,
  legacyParentIds,
  legacyClosestId
} from './legacy-graph-reference.mjs';

/** @param {string} id @param {string} kind @param {object[]} [children] @param {object} [data] */
function node(id, kind, children, data) {
  const value = { id, name: id.toUpperCase(), kind };
  if (children !== undefined) value.children = children;
  if (data !== undefined) value.data = data;
  return value;
}

/** @returns {object} */
function sampleTree() {
  return node('root', 'folder', [
    node('alpha', 'file'),
    node('beta', 'folder', [
      node('gamma', 'file'),
      node('delta', 'file')
    ]),
    node('epsilon', 'file')
  ]);
}

function ids(graph) {
  return [...graph.nodes.keys()];
}

function edges(graph) {
  const out = new Set();
  for (const [from, row] of graph.edges) {
    for (const to of row.keys()) out.add([from, to].sort().join('|'));
  }
  return [...out].sort();
}

function collectLevel(node, begin, end, flags) {
  const out = [];
  node.eachLevel(begin, end, (current) => { out.push(current.id); }, flags);
  return out;
}

/** @param {number} seed */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('loads a small rooted tree deterministically', () => {
  const { graph, rootId } = loadTree(sampleTree());
  assert.equal(rootId, 'root');
  assert.deepEqual(ids(graph), ['root', 'alpha', 'beta', 'gamma', 'delta', 'epsilon']);
  assert.deepEqual(edges(graph), [
    'alpha|root', 'beta|delta', 'beta|gamma', 'beta|root', 'epsilon|root'
  ]);
  assert.equal(graph.getNode('gamma').kind, 'file');
  assert.equal(graph.getNode('missing'), false);
  assert.equal(graph.get('root'), graph.getNode('root'));
  assert.equal(graph.getByName('BETA'), graph.getNode('beta'));
});

test('empty and single-root contract', () => {
  assert.throws(() => loadTree(null), TreeLoadError);
  assert.throws(() => loadTree({}), TreeLoadError);
  const single = loadTree(node('only', 'file'));
  assert.equal(single.rootId, 'only');
  assert.deepEqual(ids(single.graph), ['only']);
  assert.equal(single.graph.getNode('only').adjacencies.size, 0);
  assert.throws(() => loadTree([]), (error) => error.code === 'unsupported-graph');
});

test('IDs are strings and prototype-like IDs are safe', () => {
  const tree = node('__proto__', 'folder', [
    node('constructor', 'file'),
    node('toString', 'file')
  ], JSON.parse('{"__proto__":{"safe":true},"constructor":"c","toString":"t"}'));
  const { graph } = loadTree(tree);
  assert.deepEqual(ids(graph), ['__proto__', 'constructor', 'toString']);
  assert.equal(graph.getNode('__proto__').id, '__proto__');
  assert.equal(graph.getNode('constructor').id, 'constructor');
  const data = graph.getNode('__proto__').data;
  assert.equal(Object.getPrototypeOf(data), null);
  assert.equal(data.__proto__.safe, true);
  assert.equal(({}).safe, undefined);
  assert.throws(() => loadTree({ id: 1, name: 'N', kind: 'file' }), (error) => error.code === 'invalid-id');
});

test('duplicate IDs and cycles are rejected before replacement', () => {
  const target = new Graph();
  target.addNode({ id: 'old', name: 'Old', kind: 'file' });
  const duplicate = node('root', 'folder', [
    node('same', 'file'),
    node('same', 'file')
  ]);
  assert.throws(() => loadTree(duplicate, { targetGraph: target }), (error) => error.code === 'duplicate-id');
  assert.deepEqual(ids(target), ['old']);

  const repeated = node('root', 'file');
  const repeatedTree = node('root', 'folder', [repeated, repeated]);
  assert.throws(() => loadTree(repeatedTree), (error) => error.code === 'duplicate-id' || error.code === 'cycle');

  const root = node('root', 'folder', []);
  root.children.push(root);
  assert.throws(() => loadTree(root), (error) => error.code === 'cycle');
});

test('malformed node/children/metadata are rejected', () => {
  assert.throws(() => loadTree({ id: 'root', name: 1, kind: 'file' }), (error) => error.code === 'invalid-name');
  assert.throws(() => loadTree({ id: 'root', name: 'R', kind: 'other' }), (error) => error.code === 'invalid-kind');
  assert.throws(() => loadTree({ id: 'root', name: 'R', kind: 'folder', children: 'x' }), (error) => error.code === 'invalid-children');
  assert.throws(() => loadTree({ id: 'root', name: 'R', kind: 'file', children: [node('a', 'file')] }), (error) => error.code === 'file-children');
  assert.throws(() => loadTree({ id: 'root', name: 'R', kind: 'file', extra: true }), (error) => error.code === 'unknown-field');
  assert.throws(() => loadTree({ id: 'root', name: 'R', kind: 'file', data: { bad: undefined } }), (error) => error.code === 'metadata-invalid');
  assert.throws(() => loadTree({ id: 'root', name: 'R', kind: 'file', data: { bad: Infinity } }), (error) => error.code === 'metadata-invalid');
  assert.throws(() => loadTree({ id: 'root', name: 'R', kind: 'file', data: { bad: () => 1 } }), (error) => error.code === 'metadata-invalid');
  assert.throws(() => loadTree({ id: 'root', name: 'R', kind: 'file', data: new Date() }), (error) => error.code === 'invalid-node');
});

test('resource limits are explicit', () => {
  const chain = node('n0', 'folder');
  let current = chain;
  for (let i = 1; i < 4; i += 1) {
    const child = node(`n${i}`, 'folder');
    current.children = [child];
    current = child;
  }
  assert.throws(() => loadTree(chain, { limits: { maxNodes: 3 } }), (error) => error.code === 'node-limit');
  assert.throws(() => loadTree(chain, { limits: { maxDepth: 1 } }), (error) => error.code === 'depth-limit');

  const wide = node('root', 'folder', Array.from({ length: 3 }, (_, i) => node(`w${i}`, 'file')));
  assert.throws(() => loadTree(wide, { limits: { maxChildren: 2 } }), (error) => error.code === 'children-limit');

  const meta = { a: { b: { c: { d: { e: {} } } } } };
  assert.throws(() => loadTree(node('root', 'file', undefined, meta), { limits: { maxMetadataDepth: 2 } }), (error) => error.code === 'metadata-depth');
  assert.throws(() => loadTree(node('root', 'file', undefined, { long: 'x'.repeat(20) }), { limits: { maxMetadataString: 5 } }), (error) => error.code === 'metadata-too-large');
  assert.throws(() => loadTree(node('root', 'file', undefined, { a: 1, b: 2, c: 3 }), { limits: { maxMetadataKeys: 2 } }), (error) => error.code === 'metadata-too-large');
  assert.equal(LIMITS.maxNodes > 0, true);
});

test('loader does not retain caller metadata or mutate input', () => {
  const data = { nested: { value: 1 }, '$dim': 10 };
  const tree = node('root', 'file', undefined, data);
  const snapshot = JSON.stringify(tree);
  const { graph } = loadTree(tree);
  assert.equal(JSON.stringify(tree), snapshot);
  data.nested.value = 99;
  assert.equal(graph.getNode('root').data.nested.value, 1);
  assert.equal(graph.getNode('root').getData('dim'), 10);
  assert.equal(Object.getPrototypeOf(graph.getNode('root').data), null);
});

test('failed load leaves an existing target graph unchanged', () => {
  const target = new Graph();
  target.addNode({ id: 'valid', name: 'Valid', kind: 'file' });
  target.addNode({ id: 'other', name: 'Other', kind: 'file' });
  const before = ids(target);
  const bad = node('root', 'folder', [node('a', 'file'), node('a', 'file')]);
  assert.throws(() => loadTree(bad, { targetGraph: target }), (error) => error.code === 'duplicate-id');
  assert.deepEqual(ids(target), before);
  assert.equal(target.getNode('root'), false);

  const good = loadTree(sampleTree(), { targetGraph: target });
  assert.equal(good.graph, target);
  assert.deepEqual(ids(target), ['root', 'alpha', 'beta', 'gamma', 'delta', 'epsilon']);
});

test('current/start/end position objects are independent', () => {
  const { graph } = loadTree(node('root', 'file'));
  const n = graph.getNode('root');
  n.setPos(new Polar(0.1, 0.2), 'current');
  n.setPos(new Polar(0.3, 0.4), 'start');
  n.setPos(new Polar(0.5, 0.6), 'end');
  assert.notEqual(n.pos, n.startPos);
  assert.notEqual(n.pos, n.endPos);
  assert.deepEqual([n.pos.theta, n.pos.rho], [0.1, 0.2]);
  assert.deepEqual([n.startPos.theta, n.startPos.rho], [0.3, 0.4]);
  assert.deepEqual([n.endPos.theta, n.endPos.rho], [0.5, 0.6]);
  assert.equal(n.getPos('current'), n.pos);
  assert.equal(n.getPos('start'), n.startPos);
  assert.equal(n.getPos('end'), n.endPos);
});

test('legacy comparison: node/edge sets, levels, BFS, children and parents', () => {
  const tree = sampleTree();
  const { graph } = loadTree(tree);
  const legacy = buildLegacyTree(tree);
  graph.computeLevels('root');
  legacy.computeLevels('root');

  assert.deepEqual(ids(graph), [...legacyNodeIds(legacy)]);
  assert.deepEqual(edges(graph), [...legacyEdgePairs(legacy)]);
  assert.deepEqual(ids(graph).map((id) => graph.getNode(id)._depth), [...legacyNodeIds(legacy)].map((id) => legacy.getNode(id)._depth));

  const modernBfs = [];
  graph.eachBFS('root', (n) => modernBfs.push(n.id));
  assert.deepEqual(modernBfs, [...legacyBfsIds(legacy, 'root')]);
  assert.deepEqual([...graph.getNode('root').adjacencies.keys()], [...legacySubnodeIds(legacy, 'root')]);
  assert.deepEqual(graph.getNode('gamma').getParents().map((n) => n.id), [...legacyParentIds(legacy, 'gamma')]);
  assert.deepEqual(collectLevel(graph.getNode('root'), 0, false), collectLevel(legacy.getNode('root'), 0, false));
  assert.deepEqual(graph.getNode('beta').getSubnodes(1).map((n) => n.id), [...legacy.getNode('beta').getSubnodes(1)].map((n) => n.id));
  assert.equal(graph.getNode('gamma').isDescendantOf('root'), true);
  assert.equal(graph.getNode('root').isDescendantOf('gamma'), false);
});

test('legacy comparison: positions and closest-node non-tied/tie policy', () => {
  const tree = node('root', 'folder', [
    node('a', 'file'),
    node('b', 'file'),
    node('c', 'file')
  ]);
  const { graph } = loadTree(tree);
  const legacy = buildLegacyTree(tree);
  const positions = [
    ['a', 0, 0.1],
    ['b', Math.PI / 2, 0.2],
    ['c', Math.PI, 0.3]
  ];
  for (const [id, theta, rho] of positions) {
    graph.getNode(id).setPos(new Polar(theta, rho));
    legacySetPolar(legacy, id, 'current', theta, rho);
    assert.deepEqual(legacyGetPolar(legacy, id, 'current'), { theta, rho });
  }
  assert.equal(graph.getClosestNodeToPos(new Polar(0, 0.1)).id, legacyClosestId(legacy, new Legacy.Polar(0, 0.1)));

  // Tie policy: first node in Map insertion order wins (strict <).
  const tie = node('root', 'folder', [node('first', 'file'), node('second', 'file')]);
  const { graph: tied } = loadTree(tie);
  tied.getNode('first').setPos(new Polar(0, 0.5));
  tied.getNode('second').setPos(new Polar(0, 0.5));
  assert.equal(tied.getClosestNodeToPos(new Polar(0, 0.5)).id, 'first');
});

test('fixed-seed legacy tree parity', () => {
  const random = mulberry32(0x5eed1234);
  const root = node('root', 'folder', []);
  const folders = [root];
  for (let i = 0; i < 80; i += 1) {
    const parent = folders[Math.floor(random() * folders.length)];
    const isFolder = i % 7 === 0 || random() < 0.2;
    const child = node(`n${i}`, isFolder ? 'folder' : 'file', isFolder ? [] : undefined);
    if (!parent.children) parent.children = [];
    parent.children.push(child);
    if (isFolder) folders.push(child);
  }

  const { graph } = loadTree(root);
  const legacy = buildLegacyTree(root);
  graph.computeLevels('root');
  legacy.computeLevels('root');
  assert.deepEqual(ids(graph), [...legacyNodeIds(legacy)]);
  assert.deepEqual(edges(graph), [...legacyEdgePairs(legacy)]);
  assert.deepEqual(ids(graph).map((id) => graph.getNode(id)._depth), [...legacyNodeIds(legacy)].map((id) => legacy.getNode(id)._depth));

  const modernBfs = [];
  graph.eachBFS('root', (n) => modernBfs.push(n.id));
  assert.deepEqual(modernBfs, [...legacyBfsIds(legacy, 'root')]);

  for (const nodeId of ids(graph)) {
    const theta = random() * Math.PI * 2;
    const rho = random() * 0.9;
    graph.getNode(nodeId).setPos(new Polar(theta, rho));
    legacySetPolar(legacy, nodeId, 'current', theta, rho);
  }
  for (let i = 0; i < 20; i += 1) {
    const target = new Polar(random() * Math.PI * 2, random() * 0.9);
    assert.equal(graph.getClosestNodeToPos(target).id, legacyClosestId(legacy, new Legacy.Polar(target.theta, target.rho)));
  }
});

test('accessors and malformed arrays are rejected without invoking getters', () => {
  const target = new Graph();
  target.addNode({ id: 'old', name: 'Old', kind: 'file' });

  let idReads = 0;
  const getterNode = { name: 'R', kind: 'file' };
  Object.defineProperty(getterNode, 'id', {
    enumerable: false,
    get() { idReads += 1; return 'r'; }
  });
  assert.throws(() => loadTree(getterNode, { targetGraph: target }), (error) => error.code === 'accessor' || error.code === 'non-enumerable');
  assert.equal(idReads, 0);
  assert.deepEqual(ids(target), ['old']);

  let childReads = 0;
  const children = [];
  Object.defineProperty(children, '0', {
    enumerable: true,
    configurable: true,
    get() { childReads += 1; return { id: 'a', name: 'A', kind: 'file' }; }
  });
  children.length = 1;
  const getterChild = { id: 'r', name: 'R', kind: 'folder', children };
  assert.throws(() => loadTree(getterChild, { targetGraph: target }), (error) => error.code === 'accessor');
  assert.equal(childReads, 0);
  assert.deepEqual(ids(target), ['old']);

  const hidden = {};
  Object.defineProperty(hidden, 'id', { value: 'r', enumerable: false });
  Object.defineProperty(hidden, 'name', { value: 'R', enumerable: true });
  Object.defineProperty(hidden, 'kind', { value: 'file', enumerable: true });
  assert.throws(() => loadTree(hidden, { targetGraph: target }), (error) => error.code === 'non-enumerable');
  assert.deepEqual(ids(target), ['old']);

  const symbolNode = { id: 'r', name: 'R', kind: 'file', [Symbol('x')]: true };
  assert.throws(() => loadTree(symbolNode), (error) => error.code === 'invalid-node');

  const extra = { id: 'r', name: 'R', kind: 'folder', children: [] };
  extra.children.extra = true;
  assert.throws(() => loadTree(extra), (error) => error.code === 'invalid-children');

  const sparse = { id: 'r', name: 'R', kind: 'folder', children: new Array(1) };
  assert.throws(() => loadTree(sparse), (error) => error.code === 'invalid-children');

  const nonEnumIndex = { id: 'r', name: 'R', kind: 'folder', children: [] };
  nonEnumIndex.children.length = 1;
  Object.defineProperty(nonEnumIndex.children, '0', {
    value: { id: 'a', name: 'A', kind: 'file' },
    enumerable: false
  });
  assert.throws(() => loadTree(nonEnumIndex), (error) => error.code === 'non-enumerable');
});

test('target graph configuration is inherited or consistently replaced', () => {
  const target = new Graph({
    positionClass: Complex,
    nodeDefaults: { exist: true }
  });
  const loaded = loadTree({ id: 'r', name: 'R', kind: 'file' }, { targetGraph: target });
  assert.equal(target.positionClass, Complex);
  assert.equal(target.getNode('r').pos instanceof Complex, true);
  assert.equal(target.getNode('r').exist, true);
  const after = target.addNode({ id: 'next', name: 'Next', kind: 'file' });
  assert.equal(after.pos instanceof Complex, true);
  assert.equal(after.exist, true);
  assert.equal(loaded.graph, target);

  const explicit = new Graph({
    positionClass: Complex,
    nodeDefaults: { exist: true }
  });
  loadTree({ id: 'r', name: 'R', kind: 'file' }, {
    targetGraph: explicit,
    positionClass: Polar,
    nodeDefaults: { exist: false }
  });
  assert.equal(explicit.positionClass, Polar);
  assert.equal(explicit.getNode('r').pos instanceof Polar, true);
  assert.equal(explicit.getNode('r').exist, false);
  const explicitAfter = explicit.addNode({ id: 'next', name: 'Next', kind: 'file' });
  assert.equal(explicitAfter.pos instanceof Polar, true);
  assert.equal(explicitAfter.exist, false);

  const mutableDefaults = { exist: true };
  const snapshot = new Graph({ nodeDefaults: mutableDefaults });
  mutableDefaults.exist = false;
  assert.equal(snapshot.addNode({ id: 'x', name: 'X', kind: 'file' }).exist, true);

  const strict = new Graph({ metadataLimits: { maxMetadataKeys: 1 } });
  strict.addNode({ id: 'old', name: 'Old', kind: 'file' });
  assert.throws(
    () => loadTree({ id: 'r', name: 'R', kind: 'file', data: { a: 1, b: 2 } }, { targetGraph: strict }),
    (error) => error.code === 'metadata-too-large'
  );
  assert.deepEqual(ids(strict), ['old']);
});

test('legacy comparison: node flags and edge flags in level traversal', () => {
  const tree = node('r', 'folder', [node('a', 'folder', [node('b', 'file')])]);
  const { graph } = loadTree(tree);
  const legacy = buildLegacyTree(tree);
  graph.computeLevels('r');
  legacy.computeLevels('r');

  graph.getAdjacence('r', 'a').ignore = true;
  legacy.getAdjacence('r', 'a').ignore = true;
  assert.deepEqual(collectLevel(graph.getNode('r'), 0, false, 'ignore'), ['r', 'a', 'b']);
  assert.deepEqual(collectLevel(legacy.getNode('r'), 0, false, 'ignore'), ['r', 'a', 'b']);
  assert.deepEqual(collectLevel(graph.getNode('r'), 1, 1, 'ignore'), ['a']);
  assert.deepEqual(collectLevel(legacy.getNode('r'), 1, 1, 'ignore'), ['a']);
  const modernSubgraph = [];
  graph.getNode('r').eachSubgraph((n) => modernSubgraph.push(n.id), 'ignore');
  const legacySubgraph = [];
  legacy.getNode('r').eachSubgraph((n) => legacySubgraph.push(n.id), 'ignore');
  assert.deepEqual(modernSubgraph, ['r', 'a', 'b']);
  assert.deepEqual(legacySubgraph, ['r', 'a', 'b']);
  const modernSubnode = [];
  graph.getNode('r').eachSubnode((n) => modernSubnode.push(n.id), 'ignore');
  const legacySubnode = [];
  legacy.getNode('r').eachSubnode((n) => legacySubnode.push(n.id), 'ignore');
  assert.deepEqual(modernSubnode, ['a']);
  assert.deepEqual(legacySubnode, ['a']);

  graph.getAdjacence('r', 'a').ignore = false;
  legacy.getAdjacence('r', 'a').ignore = false;
  graph.getNode('a').ignore = true;
  legacy.getNode('a').ignore = true;
  assert.deepEqual(collectLevel(graph.getNode('r'), 0, false, 'ignore'), ['r', 'b']);
  assert.deepEqual(collectLevel(legacy.getNode('r'), 0, false, 'ignore'), ['r', 'b']);
  assert.deepEqual(collectLevel(graph.getNode('r'), 1, 1, 'ignore'), []);
  assert.deepEqual(collectLevel(legacy.getNode('r'), 1, 1, 'ignore'), []);

  // Direct adjacency iteration *does* honor edge flags, unlike eachLevel.
  graph.getNode('a').ignore = false;
  graph.getAdjacence('r', 'a').ignore = true;
  legacy.getAdjacence('r', 'a').ignore = true;
  const direct = [];
  graph.getNode('r').eachAdjacency((adj) => direct.push(adj.nodeTo.id), 'ignore');
  assert.deepEqual(direct, []);
  const legacyDirect = [];
  legacy.getNode('r').eachAdjacency((adj) => legacyDirect.push(adj.nodeTo.id), 'ignore');
  assert.deepEqual(legacyDirect, []);
});

test('integer-like IDs use insertion order intentionally', () => {
  const tree = node('root', 'folder', [
    node('10', 'file'),
    node('2', 'file'),
    node('1', 'file')
  ]);
  const { graph } = loadTree(tree);
  assert.deepEqual(ids(graph), ['root', '10', '2', '1']);
  const legacy = buildLegacyTree(tree);
  assert.deepEqual([...legacyNodeIds(legacy)], ['1', '2', '10', 'root']);
  assert.notDeepEqual(ids(graph), [...legacyNodeIds(legacy)]);
});

test('deep chain and wide folder load without recursive tree traversal', () => {
  const depth = 10000;
  const root = node('n0', 'folder');
  let current = root;
  for (let i = 1; i < depth; i += 1) {
    const child = node(`n${i}`, 'folder');
    current.children = [child];
    current = child;
  }
  const { graph } = loadTree(root);
  assert.equal(graph.nodes.size, depth);
  graph.computeLevels('n0');
  assert.equal(graph.getNode(`n${depth - 1}`)._depth, depth - 1);
  let count = 0;
  graph.eachBFS('n0', () => { count += 1; });
  assert.equal(count, depth);

  const wide = node('wide', 'folder', Array.from({ length: 2000 }, (_, i) => node(`w${i}`, 'file')));
  const wideGraph = loadTree(wide).graph;
  assert.equal(wideGraph.nodes.size, 2001);
  assert.equal(wideGraph.getNode('wide').adjacencies.size, 2000);
});

test('filter flags are honored', () => {
  const tree = node('root', 'folder', [node('a', 'file'), node('b', 'file')]);
  const { graph } = loadTree(tree);
  graph.getNode('a').ignore = true;
  graph.computeLevels('root');
  const seen = [];
  graph.eachNode((n) => seen.push(n.id), 'ignore');
  assert.deepEqual(seen, ['root', 'b']);
  assert.deepEqual([...graph.getNode('root').adjacencies.keys()], ['a', 'b']);
  assert.deepEqual(collectLevel(graph.getNode('root'), 0, false, 'ignore'), ['root', 'b']);
});

test('graph mutation helpers preserve edge consistency', () => {
  const { graph } = loadTree(sampleTree());
  graph.computeLevels('root');
  assert.equal(graph.getAdjacence('root', 'alpha').nodeTo.id, 'alpha');
  graph.removeAdjacence('root', 'alpha');
  assert.equal(graph.getNode('root').adjacencies.has('alpha'), false);
  assert.equal(graph.getNode('alpha').adjacencies.has('root'), false);
  graph.removeNode('beta');
  assert.equal(graph.getNode('beta'), false);
  assert.equal(graph.getNode('gamma').adjacencies.has('beta'), false);
});

