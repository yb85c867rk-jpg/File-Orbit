import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  computeAngularWidths,
  computeLevelDistances,
  LayoutContractError
} from '../../../src/engine/hypertree/layout/index.js';
import { f20, f200, singleRoot, deepChain } from './fixtures.mjs';
import { legacyLevelDistances } from './legacy-layout-oracle.mjs';

const TOL = 1e-12;

/** @param {number} actual @param {number} expected @param {string} label */
function close(actual, expected, label) {
  const allowed = TOL + TOL * Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= allowed, `${label}: ${actual} vs ${expected}`);
}

/** @param {object} tree @param {string} [rootId] @param {object} [nodeOptions] */
function angular(tree, rootId = 'n0', nodeOptions = { overridable: true }) {
  const { graph } = loadTree(tree);
  return computeAngularWidths(graph, { rootId, nodeOptions });
}

/** @param {object} tree @param {string} rootId @param {number} radius @param {number} offset */
function parity(tree, rootId, radius, offset) {
  const angularResult = angular(tree, rootId);
  const modern = computeLevelDistances(angularResult, { radius, offset });
  const legacy = legacyLevelDistances(tree, rootId, { radius, offset });
  assert.equal(modern.distances.size, legacy.distances.size);
  for (const id of angularResult.depths.keys()) {
    close(modern.distances.get(id), legacy.distances.get(id), `distance ${id}`);
    assert.equal(modern.scales.get(id), radius);
    assert.equal(legacy.scales.get(id), radius);
  }
  return { angularResult, modern, legacy };
}

test('F20 and F200 distance/scale legacy parity', () => {
  const f20Result = parity(f20(), 'n0', 100, 0.1);
  assert.equal(f20Result.modern.maxDepth, 4);
  assert.equal(f20Result.modern.legacyDepth, 5);
  assert.equal(f20Result.modern.selection, 'loop');

  const f200Result = parity(f200(), 'n0', 250, 0.25);
  assert.equal(f200Result.modern.maxDepth, 4);
  assert.equal(f200Result.modern.legacyDepth, 5);

  for (const [radius, offset] of [[50, 0], [100, 0.25], [250, 0.1]]) {
    parity(f20(), 'n0', radius, offset);
  }
});

test('single root and shallow chains match actual legacy distance', () => {
  const single = parity(singleRoot(), 'n0', 100, 2);
  assert.equal(single.modern.placementDistances.size, 0);
  assert.ok(single.modern.distances.get('n0') < 0);
  assert.equal(single.modern.scales.get('n0'), 100);

  for (const depth of [1, 2, 3, 4, 5, 6, 10, 20]) {
    const tree = deepChain(depth);
    const result = parity(tree, 'd0', 120, 0);
    assert.equal(result.modern.maxDepth, depth - 1);
    assert.equal(result.modern.legacyDepth, depth);
  }
});

test('coefficient selection transitions and fallback', () => {
  const expected = new Map([
    [1, { coefficient: 0.75, selection: 'fallback' }],
    [2, { coefficient: 0.75, selection: 'fallback' }],
    [3, { coefficient: 0.61, selection: 'loop' }],
    [4, { coefficient: 0.54, selection: 'loop' }],
    [5, { coefficient: 0.51, selection: 'loop' }],
    [6, { coefficient: 0.5, selection: 'loop' }],
    [10, { coefficient: 0.5, selection: 'loop' }],
    [20, { coefficient: 0.5, selection: 'loop' }]
  ]);
  for (const [depth, want] of expected) {
    const result = computeLevelDistances(angular(deepChain(depth), 'd0'), { radius: 120, offset: 0 });
    close(result.coefficient, want.coefficient, `coefficient depth ${depth}`);
    assert.equal(result.selection, want.selection, `selection depth ${depth}`);
  }
});

