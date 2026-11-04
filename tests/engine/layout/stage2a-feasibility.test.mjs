import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  DIAGNOSTIC_MAX_NODES,
  stageExperimentalV2Layout,
  refineExperimentalV2Layout,
  V2_DEFAULTS,
  measurePreparedScene
} from '../../../src/engine/hypertree/layout/index.js';
import { EDITOR_MAX_NODES } from '../../../src/engine/hypertree/editor/validation.js';
import { SHAPES, buildFixture, measureTree } from '../../../analysis/stage2a/fixtures.mjs';
import { evaluateStaged } from '../../../analysis/stage2a/evaluate.mjs';
import { measureSceneExact } from '../../../analysis/stage2a/measure.mjs';
import { buildClusterOverview, buildClusterFocus } from '../../../analysis/stage2a/cluster.mjs';

const viewport = { width: 1600, height: 900 };
function stage(tree, experimentV2 = {}) {
  const { graph } = loadTree(tree);
  return { graph, staged: stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true }, experimentV2 }) };
}
function binary(total) {
  const nodes = Array.from({ length: total }, (_, index) => ({ id: index === 0 ? 'root' : `n${index}`, kind: 'file', name: `이진-${index}`, data: {}, children: [] }));
  for (let index = 0; index < total; index += 1) {
    const a = index * 2 + 1; const b = index * 2 + 2;
    if (a < total) { nodes[index].kind = 'folder'; nodes[index].children.push(nodes[a]); }
    if (b < total) { nodes[index].kind = 'folder'; nodes[index].children.push(nodes[b]); }
  }
  return nodes[0];
}

test('Stage 2A fixtures are exact root-inclusive 300 and 1,000-node shapes', () => {
  assert.deepEqual(SHAPES, ['flat', 'wide', 'balanced', 'mixed', 'deep']);
  for (const shape of SHAPES) {
    for (const total of [300, 1000]) {
      const tree = buildFixture(shape, total);
      const stats = measureTree(tree);
      assert.equal(stats.nodeCount, total, `${shape}/${total}`);
      assert.equal(stats.depth > 0, true);
      assert.equal(stats.folderCount >= 1, true);
      const names = [];
      const stack = [tree];
      while (stack.length) {
        const node = stack.pop(); names.push(node.name);
        for (const child of node.children || []) stack.push(child);
      }
      assert.equal(names.some((name) => /한국어/.test(name)), true, 'long Korean names are present');
    }
  }
  assert.equal(measureTree(buildFixture('flat', 1000)).depth, 1);
  assert.equal(measureTree(buildFixture('wide', 1000)).depth, 2);
  assert.equal(measureTree(buildFixture('balanced', 1000)).depth >= 5, true);
  assert.equal(measureTree(buildFixture('mixed', 1000)).depth >= 9, true);
  assert.equal(measureTree(buildFixture('deep', 1000)).depth >= 45, true);
});

test('exact broad-phase matches production diagnostics at 300 nodes', () => {
  for (const shape of ['flat', 'balanced', 'mixed']) {
    const tree = buildFixture(shape, 300);
    const { graph, staged } = stage(tree);
    const evaluation = evaluateStaged(staged, graph, { viewport, projectionBaseRadiusCss: 198.66 });
    assert.equal(evaluation.ok, true, shape);
    const production = measurePreparedScene(evaluation.scene, { viewport, maxNodes: 300 });
    const exact = measureSceneExact(evaluation.scene, { viewport });
    assert.equal(exact.overlapPairs, production.overlapPairs, `${shape} overlap`);
    assert.equal(exact.minCenterSeparation, production.minCenterSeparation, `${shape} min separation`);
    assert.deepEqual(exact.bounds, production.bounds, `${shape} bounds`);
    assert.equal(exact.visibleNodes, production.visibleNodes, `${shape} visible`);
  }
});

