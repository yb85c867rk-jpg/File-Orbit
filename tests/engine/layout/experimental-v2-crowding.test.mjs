import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  stageExperimentalV2Layout,
  refineExperimentalV2Layout,
  refineExperimentalV2Crowding,
  REFINEMENT_MAX_CANDIDATES,
  CROWDING_MAX_CANDIDATES,
  CROWDING_MAX_NODES,
  measureDisplacement,
  applyFixedGlyphPolicy
} from '../../../src/engine/hypertree/layout/index.js';
import {
  EXPERIMENTAL_CAMERA_LIMITS,
  applyCameraToScene,
  calculateFitCamera
} from '../../../src/engine/hypertree/navigation/index.js';
import { createProjection, prepareGraphScene } from '../../../src/engine/hypertree/render/index.js';
import { createHitSnapshot, hitTestNode } from '../../../src/engine/hypertree/interaction/index.js';
import { f20, f200 } from './fixtures.mjs';
import { crowdedFolder, denseNeighbors, mixedDeepWide, longLabels } from './crowding-fixtures.mjs';

const viewport = { width: 1100, height: 473 };
const options = { viewport, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current' };

function run(make, crowd = true) {
  const tree = make();
  const { graph } = loadTree(tree);
  const base = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current', 'end'], nodeOptions: { overridable: true } });
  const refined = refineExperimentalV2Layout(base, graph, options);
  const result = crowd
    ? refineExperimentalV2Crowding(refined.staged, graph, options)
    : { staged: refined.staged, crowding: null };
  return { tree, graph, base, refined, result };
}

function sceneFor(staged, graph) {
  const projection = createProjection({ ...viewport, radius: 198.66 * staged.feasibility.workspaceScale });
  const dims = new Map([...graph.nodes].map(([id, n]) => [id, Number(n.data.$dim) || 0]));
  const kinds = new Map([...graph.nodes].map(([id, n]) => [id, n.kind]));
  return prepareGraphScene(staged, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds });
}

test('crowding correction improves F200 and is deterministic/bounded', () => {
  const a = run(f200);
  const b = run(f200);
  assert.equal(a.result.crowding.outcome, 'accepted');
  assert.equal(a.result.crowding.before.metrics.overlapPairs, 104);
  assert.ok(a.result.crowding.after.metrics.overlapPairs < 104);
  assert.deepEqual([...a.result.staged.nodes].map(([id, n]) => [id, n.positions.get('current')]),
    [...b.result.staged.nodes].map(([id, n]) => [id, n.positions.get('current')]));
  assert.ok(a.result.crowding.attempts <= CROWDING_MAX_CANDIDATES);
  assert.equal(a.result.crowding.candidateLimit, CROWDING_MAX_CANDIDATES);
  assert.ok(a.result.crowding.attempts <= REFINEMENT_MAX_CANDIDATES + 1);
});

test('F200 correction preserves topology, order, depths, phases, IDs, and ownership', () => {
  const a = run(f200);
  const before = [...a.refined.staged.nodes].map(([id, n]) => [id, n.positions.get('end').rho]);
  const staged = a.result.staged;
  assert.equal(staged.rootId, a.refined.staged.rootId);
  assert.deepEqual([...staged.children].map(([id, ids]) => [id, ids]),
    [...a.refined.staged.children].map(([id, ids]) => [id, ids]));
  assert.deepEqual([...staged.nodes.keys()], [...a.refined.staged.nodes.keys()]);
  for (const [id, node] of staged.nodes) {
    assert.equal(node.depth, a.refined.staged.nodes.get(id).depth);
    assert.ok(staged.phases.every((phase) => node.positions.has(phase)));
    assert.ok(node.positions.get('current').rho < 1);
  }
  assert.notEqual(staged, a.refined.staged);
  assert.notEqual(staged.experiment, a.refined.staged.experiment);
  staged.experiment.config.bandCount = 99;
  staged.feasibility.satisfied = false;
  staged.phases.push('mutated');
  assert.notEqual(a.refined.staged.experiment.config.bandCount, 99);
  assert.equal(a.refined.staged.feasibility.satisfied, true);
  assert.equal(a.refined.staged.phases.includes('mutated'), false);
  assert.deepEqual([...a.refined.staged.nodes].map(([id, n]) => [id, n.positions.get('end').rho]), before);
});

test('already corrected F200 rejects without mutation and returns original identity', () => {
  const first = run(f200);
  const second = refineExperimentalV2Crowding(first.result.staged, first.graph, options);
  assert.equal(second.crowding.outcome, 'no-improving-candidate');
  assert.equal(second.staged, first.result.staged);
  assert.deepEqual(second.crowding.before, second.crowding.after);
});

