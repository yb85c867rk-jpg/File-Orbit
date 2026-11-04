import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  stageExperimentalV2Layout,
  refineExperimentalV2Layout
} from '../../../src/engine/hypertree/layout/index.js';
import { f20, f200 } from './fixtures.mjs';
import {
  crowdedFolder,
  denseNeighbors,
  mixedDeepWide,
  longLabels
} from './crowding-fixtures.mjs';

const fixtures = { f20, f200, crowdedFolder, denseNeighbors, mixedDeepWide, longLabels };
const viewport = { width: 1100, height: 473 };
const report = {};
for (const [name, make] of Object.entries(fixtures)) {
  const tree = make();
  const { graph } = loadTree(tree);
  const staged = stageExperimentalV2Layout(graph, {
    rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true }
  });
  const refined = refineExperimentalV2Layout(staged, graph, {
    viewport, padding: 24, projectionBaseRadiusCss: 198.66
  });
  report[name] = {
    workspaceScale: staged.feasibility.workspaceScale,
    requested: refined.refinement.requested,
    applied: refined.refinement.applied,
    outcome: refined.refinement.outcome,
    selectedPattern: refined.refinement.selectedPattern,
    attempts: refined.refinement.attempts,
    candidateLimit: refined.refinement.candidateLimit,
    before: refined.refinement.before,
    after: refined.refinement.after,
    beforeFit: refined.refinement.beforeFit,
    afterFit: refined.refinement.afterFit
  };
}
console.log(JSON.stringify(report, null, 2));
