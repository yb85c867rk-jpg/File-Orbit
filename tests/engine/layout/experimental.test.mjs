import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  stageExperimentalLayout,
  stageRadialLayout,
  EXPERIMENTAL_DEFAULTS,
  measurePreparedScene,
  comparePreparedScenes,
  DIAGNOSTIC_MAX_NODES,
  radialSpread,
  shapesOverlap
} from '../../../src/engine/hypertree/layout/index.js';
import { createFocusView } from '../../../src/engine/hypertree/focus/index.js';
import { createProjection, prepareGraphScene } from '../../../src/engine/hypertree/render/index.js';
import { createHitSnapshot, hitTestNode } from '../../../src/engine/hypertree/interaction/index.js';
import { f20, f200 } from './fixtures.mjs';
import { crowdedFolder, denseNeighbors, mixedDeepWide, infeasibleDepth } from './crowding-fixtures.mjs';

function layoutFor(tree, phases = ['current']) {
  const { graph } = loadTree(tree);
  return {
    graph,
    baseline: stageRadialLayout(graph, { rootId: tree.id, phases, nodeOptions: { overridable: true }, radius: 100, offset: 0.1 }),
    experimental: stageExperimentalLayout(graph, { rootId: tree.id, phases, nodeOptions: { overridable: true } })
  };
}

function walk(staged, id, visit) {
  visit(id, staged.nodes.get(id));
  for (const child of staged.children.get(id) || []) walk(staged, child, visit);
}

test('experimental layout is deterministic for F20/F200 and does not mutate baseline', () => {
  for (const tree of [f20(), f200()]) {
    const { graph, baseline, experimental } = layoutFor(tree);
    const again = stageExperimentalLayout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
    const baselineAgain = stageRadialLayout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true }, radius: 100, offset: 0.1 });
    assert.deepEqual([...experimental.nodes].map(([id, n]) => [id, n.positions.get('current')]),
      [...again.nodes].map(([id, n]) => [id, n.positions.get('current')]));
    assert.deepEqual([...baseline.nodes].map(([id, n]) => [id, n.positions.get('current')]),
      [...baselineAgain.nodes].map(([id, n]) => [id, n.positions.get('current')]));
    assert.deepEqual([...experimental.nodes.keys()], [...baseline.nodes.keys()]);
    assert.equal(experimental.rootId, baseline.rootId);
    for (const id of baseline.nodes.keys()) {
      assert.equal(experimental.nodes.get(id).depth, baseline.nodes.get(id).depth);
    }
  }
});

test('dense branch receives a larger contiguous angular allocation', () => {
  const { experimental } = layoutFor(crowdedFolder());
  const dense = experimental.nodes.get('dense');
  const small = experimental.nodes.get('small-a');
  assert.ok(dense.angleSpan.end - dense.angleSpan.begin > small.angleSpan.end - small.angleSpan.begin);
  let last = 0;
  for (const id of ['dense', 'small-a', 'small-b', 'small-c']) {
    const span = experimental.nodes.get(id).angleSpan;
    assert.ok(Math.abs(span.begin - last) <= 1e-12);
    last = span.end;
  }
  assert.ok(Math.abs(last - Math.PI * 2) <= 1e-12);
});

test('same-depth radii vary for mixed-demand siblings and all positions are open-disk', () => {
  const { experimental } = layoutFor(mixedDeepWide());
  const radii = ['deep-0', 'medium', 'wide'].map((id) => experimental.nodes.get(id).positions.get('current').rho);
  assert.ok(Math.max(...radii) - Math.min(...radii) > 0.01);
  walk(experimental, experimental.rootId, (id, node) => {
    for (const p of node.positions.values()) {
      assert.ok(Number.isFinite(p.theta) && Number.isFinite(p.rho));
      assert.ok(p.rho >= 0 && p.rho < 1, `${id} rho`);
    }
  });
});

