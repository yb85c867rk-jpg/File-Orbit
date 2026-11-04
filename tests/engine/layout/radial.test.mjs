import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  computeAngularWidths,
  stageRadialLayout,
  LayoutContractError
} from '../../../src/engine/hypertree/layout/index.js';
import { f20, f200, unequal, singleRoot, integerIds, wide, deepChain } from './fixtures.mjs';
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

function stageTree(tree, rootId, options) {
  const { graph } = loadTree(tree);
  return stageRadialLayout(graph, {
    rootId,
    phases: options.phases || ['current', 'start', 'end'],
    nodeOptions: options.nodeOptions || { overridable: true },
    radius: options.radius,
    offset: options.offset
  });
}

/** @param {object} modern @param {object} legacy @param {{skipQuotient?:boolean}} [opts] */
function compareRadial(modern, legacy, opts = {}) {
  assert.deepEqual([...modern.nodes.keys()], Object.keys(legacy.graph.nodes));
  for (const [id, record] of modern.nodes) {
    const old = legacy.nodes.get(id);
    assert.ok(old, `legacy node ${id}`);
    assert.equal(record.depth, old.depth, `depth ${id}`);
    assert.equal(record.scale, old.scale, `scale ${id}`);
    assert.equal(record.angleSpan.begin === 0, old.angleSpan.begin === 0, `interval begin ${id}`);
    for (const phase of modern.phases) {
      const p = record.positions.get(phase);
      const q = old.positions.get(phase);
      assert.ok(thetaDistance(p.theta, q.theta) <= THETA_TOL, `theta ${id} ${phase}`);
      close(p.rho, q.rho, RHO_ABS, RHO_REL, `rho ${id} ${phase}`);
      const pc = cartesian(p.theta, p.rho);
      const qc = cartesian(q.theta, q.rho);
      close(pc.x, qc.x, RHO_ABS, RHO_REL, `x ${id} ${phase}`);
      close(pc.y, qc.y, RHO_ABS, RHO_REL, `y ${id} ${phase}`);
      close(record.spans.get(phase), old.spans.get(phase), SPAN_ABS, SPAN_REL, `span ${id} ${phase}`);
      if (!opts.skipQuotient && id !== modern.rootId) {
        assert.equal(old.hasDimQuotient.get(phase), true, `legacy quotient write ${id} ${phase}`);
        close(record.dimQuotients.get(phase), old.dimQuotients.get(phase), SPAN_ABS, SPAN_REL, `quotient ${id} ${phase}`);
      }
    }
    close(record.angleSpan.begin, old.angleSpan.begin, SPAN_ABS, SPAN_REL, `interval begin ${id}`);
    close(record.angleSpan.end, old.angleSpan.end, SPAN_ABS, SPAN_REL, `interval end ${id}`);
  }
  const root = modern.nodes.get(modern.rootId);
  assert.equal(root.dimQuotients, null);
  for (const phase of modern.phases) {
    assert.equal(legacy.nodes.get(modern.rootId).hasDimQuotient.get(phase), false, `root quotient ${phase}`);
  }
}

test('F20/F200 full radial arithmetic parity', () => {
  for (const [tree, radius, offset] of [[f20(), 100, 0.1], [f200(), 250, 0.25]]) {
    const modern = stageTree(tree, 'n0', { radius, offset });
    const legacy = legacyRadialLayout(tree, 'n0', {
      radius,
      offset,
      phases: ['current', 'start', 'end']
    });
    compareRadial(modern, legacy);
  }
});

test('parent distance is used for child rho, not the child distance', () => {
  const tree = deepChain(3);
  const modern = stageTree(tree, 'd0', { radius: 100, offset: 0 });
  assert.equal(modern.nodes.get('d0').positions.get('current').rho, 0);
  for (const [child, parent] of [['d1', 'd0'], ['d2', 'd1']]) {
    close(
      modern.nodes.get(child).positions.get('current').rho,
      modern.placementDistances.get(parent),
      0,
      0,
      `${child} rho`
    );
    assert.notEqual(
      modern.nodes.get(child).positions.get('current').rho,
      modern.distances.get(child),
      `${child} must not use its own distance`
    );
  }
});

