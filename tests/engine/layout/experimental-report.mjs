/**
 * Node-only comparison report for the experimental layout.
 * Label visibility is not measured here; use the browser harness for DOM labels.
 */
import { performance } from 'node:perf_hooks';
import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  stageRadialLayout,
  stageExperimentalLayout,
  comparePreparedScenes
} from '../../../src/engine/hypertree/layout/index.js';
import { createProjection, prepareGraphScene } from '../../../src/engine/hypertree/render/index.js';
import { f20, f200 } from './fixtures.mjs';
import {
  crowdedFolder,
  denseNeighbors,
  mixedDeepWide,
  longLabels,
  infeasibleDepth
} from './crowding-fixtures.mjs';

const fixtures = { f20, f200, crowdedFolder, denseNeighbors, mixedDeepWide, longLabels };
const projection = createProjection({ width: 800, height: 600, radius: 100 });

function measure(tree, mode) {
  const { graph } = loadTree(tree);
  const start = performance.now();
  const staged = mode === 'experimental'
    ? stageExperimentalLayout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } })
    : stageRadialLayout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true }, radius: 100, offset: 0.1 });
  const layoutMs = performance.now() - start;
  const dims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const kinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  const scene = prepareGraphScene(staged, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds });
  return { layoutMs, scene };
}

const report = {};
for (const [name, make] of Object.entries(fixtures)) {
  const baseline = measure(make(), 'baseline');
  const experimental = measure(make(), 'experimental');
  report[name] = {
    layoutMs: { baseline: baseline.layoutMs, experimental: experimental.layoutMs },
    comparison: comparePreparedScenes(baseline.scene, experimental.scene),
    labelMetrics: 'NOT MEASURED (Node report); use m5-adaptive-layout browser harness'
  };
}
try {
  const graph = loadTree(infeasibleDepth()).graph;
  stageExperimentalLayout(graph, {
    rootId: 'depth-0', phases: ['current'], experiment: { minStep: 0.02 }
  });
  report.infeasible = { rejected: false };
} catch (error) {
  report.infeasible = { rejected: true, code: error.code, message: error.message };
}
console.log(JSON.stringify(report, null, 2));