test('exact broad-phase supports 1,000 nodes while the default diagnostic cap remains 300', () => {
  const tree = buildFixture('balanced', 1000);
  const { graph, staged } = stage(tree);
  const evaluation = evaluateStaged(staged, graph, { viewport, projectionBaseRadiusCss: 198.66 });
  assert.equal(evaluation.ok, true);
  assert.throws(() => measurePreparedScene(evaluation.scene, { viewport }), (error) => error.code === 'diagnostic-limit');
  const production = measurePreparedScene(evaluation.scene, { viewport, maxNodes: 1000 });
  const exact = measureSceneExact(evaluation.scene, { viewport });
  assert.equal(exact.overlapPairs, production.overlapPairs);
  assert.equal(exact.minCenterSeparation, production.minCenterSeparation);
  assert.equal(exact.visibleNodes, 1000);
  assert.equal(evaluation.edgeCount, 999);
});

test('normal application and V2 defaults remain free-only at 300 and unchanged', () => {
  assert.equal(EDITOR_MAX_NODES, 300);
  assert.equal(DIAGNOSTIC_MAX_NODES, 300);
  assert.equal(V2_DEFAULTS.referenceProjectionRadiusCss, 240);
  assert.equal(V2_DEFAULTS.workspaceScaleMax, 16);
  assert.throws(() => stage(buildFixture('flat', 1000)), (error) => error.code === 'experimental-v2-infeasible');
});

test('larger projection radius makes flat 1,000 stage but not readable full layout', () => {
  const tree = buildFixture('flat', 1000);
  const { graph, staged } = stage(tree, { referenceProjectionRadiusCss: 960 });
  assert.equal(staged.nodeCount, 1000);
  const evaluation = evaluateStaged(staged, graph, { viewport, projectionBaseRadiusCss: 960 });
  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.metrics.visibleNodes, 1000);
  assert.equal(evaluation.metrics.overlapPairs > 0, true);
});

test('refinement diagnostics require explicit opt-in above 300 and still show 1,000-node overlap', () => {
  const tree = binary(1000);
  const { graph, staged } = stage(tree);
  assert.throws(() => refineExperimentalV2Layout(staged, graph, { viewport, padding: 24, projectionBaseRadiusCss: 198.66 }), (error) => error.code === 'diagnostic-limit');
  const refined = refineExperimentalV2Layout(staged, graph, { viewport, padding: 24, projectionBaseRadiusCss: 198.66, diagnosticMaxNodes: 1000 });
  assert.equal(refined.refinement.attempts > 1, true);
  const evaluation = evaluateStaged(refined.staged, graph, { viewport, projectionBaseRadiusCss: 198.66 });
  assert.equal(evaluation.metrics.visibleNodes, 1000);
  assert.equal(evaluation.metrics.overlapPairs > 0, true);
});

test('cluster/focus presentation is non-mutating and fits the 300-node renderer budget', () => {
  const tree = buildFixture('flat', 1000);
  const before = JSON.stringify(tree);
  const overview = buildClusterOverview(tree, { clusterSize: 40 });
  const focus = buildClusterFocus(tree, 0, { clusterSize: 40 });
  assert.equal(JSON.stringify(tree), before, 'source document is unchanged');
  assert.equal(overview.clusterCount, 25);
  assert.equal(overview.memberMap.size, 25);
  assert.equal([...overview.memberMap.values()].reduce((sum, ids) => sum + ids.length, 0), 999);
  const overviewStats = measureTree(overview.tree);
  const focusStats = measureTree(focus.tree);
  assert.equal(overviewStats.nodeCount, 26);
  assert.equal(focusStats.nodeCount, 42);
  assert.equal(overviewStats.nodeCount <= EDITOR_MAX_NODES, true);
  assert.equal(focusStats.nodeCount <= EDITOR_MAX_NODES, true);

  const overviewStage = stage(overview.tree);
  const overviewEval = evaluateStaged(overviewStage.staged, overviewStage.graph, { viewport, projectionBaseRadiusCss: 198.66 });
  assert.equal(overviewEval.ok, true);
  assert.equal(overviewEval.metrics.overlapPairs, 0);
  const focusStage = stage(focus.tree);
  const focusEval = evaluateStaged(focusStage.staged, focusStage.graph, { viewport, projectionBaseRadiusCss: 198.66 });
  assert.equal(focusEval.ok, true);
  assert.equal(focusEval.metrics.overlapPairs, 0);
  assert.equal(JSON.stringify(tree), before, 'source document remains unchanged after presentation staging');
});