test('single root and unequal sibling dimensions/weights', () => {
  const singleTree = singleRoot();
  const single = stageTree(singleTree, 'n0', { radius: 100, offset: 0 });
  const singleLegacy = legacyRadialLayout(singleTree, 'n0', {
    radius: 100,
    offset: 0,
    phases: ['current', 'start', 'end']
  });
  compareRadial(single, singleLegacy);
  assert.equal(single.nodes.get('n0').positions.get('current').rho, 0);
  assert.equal(single.nodes.get('n0').dimQuotients, null);
  assert.equal(single.nodes.get('n0').spans.get('current'), Math.PI * 2);

  const tree = unequal();
  const modern = stageTree(tree, 'r', { radius: 100, offset: 0 });
  const legacy = legacyRadialLayout(tree, 'r', { radius: 100, offset: 0, phases: ['current', 'start', 'end'] });
  compareRadial(modern, legacy);
  const a = modern.nodes.get('a');
  const b = modern.nodes.get('b');
  const c = modern.nodes.get('c');
  assert.equal(a.dimQuotients.get('current'), 0.2);
  assert.equal(b.dimQuotients.get('current'), 1);
  assert.equal(c.dimQuotients.get('current'), 0.6);
  assert.ok(a.angleSpan.end <= b.angleSpan.begin);
  assert.ok(b.angleSpan.end <= c.angleSpan.begin);
});

test('zero dimensions use quotient 0; root dimension is not read', () => {
  const tree = unequal();
  const { graph } = loadTree(tree);
  for (const id of ['a', 'b', 'c']) graph.getNode(id).data.$dim = 0;
  const modern = stageRadialLayout(graph, {
    rootId: 'r',
    phases: ['current'],
    nodeOptions: { overridable: true },
    radius: 100,
    offset: 0
  });
  for (const id of ['a', 'b', 'c']) assert.equal(modern.nodes.get(id).dimQuotients.get('current'), 0);
  assert.equal(modern.nodes.get('r').dimQuotients, null);

  const legacyTree = unequal();
  const legacy = legacyRadialLayout(legacyTree, 'r', {
    radius: 100,
    offset: 0,
    phases: ['current'],
    beforeCompute: (g) => {
      for (const id of ['a', 'b', 'c']) g.getNode(id).data.$dim = 0;
    }
  });
  compareRadial(modern, legacy, { skipQuotient: true });
  for (const id of ['a', 'b', 'c']) assert.ok(Number.isNaN(legacy.nodes.get(id).dimQuotients.get('current')));

  const rootTree = unequal();
  const { graph: rootGraph } = loadTree(rootTree);
  rootGraph.getNode('r').data.$dim = Number.NaN;
  const rootStage = stageRadialLayout(rootGraph, {
    rootId: 'r',
    phases: ['current'],
    nodeOptions: { overridable: true },
    radius: 100,
    offset: 0
  });
  assert.equal(rootStage.nodes.get('r').dimQuotients, null);
  assert.ok(Number.isNaN(rootGraph.getNode('r').data.$dim));
});

test('invalid child dimensions are rejected before returning records', () => {
  const { graph } = loadTree(unequal());
  graph.getNode('b').data.$dim = Number.NaN;
  assert.throws(
    () => stageRadialLayout(graph, { rootId: 'r', nodeOptions: { overridable: true }, radius: 100, offset: 0 }),
    (error) => error.code === 'invalid-dim'
  );
  graph.getNode('b').data.$dim = -1;
  assert.throws(
    () => stageRadialLayout(graph, { rootId: 'r', nodeOptions: { overridable: true }, radius: 100, offset: 0 }),
    (error) => error.code === 'invalid-dim'
  );
});

test('phase-specific dimensions and selected phase subsets', () => {
  const tree = unequal();
  const { graph } = loadTree(tree);
  const b = graph.getNode('b');
  b.startData.$dim = 4;
  b.endData.$dim = 8;
  const modern = stageRadialLayout(graph, {
    rootId: 'r',
    phases: ['end'],
    nodeOptions: { overridable: true },
    radius: 100,
    offset: 0
  });
  assert.deepEqual(modern.phases, ['end']);
  assert.equal(modern.nodes.get('b').dimQuotients.get('end'), 1);
  assert.equal(modern.nodes.get('b').positions.has('current'), false);
  assert.equal(modern.nodes.get('b').spans.has('current'), false);
  const legacy = legacyRadialLayout(tree, 'r', {
    radius: 100,
    offset: 0,
    phases: ['end'],
    beforeCompute: (g) => {
      g.getNode('b').startData.$dim = 4;
      g.getNode('b').endData.$dim = 8;
    }
  });
  compareRadial(modern, legacy);
});