test('radius changes scale, not normalized distance', () => {
  const tree = f20();
  const angularResult = angular(tree, 'n0');
  const a = computeLevelDistances(angularResult, { radius: 50, offset: 0 });
  const b = computeLevelDistances(angularResult, { radius: 500, offset: 0 });
  for (const id of angularResult.depths.keys()) {
    close(a.distances.get(id), b.distances.get(id), `distance ${id}`);
    assert.equal(a.scales.get(id), 50);
    assert.equal(b.scales.get(id), 500);
  }
});

test('radial-domain policy rejects invalid child-placement distances only', () => {
  const chain = angular(deepChain(2), 'd0');
  for (const offset of [0.75, 0.8, -0.3]) {
    assert.throws(
      () => computeLevelDistances(chain, { radius: 100, offset }),
      (error) => error.code === 'radial-domain',
      `offset ${offset}`
    );
  }

  const deep = angular(deepChain(3), 'd0');
  const outOfDiskLeaf = computeLevelDistances(deep, { radius: 100, offset: 0 });
  assert.ok(outOfDiskLeaf.distances.get('d2') > 1);
  assert.equal(outOfDiskLeaf.placementDistances.has('d2'), false);
  close(outOfDiskLeaf.placementDistances.get('d0'), outOfDiskLeaf.distances.get('d0'), 'root placement');
  close(outOfDiskLeaf.placementDistances.get('d1'), outOfDiskLeaf.distances.get('d1'), 'parent placement');

  const single = angular(singleRoot(), 'n0');
  const singleResult = computeLevelDistances(single, { radius: 100, offset: 2 });
  assert.ok(singleResult.distances.get('n0') < 0);
  assert.equal(singleResult.placementDistances.size, 0);
});

test('invalid radius, offset, depth, and result inputs are rejected', () => {
  const valid = angular(f20(), 'n0');
  for (const radius of ['auto', '100', 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => computeLevelDistances(valid, { radius, offset: 0 }),
      (error) => error.code === 'invalid-radius',
      `radius ${String(radius)}`
    );
  }
  for (const offset of ['auto', '0', null, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => computeLevelDistances(valid, { radius: 100, offset }),
      (error) => error.code === 'invalid-offset',
      `offset ${String(offset)}`
    );
  }
  assert.throws(() => computeLevelDistances(null, { radius: 100 }), (e) => e.code === 'invalid-angular-result');
  assert.throws(
    () => computeLevelDistances({ rootId: 'r', depths: new Map(), children: new Map() }, { radius: 100 }),
    (e) => e.code === 'invalid-depth'
  );
  assert.throws(
    () => computeLevelDistances({ rootId: 'r', depths: new Map([['r', 1]]), children: new Map() }, { radius: 100 }),
    (e) => e.code === 'invalid-depth'
  );
  assert.throws(
    () => computeLevelDistances({ rootId: 'r', depths: new Map([['r', 0], ['x', 1.5]]), children: new Map() }, { radius: 100 }),
    (e) => e.code === 'invalid-depth'
  );
  assert.throws(
    () => computeLevelDistances({ rootId: 'r', depths: new Map([['r', 0], ['x', 10001]]), children: new Map() }, { radius: 100 }),
    (e) => e.code === 'depth-limit'
  );
});

test('distance slicing does not mutate live graph or angular depth data', () => {
  const { graph } = loadTree(f20());
  const snapshots = [];
  for (const [i, node] of [...graph.nodes.values()].entries()) {
    node._depth = 90 + i;
    node._flag = i % 2 === 0;
    node.pos.setc(i, i + 1);
    node.data.$span = i;
    node._angularWidth = 3 + i;
    snapshots.push({
      node,
      depth: node._depth,
      flag: node._flag,
      rho: node.pos.rho,
      theta: node.pos.theta,
      span: node.data.$span,
      angular: node._angularWidth
    });
  }
  const angularResult = computeAngularWidths(graph, { rootId: 'n0', nodeOptions: { overridable: true } });
  const depthsBefore = new Map(angularResult.depths);
  const childrenBefore = new Map([...angularResult.children].map(([id, list]) => [id, [...list]]));
  computeLevelDistances(angularResult, { radius: 100, offset: 0.1 });
  for (const s of snapshots) {
    assert.equal(s.node._depth, s.depth);
    assert.equal(s.node._flag, s.flag);
    assert.deepEqual([s.node.pos.rho, s.node.pos.theta], [s.rho, s.theta]);
    assert.equal(s.node.data.$span, s.span);
    assert.equal(s.node._angularWidth, s.angular);
  }
  assert.deepEqual(angularResult.depths, depthsBefore);
  assert.deepEqual(angularResult.children, childrenBefore);
});

