import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  computeRadialLayout,
  stageRadialLayout,
  LayoutContractError
} from '../../../src/engine/hypertree/layout/index.js';
import { __setCommitFailureHookForTests } from '../../../src/engine/hypertree/layout/commit.js';
import { f20, f200, singleRoot } from './fixtures.mjs';
import { legacyRadialLayout } from './legacy-layout-oracle.mjs';

const THETA_TOL = 1e-12;
const RHO_ABS = 1e-9;
const RHO_REL = 1e-12;
const SPAN_ABS = 1e-12;
const SPAN_REL = 1e-12;

function close(actual, expected, absTol, relTol, label) {
  const allowed = absTol + relTol * Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= allowed, `${label}: ${actual} vs ${expected}`);
}

function thetaDistance(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function cartesian(theta, rho) {
  return { x: Math.cos(theta) * rho, y: Math.sin(theta) * rho };
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function storeEntries(store) {
  return new Map(Object.entries(store));
}

function snapshot(graph) {
  return [...graph.nodes.values()].map((node) => ({
    node,
    depth: node._depth,
    flag: node._flag,
    angular: node._angularWidth,
    tree: node._treeAngularWidth,
    scale: node.scale,
    pos: node.pos,
    startPos: node.startPos,
    endPos: node.endPos,
    posValues: [node.pos.rho, node.pos.theta],
    startValues: [node.startPos.rho, node.startPos.theta],
    endValues: [node.endPos.rho, node.endPos.theta],
    data: node.data,
    startData: node.startData,
    endData: node.endData,
    dataValues: storeEntries(node.data),
    startValuesData: storeEntries(node.startData),
    endValuesData: storeEntries(node.endData),
    angleSpan: node.angleSpan,
    angleSpanValues: { begin: node.angleSpan.begin, end: node.angleSpan.end }
  }));
}

function assertSnapshot(snaps) {
  for (const s of snaps) {
    const n = s.node;
    assert.equal(n._depth, s.depth);
    assert.equal(n._flag, s.flag);
    assert.equal(n._angularWidth, s.angular);
    assert.equal(n._treeAngularWidth, s.tree);
    assert.equal(n.scale, s.scale);
    assert.equal(n.pos, s.pos);
    assert.equal(n.startPos, s.startPos);
    assert.equal(n.endPos, s.endPos);
    assert.deepEqual([n.pos.rho, n.pos.theta], s.posValues);
    assert.deepEqual([n.startPos.rho, n.startPos.theta], s.startValues);
    assert.deepEqual([n.endPos.rho, n.endPos.theta], s.endValues);
    assert.equal(n.data, s.data);
    assert.equal(n.startData, s.startData);
    assert.equal(n.endData, s.endData);
    assert.deepEqual(storeEntries(n.data), s.dataValues);
    assert.deepEqual(storeEntries(n.startData), s.startValuesData);
    assert.deepEqual(storeEntries(n.endData), s.endValuesData);
    assert.equal(n.angleSpan, s.angleSpan);
    assert.deepEqual(n.angleSpan, s.angleSpanValues);
  }
}

function options(extra = {}) {
  return {
    rootId: 'n0',
    phases: ['current', 'start', 'end'],
    nodeOptions: { overridable: true },
    radius: 100,
    offset: 0.1,
    ...extra
  };
}

function assertApplied(graph, staged) {
  for (const [id, record] of staged.nodes) {
    const node = graph.getNode(id);
    assert.equal(node._depth, record.depth);
    assert.equal(node._angularWidth, record.angularWidth);
    assert.equal(node._treeAngularWidth, record.treeAngularWidth);
    assert.equal(node.scale, record.scale);
    assert.notEqual(node.angleSpan, record.angleSpan);
    assert.deepEqual(node.angleSpan, record.angleSpan);
    for (const phase of staged.phases) {
      const pos = phase === 'start' ? node.startPos : phase === 'end' ? node.endPos : node.pos;
      const store = phase === 'start' ? node.startData : phase === 'end' ? node.endData : node.data;
      const expectedPos = record.positions.get(phase);
      assert.equal(pos.theta, expectedPos.theta);
      assert.equal(pos.rho, expectedPos.rho);
      assert.equal(store.$span, record.spans.get(phase));
      if (id === staged.rootId) {
        assert.equal(record.dimQuotients, null);
      } else {
        assert.equal(store['$dim-quotient'], record.dimQuotients.get(phase));
      }
    }
  }
}

function assertLegacyParity(graph, legacy, phases) {
  assert.deepEqual([...graph.nodes.keys()], Object.keys(legacy.graph.nodes));
  for (const [id, node] of graph.nodes) {
    const old = legacy.nodes.get(id);
    assert.equal(node._depth, old.depth);
    assert.equal(node.scale, old.scale);
    assert.equal(hasOwn(node.data, '$dim-quotient'), old.hasDimQuotient.get(phases[0]));
    close(node.angleSpan.begin, old.angleSpan.begin, SPAN_ABS, SPAN_REL, `interval begin ${id}`);
    close(node.angleSpan.end, old.angleSpan.end, SPAN_ABS, SPAN_REL, `interval end ${id}`);
    for (const phase of phases) {
      const pos = phase === 'start' ? node.startPos : phase === 'end' ? node.endPos : node.pos;
      const store = phase === 'start' ? node.startData : phase === 'end' ? node.endData : node.data;
      const oldPos = old.positions.get(phase);
      assert.ok(thetaDistance(pos.theta, oldPos.theta) <= THETA_TOL, `theta ${id} ${phase}`);
      close(pos.rho, oldPos.rho, RHO_ABS, RHO_REL, `rho ${id} ${phase}`);
      const p = cartesian(pos.theta, pos.rho);
      const q = cartesian(oldPos.theta, oldPos.rho);
      close(p.x, q.x, RHO_ABS, RHO_REL, `x ${id} ${phase}`);
      close(p.y, q.y, RHO_ABS, RHO_REL, `y ${id} ${phase}`);
      close(store.$span, old.spans.get(phase), SPAN_ABS, SPAN_REL, `span ${id} ${phase}`);
      if (id === 'n0') {
        assert.equal(hasOwn(store, '$dim-quotient'), false);
      } else {
        close(store['$dim-quotient'], old.dimQuotients.get(phase), SPAN_ABS, SPAN_REL, `quotient ${id} ${phase}`);
      }
    }
  }
}

test('F20/F200 commit matches staged values and actual legacy radial arithmetic', () => {
  for (const [tree, rootId] of [[f20(), 'n0'], [f200(), 'n0']]) {
    const { graph } = loadTree(tree);
    const refs = new Map([...graph.nodes].map(([id, node]) => [id, {
      pos: node.pos,
      startPos: node.startPos,
      endPos: node.endPos,
      data: node.data,
      startData: node.startData,
      endData: node.endData
    }]));
    const staged = stageRadialLayout(graph, options());
    const result = computeRadialLayout(graph, options());
    assertApplied(graph, staged);
    for (const [id, ref] of refs) {
      const node = graph.getNode(id);
      assert.equal(node.pos, ref.pos);
      assert.equal(node.startPos, ref.startPos);
      assert.equal(node.endPos, ref.endPos);
      assert.equal(node.data, ref.data);
      assert.equal(node.startData, ref.startData);
      assert.equal(node.endData, ref.endData);
    }
    assert.equal(result.rootId, staged.rootId);
    const legacy = legacyRadialLayout(tree, rootId, {
      radius: 100,
      offset: 0.1,
      phases: ['current', 'start', 'end']
    });
    assertLegacyParity(graph, legacy, ['current', 'start', 'end']);
  }
});

test('single root and root dim-quotient no-write/no-delete', () => {
  const { graph } = loadTree(singleRoot());
  const root = graph.getNode('n0');
  root.data['$dim-quotient'] = 123;
  const pos = root.pos;
  const data = root.data;
  const result = computeRadialLayout(graph, options({ rootId: 'n0', offset: 0 }));
  assert.equal(result.nodes.get('n0').dimQuotients, null);
  assert.equal(root.pos, pos);
  assert.equal(root.data, data);
  assert.equal(root.data['$dim-quotient'], 123);
  assert.equal(root.pos.rho, 0);
  assert.equal(root.pos.theta, 0);
});

test('selected phase updates preserve identities and unselected phase state', () => {
  const { graph } = loadTree(f20());
  const n = graph.getNode('n2');
  n.startPos.setc(3, 4);
  n.endPos.setc(5, 6);
  n.startData.$span = 'start-sentinel';
  n.endData.$span = 'end-sentinel';
  n.startData['$dim-quotient'] = 'start-q';
  n.endData['$dim-quotient'] = 'end-q';
  const startPos = n.startPos;
  const endPos = n.endPos;
  const startData = n.startData;
  const endData = n.endData;
  const currentPos = n.pos;
  const currentData = n.data;

  computeRadialLayout(graph, options({ phases: ['current'] }));
  assert.equal(n.pos, currentPos);
  assert.equal(n.data, currentData);
  assert.equal(n.startPos, startPos);
  assert.equal(n.endPos, endPos);
  assert.equal(n.startData, startData);
  assert.equal(n.endData, endData);
  assert.deepEqual([n.startPos.rho, n.startPos.theta], [5, Math.atan2(4, 3)]);
  assert.deepEqual([n.endPos.rho, n.endPos.theta], [Math.sqrt(61), Math.atan2(6, 5)]);
  assert.equal(n.startData.$span, 'start-sentinel');
  assert.equal(n.endData.$span, 'end-sentinel');
  assert.equal(n.startData['$dim-quotient'], 'start-q');
  assert.equal(n.endData['$dim-quotient'], 'end-q');
});

test('current-only, end-only, and all-phase commits work and are repeatable', () => {
  for (const phases of [['current'], ['end'], ['current', 'start', 'end']]) {
    const { graph } = loadTree(f20());
    const first = computeRadialLayout(graph, options({ phases }));
    const firstValues = [...graph.nodes.values()].map((n) => [
      n._depth,
      n.pos.rho,
      n.pos.theta,
      n.endPos.rho,
      n.data.$span,
      n.endData.$span
    ]);
    const second = computeRadialLayout(graph, options({ phases }));
    const secondValues = [...graph.nodes.values()].map((n) => [
      n._depth,
      n.pos.rho,
      n.pos.theta,
      n.endPos.rho,
      n.data.$span,
      n.endData.$span
    ]);
    assert.deepEqual(secondValues, firstValues);
    assert.deepEqual(second.phases, first.phases);
  }
});

test('failure hook after staging/preflight leaves every live value and identity unchanged', () => {
  const { graph } = loadTree(f20());
  for (const [i, node] of [...graph.nodes.values()].entries()) node._flag = i % 2 === 0;
  const before = snapshot(graph);
  __setCommitFailureHookForTests(() => { throw new Error('injected-before-apply'); });
  try {
    assert.throws(
      () => computeRadialLayout(graph, options()),
      (error) => error.message === 'injected-before-apply'
    );
  } finally {
    __setCommitFailureHookForTests(null);
  }
  assertSnapshot(before);
});

test('late non-writable position component is rejected before any write', () => {
  const { graph } = loadTree(f20());
  const last = graph.getNode('n19');
  const descriptor = Object.getOwnPropertyDescriptor(last.pos, 'theta');
  Object.defineProperty(last.pos, 'theta', {
    ...descriptor,
    writable: false
  });
  const before = snapshot(graph);
  assert.throws(
    () => computeRadialLayout(graph, options()),
    (error) => error.code === 'unsupported-target'
  );
  assertSnapshot(before);
});

test('late frozen phase store is rejected before any write', () => {
  const { graph } = loadTree(f20());
  Object.freeze(graph.getNode('n19').endData);
  const before = snapshot(graph);
  assert.throws(
    () => computeRadialLayout(graph, options()),
    (error) => error.code === 'unsupported-target'
  );
  assertSnapshot(before);
});

test('inherited non-writable phase-store property is rejected before any write', () => {
  const { graph } = loadTree(f20());
  const child = graph.getNode('n19');
  const proto = Object.create(null);
  Object.defineProperty(proto, '$span', {
    configurable: true,
    enumerable: true,
    writable: false,
    value: 'inherited'
  });
  Object.setPrototypeOf(child.endData, proto);
  const before = snapshot(graph);
  assert.throws(
    () => computeRadialLayout(graph, options({ phases: ['end'] })),
    (error) => error.code === 'unsupported-target'
  );
  assertSnapshot(before);
});

test('inherited phase-store setters are rejected without invocation', () => {
  const { graph } = loadTree(f20());
  const child = graph.getNode('n19');
  let spanSets = 0;
  let quotientSets = 0;
  const spanProto = Object.create(null);
  Object.defineProperty(spanProto, '$span', {
    configurable: true,
    enumerable: true,
    get() { return 0; },
    set() { spanSets += 1; }
  });
  Object.setPrototypeOf(child.endData, spanProto);
  const beforeSpan = snapshot(graph);
  assert.throws(
    () => computeRadialLayout(graph, options({ phases: ['end'] })),
    (error) => error.code === 'unsupported-target'
  );
  assert.equal(spanSets, 0);
  assertSnapshot(beforeSpan);

  const { graph: second } = loadTree(f20());
  const secondChild = second.getNode('n19');
  const quotientProto = Object.create(null);
  Object.defineProperty(quotientProto, '$dim-quotient', {
    configurable: true,
    enumerable: true,
    get() { return 0; },
    set() { quotientSets += 1; }
  });
  Object.setPrototypeOf(secondChild.endData, quotientProto);
  const beforeQuotient = snapshot(second);
  assert.throws(
    () => computeRadialLayout(second, options({ phases: ['end'] })),
    (error) => error.code === 'unsupported-target'
  );
  assert.equal(quotientSets, 0);
  assertSnapshot(beforeQuotient);
});

test('missing node output slot with conflicting inherited descriptor is rejected', () => {
  const { graph } = loadTree(f20());
  const child = graph.getNode('n19');
  const proto = Object.create(Object.getPrototypeOf(child));
  Object.defineProperty(proto, 'scale', {
    configurable: true,
    enumerable: true,
    writable: false,
    value: 77
  });
  Object.setPrototypeOf(child, proto);
  const before = snapshot(graph);
  assert.throws(
    () => computeRadialLayout(graph, options()),
    (error) => error.code === 'unsupported-target'
  );
  assertSnapshot(before);
  assert.equal(Object.getOwnPropertyDescriptor(child, 'scale'), undefined);
});

test('unsupported position class and accessor-backed data are rejected', () => {
  const { graph } = loadTree(f20());
  graph.getNode('n19').pos = { theta: 0, rho: 0 };
  const before = snapshot(graph);
  assert.throws(
    () => computeRadialLayout(graph, options()),
    (error) => error.code === 'unsupported-position'
  );
  assertSnapshot(before);

  const second = loadTree(f20()).graph;
  const last = second.getNode('n19');
  Object.defineProperty(last.data, '$span', {
    configurable: true,
    enumerable: true,
    get() { return 0; },
    set() {}
  });
  const beforeAccessor = snapshot(second);
  assert.throws(
    () => computeRadialLayout(second, options()),
    (error) => error.code === 'unsupported-target'
  );
  assertSnapshot(beforeAccessor);
});

test('invalid numerical input leaves graph/live state unchanged', () => {
  const { graph } = loadTree(f20());
  graph.getNode('n2').data.$dim = Number.NaN;
  const before = snapshot(graph);
  assert.throws(
    () => computeRadialLayout(graph, options()),
    (error) => error.code === 'invalid-dim'
  );
  assertSnapshot(before);
});

test('true/false _flag values survive success and failure', () => {
  const { graph } = loadTree(f20());
  const flags = new Map();
  for (const [i, node] of [...graph.nodes.values()].entries()) {
    node._flag = i % 2 === 0;
    flags.set(node.id, node._flag);
  }
  computeRadialLayout(graph, options());
  for (const [id, flag] of flags) assert.equal(graph.getNode(id)._flag, flag);

  for (const [id, flag] of flags) assert.equal(graph.getNode(id)._flag, flag);
  const before = snapshot(graph);
  __setCommitFailureHookForTests(() => { throw new Error('injected'); });
  try {
    assert.throws(() => computeRadialLayout(graph, options()));
  } finally {
    __setCommitFailureHookForTests(null);
  }
  assertSnapshot(before);
  for (const [id, flag] of flags) assert.equal(graph.getNode(id)._flag, flag);
});

test('LayoutContractError is public and computeRadialLayout is the only index export', () => {
  assert.equal(typeof computeRadialLayout, 'function');
  assert.equal(typeof LayoutContractError, 'function');
  try {
    computeRadialLayout(loadTree(singleRoot()).graph, { rootId: 'n0', radius: 'auto' });
    assert.fail('expected throw');
  } catch (error) {
    assert.ok(error instanceof LayoutContractError);
    assert.equal(error.code, 'invalid-radius');
  }
});