test('integer-like IDs follow modern insertion order', () => {
  const modern = stageTree(integerIds(), 'r', { radius: 100, offset: 0 });
  assert.deepEqual([...modern.nodes.keys()], ['r', '10', '2', '1']);
  const slices = ['10', '2', '1'].map((id) => modern.nodes.get(id).angleSpan);
  assert.ok(slices[0].begin < slices[0].end);
  assert.ok(slices[1].begin < slices[1].end);
  assert.ok(slices[2].begin < slices[2].end);
});

test('extreme allocation underflow is rejected explicitly', () => {
  const { graph } = loadTree(unequal());
  graph.getNode('b').data.$angularWidth = Number.MIN_VALUE;
  assert.throws(
    () => stageRadialLayout(graph, { rootId: 'r', nodeOptions: { overridable: true }, radius: 100, offset: 0 }),
    (error) => error.code === 'allocation-underflow'
  );
});

test('wide tree and deep valid-offset staged layout', () => {
  const broad = stageTree(wide(1000), 'w0', { radius: 100, offset: 0 });
  assert.equal(broad.nodes.size, 1001);
  assert.equal(broad.placementDistances.size, 1);
  for (const record of broad.nodes.values()) {
    for (const phase of broad.phases) {
      assert.ok(Number.isFinite(record.positions.get(phase).theta));
      assert.ok(Number.isFinite(record.positions.get(phase).rho));
    }
  }

  const deep = stageTree(deepChain(10000), 'd0', { radius: 100, offset: 0.1 });
  assert.equal(deep.nodes.size, 10000);
  assert.equal(deep.maxDepth, 9999);
  assert.equal(deep.placementDistances.size, 9999);
  assert.ok(Number.isFinite(deep.nodes.get('d9999').positions.get('current').theta));
  assert.ok(deep.nodes.get('d9999').positions.get('current').rho > 0);
  assert.ok(deep.nodes.get('d9999').positions.get('current').rho < 1);
});

test('60-chain offset=0 still rejects at d53', () => {
  const { graph } = loadTree(deepChain(60));
  assert.throws(
    () => stageRadialLayout(graph, { rootId: 'd0', nodeOptions: { overridable: true }, radius: 100, offset: 0 }),
    (error) => error.code === 'radial-domain' && error.nodeId === 'd53'
  );
});

test('success and failure leave all live state and identities unchanged', () => {
  const { graph } = loadTree(f20());
  const snapshots = [];
  for (const [i, node] of [...graph.nodes.values()].entries()) {
    node._depth = 110 + i;
    node._flag = i % 2 === 0;
    node.pos.setc(i, i + 1);
    node.startPos.setc(i + 2, i + 3);
    node.endPos.setc(i + 4, i + 5);
    node.data.$span = i;
    node.data['$dim-quotient'] = i / 10;
    node.angleSpan = { begin: i, end: i + 1 };
    node.scale = 44 + i;
    node._angularWidth = 9 + i;
    node._treeAngularWidth = 10 + i;
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
      dimData: node.data.$dim,
      angleSpan: { ...node.angleSpan },
      scale: node.scale,
      angular: node._angularWidth,
      tree: node._treeAngularWidth
    });
  }

  const result = stageRadialLayout(graph, { rootId: 'n0', nodeOptions: { overridable: true }, radius: 100, offset: 0.1 });
  assert.equal(result.nodes.size, 20);
  assertUnchanged(snapshots);

  graph.getNode('n2').data.$dim = Number.NaN;
  snapshots.find((s) => s.node.id === 'n2').dimData = Number.NaN;  assert.throws(
    () => stageRadialLayout(graph, { rootId: 'n0', nodeOptions: { overridable: true }, radius: 100, offset: 0.1 }),
    (error) => error.code === 'invalid-dim'
  );
  assertUnchanged(snapshots);
});

function assertUnchanged(snapshots) {
  for (const s of snapshots) {
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
    assert.equal(n.data['$dim-quotient'], s.quotient);
    assert.equal(n.data.$dim, s.dimData);
    assert.deepEqual(n.angleSpan, s.angleSpan);
    assert.equal(n.scale, s.scale);
    assert.equal(n._angularWidth, s.angular);
    assert.equal(n._treeAngularWidth, s.tree);
  }
}

test('LayoutContractError is public', () => {
  try {
    stageRadialLayout(loadTree(singleRoot()).graph, { rootId: 'n0', radius: 'auto' });
    assert.fail('expected throw');
  } catch (error) {
    assert.ok(error instanceof LayoutContractError);
    assert.equal(error.code, 'invalid-radius');
  }
});