test('60-chain offset=0 precision boundary rejects at d53 without mutation or clamping', () => {
  const tree = deepChain(60);
  const { graph } = loadTree(tree);
  const angularResult = computeAngularWidths(graph, { rootId: 'd0', nodeOptions: { overridable: true } });
  const depthsBefore = new Map(angularResult.depths);
  const childrenBefore = new Map([...angularResult.children].map(([id, list]) => [id, [...list]]));

  const live = [];
  for (const [i, node] of [...graph.nodes.values()].entries()) {
    node._depth = 80 + i;
    node._flag = i % 2 === 0;
    node.pos.setc(i, i + 1);
    node.data.$span = i;
    node._angularWidth = 4 + i;
    live.push({
      node,
      depth: node._depth,
      flag: node._flag,
      rho: node.pos.rho,
      theta: node.pos.theta,
      span: node.data.$span,
      angular: node._angularWidth
    });
  }

  assert.throws(
    () => computeLevelDistances(angularResult, { radius: 100, offset: 0 }),
    (error) => error.code === 'radial-domain' && error.nodeId === 'd53'
  );

  assert.deepEqual(angularResult.depths, depthsBefore);
  assert.deepEqual(angularResult.children, childrenBefore);
  for (const s of live) {
    assert.equal(s.node._depth, s.depth);
    assert.equal(s.node._flag, s.flag);
    assert.deepEqual([s.node.pos.rho, s.node.pos.theta], [s.rho, s.theta]);
    assert.equal(s.node.data.$span, s.span);
    assert.equal(s.node._angularWidth, s.angular);
  }
});

test('10,000-chain offset=0.1 succeeds with finite open-disk placements', () => {
  const tree = deepChain(10000);
  const { graph } = loadTree(tree);
  const angularResult = computeAngularWidths(graph, { rootId: 'd0', nodeOptions: { overridable: true } });
  const depthsBefore = new Map(angularResult.depths);
  const childrenBefore = new Map([...angularResult.children].map(([id, list]) => [id, [...list]]));
  const root = graph.getNode('d0');
  root._depth = 123;
  root._flag = true;
  root.pos.setc(3, 4);
  const rootBefore = { depth: root._depth, flag: root._flag, rho: root.pos.rho, theta: root.pos.theta };

  const result = computeLevelDistances(angularResult, { radius: 100, offset: 0.1 });
  assert.equal(result.maxDepth, 9999);
  assert.equal(result.legacyDepth, 10000);
  assert.equal(result.distances.size, 10000);
  assert.equal(result.scales.size, 10000);
  assert.equal(result.placementDistances.size, 9999);
  assert.equal(result.placementDistances.has('d0'), true);
  assert.equal(result.placementDistances.has('d9999'), false);
  for (const value of result.placementDistances.values()) {
    assert.ok(Number.isFinite(value));
    assert.ok(value > 0 && value < 1);
  }
  assert.deepEqual(angularResult.depths, depthsBefore);
  assert.deepEqual(angularResult.children, childrenBefore);
  assert.equal(root._depth, rootBefore.depth);
  assert.equal(root._flag, rootBefore.flag);
  assert.deepEqual([root.pos.rho, root.pos.theta], [rootBefore.rho, rootBefore.theta]);
});

test('LayoutContractError is the public error type', () => {
  try {
    computeLevelDistances(angular(singleRoot(), 'n0'), { radius: 'auto' });
    assert.fail('expected throw');
  } catch (error) {
    assert.ok(error instanceof LayoutContractError);
    assert.equal(error.code, 'invalid-radius');
  }
});
