import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  stageExperimentalV2Layout,
  refineExperimentalV2Layout,
  refineExperimentalV2LocalCrowding,
  localMovementWithinBudgets,
  LOCAL_CROWDING_MAX_CANDIDATES,
  LOCAL_CROWDING_MAX_NODES,
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

function run(make) {
  const tree = make();
  const { graph } = loadTree(tree);
  const base = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current', 'end'], nodeOptions: { overridable: true } });
  const refined = refineExperimentalV2Layout(base, graph, options);
  const local = refineExperimentalV2LocalCrowding(refined.staged, graph, options);
  return { graph, refined, local };
}

test('local correction is deterministic, bounded, and rejects F200 without mutation', () => {
  const a = run(f200);
  const b = run(f200);
  assert.equal(a.local.crowding.outcome, 'no-improving-candidate');
  assert.equal(a.local.staged, a.refined.staged);
  assert.equal(a.local.crowding.affectedCount > 0, true);
  assert.equal(a.local.crowding.regionCount > 0, true);
  assert.ok(a.local.crowding.attempts <= LOCAL_CROWDING_MAX_CANDIDATES);
  assert.equal(a.local.crowding.candidateLimit, LOCAL_CROWDING_MAX_CANDIDATES);
  assert.equal(a.local.crowding.after.metrics.overlapPairs, a.local.crowding.before.metrics.overlapPairs);
  assert.deepEqual(a.local.crowding.after.displacement, { meanCss: 0, maxCss: 0, changedNodes: 0 });
  assert.deepEqual([...a.local.staged.nodes].map(([id, n]) => [id, n.positions.get('current')]),
    [...b.local.staged.nodes].map(([id, n]) => [id, n.positions.get('current')]));
});

test('unaffected fixture outcomes and structure remain original', () => {
  for (const make of [f20, crowdedFolder, denseNeighbors, mixedDeepWide, longLabels]) {
    const { refined, local } = run(make);
    assert.ok(['no-crowding', 'no-improving-candidate'].includes(local.crowding.outcome));
    assert.equal(local.staged, refined.staged);
    if (local.crowding.before) {
      assert.equal(local.crowding.after.metrics.overlapPairs, local.crowding.before.metrics.overlapPairs);
    }
  }
});

test('root, sectors, sibling order, depths, phases, and radial bounds are preserved', () => {
  const { graph, refined, local } = run(f200);
  const staged = local.staged;
  assert.equal(staged.rootId, refined.staged.rootId);
  assert.equal(staged.nodes.get(staged.rootId).positions.get('current').rho, 0);
  assert.deepEqual([...staged.nodes.keys()], [...refined.staged.nodes.keys()]);
  for (const [id, node] of staged.nodes) {
    const before = refined.staged.nodes.get(id);
    assert.deepEqual(node.angleSpan, before.angleSpan);
    assert.equal(node.depth, before.depth);
    assert.ok(staged.phases.every((phase) => node.positions.has(phase)));
    assert.ok(Number.isFinite(node.positions.get('current').theta));
    assert.ok(node.positions.get('current').rho >= 0 && node.positions.get('current').rho < 1);
  }
  for (const [parentId, children] of staged.children) {
    assert.deepEqual(children, refined.staged.children.get(parentId));
    const parent = staged.nodes.get(parentId);
    for (const childId of children) {
      assert.ok(staged.nodes.get(childId).positions.get('current').rho > parent.positions.get('current').rho);
    }
  }
  assert.equal(graph.nodes.size, staged.nodeCount);
});

test('movement budgets reject over-budget candidates', () => {
  const ok = {
    displacement: { meanCss: 90, maxCss: 220, changedNodes: 1 },
    unrelated: { meanCss: 90, maxCss: 100, changedNodes: 1 },
    layoutDisplacement: { mean: 0.5, max: 0.95 }
  };
  assert.equal(localMovementWithinBudgets(ok), true);
  assert.equal(localMovementWithinBudgets({ ...ok, displacement: { meanCss: 91, maxCss: 0, changedNodes: 1 } }), false);
  assert.equal(localMovementWithinBudgets({ ...ok, displacement: { meanCss: 0, maxCss: 221, changedNodes: 1 } }), false);
  assert.equal(localMovementWithinBudgets({ ...ok, unrelated: { meanCss: 91, maxCss: 0, changedNodes: 1 } }), false);
  assert.equal(localMovementWithinBudgets({ ...ok, layoutDisplacement: { mean: 0, max: 0.96 } }), false);
  assert.equal(localMovementWithinBudgets(null), false);
});

test('local input bound and invalid phase reject without mutation', () => {
  const { graph, refined } = run(f20);
  const snapshot = [...refined.staged.nodes].map(([id, n]) => [id, n.positions.get('current').rho]);
  assert.throws(() => refineExperimentalV2LocalCrowding(refined.staged, graph, { ...options, phase: 'missing' }),
    (error) => error.code === 'invalid-phase');
  assert.deepEqual([...refined.staged.nodes].map(([id, n]) => [id, n.positions.get('current').rho]), snapshot);
  const fake = { ...refined.staged, nodeCount: LOCAL_CROWDING_MAX_NODES + 1 };
  assert.throws(() => refineExperimentalV2LocalCrowding(fake, graph, options),
    (error) => error.code === 'local-crowding-input-limit');
});

test('rejected output still supports final containment and hit geometry', () => {
  const { graph, local } = run(f200);
  const staged = local.staged;
  const projection = createProjection({ ...viewport, radius: 198.66 * staged.feasibility.workspaceScale });
  const dims = new Map([...graph.nodes].map(([id, n]) => [id, Number(n.data.$dim) || 0]));
  const kinds = new Map([...graph.nodes].map(([id, n]) => [id, n.kind]));
  const fixed = applyFixedGlyphPolicy(prepareGraphScene(staged, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds }));
  const fit = calculateFitCamera({
    nodes: [...fixed.nodes.values()], viewport, padding: 24,
    presentation: { kind: 'fixed', glyphRadiusCss: 6 },
    projectionScale: staged.feasibility.workspaceScale, limits: EXPERIMENTAL_CAMERA_LIMITS
  });
  assert.equal(fit.ok, true);
  const final = applyFixedGlyphPolicy(applyCameraToScene(fixed, fit.camera, viewport, EXPERIMENTAL_CAMERA_LIMITS));
  assert.equal(final.nodes.size, 200);
  assert.equal(hitTestNode(createHitSnapshot(final), final.nodes.get('n13').center), 'n13');
});