test('nodes remain contained with fixed 6px glyphs and hit geometry matches', () => {
  const { graph, result } = run(f200);
  const staged = result.staged;
  const fixed = applyFixedGlyphPolicy(sceneFor(staged, graph));
  const fit = calculateFitCamera({
    nodes: [...fixed.nodes.values()], viewport, padding: 24,
    presentation: { kind: 'fixed', glyphRadiusCss: 6 },
    projectionScale: staged.feasibility.workspaceScale, limits: EXPERIMENTAL_CAMERA_LIMITS
  });
  assert.equal(fit.ok, true);
  assert.equal(fit.containedCount, 200);
  const final = applyFixedGlyphPolicy(applyCameraToScene(fixed, fit.camera, viewport, EXPERIMENTAL_CAMERA_LIMITS));
  for (const node of final.nodes.values()) {
    assert.equal(node.radius, 6);
    assert.ok(node.center.x - 6 >= 24 - 1e-6);
    assert.ok(node.center.y - 6 >= 24 - 1e-6);
    assert.ok(node.center.x + 6 <= viewport.width - 24 + 1e-6);
    assert.ok(node.center.y + 6 <= viewport.height - 24 + 1e-6);
  }
  const snap = createHitSnapshot(final);
  assert.equal(hitTestNode(snap, final.nodes.get('n13').center), 'n13');
});

test('unchanged sparse fixtures report no-crowding and preserve node counts', () => {
  for (const make of [f20, crowdedFolder, denseNeighbors, mixedDeepWide, longLabels]) {
    const { result } = run(make);
    assert.equal(result.crowding.outcome, 'no-crowding');
    assert.equal(result.staged.nodeCount, stageNodeCount(make));
  }
});

function stageNodeCount(make) {
  const tree = make();
  const { graph } = loadTree(tree);
  return stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } }).nodeCount;
}
test('second viewport comparison improves and can reach zero F200 overlaps', () => {
  const tree = f200();
  const { graph } = loadTree(tree);
  const base = stageExperimentalV2Layout(graph, { rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true } });
  const refined = refineExperimentalV2Layout(base, graph, options);
  const wide = refineExperimentalV2Crowding(refined.staged, graph, { ...options, viewport: { width: 1600, height: 900 } });
  assert.equal(wide.crowding.outcome, 'accepted');
  assert.equal(wide.crowding.after.metrics.overlapPairs, 0);
  assert.equal(wide.crowding.after.fit.containedCount, 200);
  const small = refineExperimentalV2Crowding(refined.staged, graph, { ...options, viewport: { width: 800, height: 600 } });
  assert.equal(small.crowding.outcome, 'accepted');
  assert.ok(small.crowding.after.metrics.overlapPairs < small.crowding.before.metrics.overlapPairs);
});
test('crowding diagnostic bound supports 400 nodes and rejects 401', () => {
  const atMax = wideTree(CROWDING_MAX_NODES);
  const { graph } = loadTree(atMax);
  const staged = stageExperimentalV2Layout(graph, { rootId: 'root', phases: ['current'], nodeOptions: { overridable: true } });
  assert.equal(staged.nodeCount, CROWDING_MAX_NODES);
  const result = refineExperimentalV2Crowding(staged, graph, options);
  assert.ok(['accepted', 'no-improving-candidate', 'no-crowding'].includes(result.crowding.outcome));
  const over = wideTree(CROWDING_MAX_NODES + 1);
  const overGraph = loadTree(over).graph;
  const overStaged = stageExperimentalV2Layout(overGraph, { rootId: 'root', phases: ['current'], nodeOptions: { overridable: true } });
  assert.throws(() => refineExperimentalV2Crowding(overStaged, overGraph, options),
    (error) => error.code === 'crowding-input-limit');
});

function wideTree(count) {
  const root = { id: 'root', name: 'Root', kind: 'folder', data: Object.assign(Object.create(null), { $dim: 4, $angularWidth: 1 }), children: [] };
  const groups = 5;
  const folders = [];
  for (let i = 0; i < groups; i += 1) {
    const folder = { id: `f${i}`, name: `Folder ${i}`, kind: 'folder', data: Object.assign(Object.create(null), { $dim: 4, $angularWidth: 1 }), children: [] };
    folders.push(folder);
    root.children.push(folder);
  }
  let id = 0;
  while (1 + groups + id < count) {
    folders[id % groups].children.push({
      id: `leaf${id}`, name: `leaf-${id}.txt`, kind: 'file',
      data: Object.assign(Object.create(null), { $dim: 4, $angularWidth: 1 })
    });
    id += 1;
  }
  return root;
}
test('fitted displacement is measured by stable ID and accepted F200 is nonzero', () => {
  const unchanged = measureDisplacement(
    new Map([['a', { x: 1, y: 2 }], ['b', { x: 3, y: 4 }]]),
    new Map([['a', { x: 1, y: 2 }], ['b', { x: 3, y: 4 }]])
  );
  assert.deepEqual(unchanged, { meanCss: 0, maxCss: 0, changedNodes: 0 });
  const moved = measureDisplacement(
    new Map([['a', { x: 0, y: 0 }], ['b', { x: 0, y: 0 }]]),
    new Map([['a', { x: 3, y: 4 }], ['b', { x: 0, y: 0 }]])
  );
  assert.equal(moved.meanCss, 2.5);
  assert.equal(moved.maxCss, 5);
  assert.equal(moved.changedNodes, 1);
  assert.equal(measureDisplacement(new Map(), new Map()).meanCss, 0);
  const { result } = run(f200);
  assert.equal(result.crowding.outcome, 'accepted');
  assert.ok(result.crowding.after.displacement.meanCss > 0);
  assert.ok(result.crowding.after.displacement.maxCss > 0);
  assert.ok(result.crowding.after.displacement.changedNodes > 0);
});