test('child radial order, topology, ids, order, depths, and phase isolation are preserved', () => {
  const { experimental } = layoutFor(mixedDeepWide(), ['current', 'end']);
  assert.equal(experimental.nodes.get(experimental.rootId).positions.get('current').rho, 0);
  for (const [parentId, childIds] of experimental.children) {
    const parentRho = experimental.nodes.get(parentId).positions.get('current').rho;
    for (const childId of childIds) {
      const child = experimental.nodes.get(childId);
      assert.ok(child.positions.get('current').rho > parentRho + EXPERIMENTAL_DEFAULTS.minStep - 1e-12);
      assert.equal(child.depth, experimental.depths.get(parentId) + 1);
      assert.notEqual(child.positions.get('current'), child.positions.get('end'));
      assert.deepEqual(child.positions.get('current'), experimental.nodes.get(childId).positions.get('current'));
    }
  }
  experimental.nodes.get(experimental.rootId).positions.get('current').rho = 0.5;
  assert.equal(experimental.nodes.get(experimental.rootId).positions.get('end').rho, 0);
});

test('angular intervals are ordered and cover each parent allocation', () => {
  const { experimental } = layoutFor(denseNeighbors());
  const validate = (id) => {
    const parent = experimental.nodes.get(id);
    const children = experimental.children.get(id) || [];
    if (children.length === 0) return;
    let cursor = parent.angleSpan.begin;
    for (const childId of children) {
      const child = experimental.nodes.get(childId);
      assert.ok(Math.abs(child.angleSpan.begin - cursor) <= 1e-12);
      assert.ok(child.angleSpan.end >= child.angleSpan.begin);
      cursor = child.angleSpan.end;
      validate(childId);
    }
    assert.ok(Math.abs(cursor - parent.angleSpan.end) <= 1e-12);
  };
  validate(experimental.rootId);
});

test('infeasible depth/spacing and invalid configuration reject explicitly', () => {
  const { graph } = loadTree(infeasibleDepth());
  assert.throws(
    () => stageExperimentalLayout(graph, { rootId: 'depth-0', phases: ['current'], experiment: { minStep: 0.02 } }),
    (error) => error.code === 'experimental-infeasible'
  );
  for (const experiment of [
    { minStep: 0 }, { minStep: 0.3 }, { radialFlex: -1 }, { radialFlex: 2 },
    { demandCompression: 0 }, { demandCompression: 2 }, { branchWeight: -1 },
    { safetyMargin: 0.5 }, { radius: 0 }, { minStep: Number.NaN }
  ]) {
    assert.throws(
      () => stageExperimentalLayout(graph, { rootId: 'depth-0', phases: ['current'], experiment }),
      (error) => error.code === 'invalid-experiment'
    );
  }
});

test('experimental staged output is compatible with immediate focus, rendering, labels, and hits', () => {
  const { graph } = loadTree(f200());
  const staged = stageExperimentalLayout(graph, { rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true } });
  const focused = createFocusView(staged, { focusId: 'n13', phase: 'current' });
  assert.equal(focused.requestedId, 'n13');
  assert.ok(focused.centerError <= 1e-12);
  const projection = createProjection({ width: 800, height: 600, radius: 100 });
  const dims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const kinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  const scene = prepareGraphScene(focused.staged, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds });
  const snapshot = createHitSnapshot(scene);
  const target = scene.nodes.get('n13');
  assert.equal(hitTestNode(snapshot, { x: target.center.x, y: target.center.y }), 'n13');
  assert.equal(scene.nodes.size, 200);
});

test('comparison metrics are shape-aware and radial spread is by structural depth', () => {
  const circle = { shape: 'circle', center: { x: 0, y: 0 }, radius: 10 };
  const diamond = { shape: 'diamond', center: { x: 12, y: 0 }, radius: 5 };
  assert.equal(shapesOverlap(circle, diamond), true);
  assert.equal(shapesOverlap({ ...circle, center: { x: 30, y: 0 } }, diamond), false);
  const { experimental } = layoutFor(crowdedFolder());
  const spread = radialSpread(experimental, 'current');
  assert.ok(spread.has(0) && spread.has(1) && spread.has(2));
  const projection = createProjection({ width: 800, height: 600, radius: 100 });
  const { graph } = loadTree(crowdedFolder());
  const dims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const kinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  const scene = prepareGraphScene(experimental, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds });
  const metrics = measurePreparedScene(scene);
  assert.equal(metrics.visibleNodes, experimental.nodeCount);
  assert.ok(metrics.overlapPairs >= 0);
  assert.ok(metrics.bounds && metrics.minCenterSeparation >= 0);
});
test('experimental placement schema is child-keyed and does not reuse baseline parent-distance semantics', () => {
  const { experimental } = layoutFor(mixedDeepWide());
  assert.equal(experimental.schema, 'experimental-adaptive-layout-v1');
  assert.equal(experimental.placementDistances, undefined);
  assert.equal(experimental.distances, undefined);
  assert.equal(experimental.angularWidths, undefined);
  const parent = experimental.nodes.get('wide');
  const children = experimental.children.get('wide');
  assert.ok(children.length > 1);
  for (const childId of children) {
    assert.equal(experimental.placementRadiiById.get(childId), experimental.nodes.get(childId).radialRadius);
    assert.equal(experimental.parentRadialById.get(childId), parent.radialRadius);
    assert.equal(experimental.radialById.get(childId), experimental.nodes.get(childId).radialRadius);
    assert.equal(experimental.allocatedSpanById.get(childId), experimental.nodes.get(childId).angleSpan.end - experimental.nodes.get(childId).angleSpan.begin);
  }
  const siblingIds = ['deep-0', 'medium', 'wide'];
  const siblingRadii = siblingIds.map((id) => experimental.placementRadiiById.get(id));
  assert.ok(Math.max(...siblingRadii) - Math.min(...siblingRadii) > 0.01);
  for (const id of siblingIds) {
    assert.equal(experimental.nodes.get(id).parentRadialRadius, 0);
    assert.equal(experimental.placementRadiiById.get(id), experimental.nodes.get(id).radialRadius);
  }
  const root = experimental.nodes.get(experimental.rootId);
  assert.equal(experimental.placementRadiiById.has(experimental.rootId), false);
  assert.equal(root.parentRadialRadius, null);
});
test('comparison evidence separates visibility loss, same-ID overlap, and fixed-size placement', () => {
  const a = layoutFor(f200());
  const projection = createProjection({ width: 800, height: 600, radius: 100 });
  const dims = new Map([...a.graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const kinds = new Map([...a.graph.nodes].map(([id, node]) => [id, node.kind]));
  const baseline = prepareGraphScene(a.baseline, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds });
  const experimental = prepareGraphScene(a.experimental, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds });
  const detail = comparePreparedScenes(baseline, experimental);
  assert.equal(detail.totalNodes.baseline, 200);
  assert.equal(detail.totalNodes.experimental, 200);
  assert.equal(detail.visible.baseline, 200);
  assert.equal(detail.visible.experimental, 181);
  assert.equal(detail.hidden.experimental, 19);
  assert.equal(detail.newlyHiddenIds.length, 19);
  assert.equal(detail.newlyVisibleIds.length, 0);
  assert.equal(detail.fixedSizeDiagnostic.radiusCss, 6);
  assert.equal(detail.fixedSizeDiagnostic.provenance.includes('analytical'), true);
  assert.equal(detail.radiusStats.experimental.all.count, 200);
  assert.equal(detail.radiusStats.experimental.visible.count, 181);
  assert.ok(detail.sameIdsVisibleBoth.count <= 200);
});

test('pairwise diagnostics reject above the declared node limit before loops', () => {
  const nodes = new Map();
  for (let i = 0; i < DIAGNOSTIC_MAX_NODES + 1; i += 1) {
    nodes.set(`x${i}`, {
      id: `x${i}`, shape: 'circle', visible: true, radius: 1,
      center: { x: i, y: 0 }
    });
  }
  assert.throws(
    () => measurePreparedScene({ nodes, edges: [] }),
    (error) => error.code === 'diagnostic-limit'
  );
});



