import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  stageExperimentalV2Layout,
  refineExperimentalV2Layout,
  refineExperimentalV2LocalCrowding,
  refineExperimentalV2Crowding
} from '../../../src/engine/hypertree/layout/index.js';
import { f20, f200 } from './fixtures.mjs';
import { crowdedFolder, denseNeighbors, mixedDeepWide, longLabels } from './crowding-fixtures.mjs';

const fixtures = { f20, f200, crowdedFolder, denseNeighbors, mixedDeepWide, longLabels };
const viewports = { primary: { width: 1100, height: 473 }, secondary: { width: 800, height: 600 } };
const report = {};
for (const [name, make] of Object.entries(fixtures)) {
  report[name] = {};
  for (const [viewName, viewport] of Object.entries(viewports)) {
    const tree = make();
    const { graph } = loadTree(tree);
    const base = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
    const opts = { viewport, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current' };
    const refined = refineExperimentalV2Layout(base, graph, opts);
    const local = refineExperimentalV2LocalCrowding(refined.staged, graph, opts);
    const global = refineExperimentalV2Crowding(refined.staged, graph, opts);
    report[name][viewName] = {
      workspaceScale: base.feasibility.workspaceScale,
      off: compact(refined.refinement.after),
      local: outcome(local.crowding),
      global: outcome(global.crowding)
    };
  }
}
function compact(metrics) {
  return metrics ? {
    overlapPairs: metrics.overlapPairs,
    boundary: metrics.minimumShapeBoundarySeparationCss,
    visible: metrics.visibleNodes
  } : null;
}
function outcome(crowding) {
  return {
    outcome: crowding.outcome,
    applied: crowding.applied,
    affectedCount: crowding.affectedCount,
    regionCount: crowding.regionCount,
    attempts: crowding.attempts,
    before: crowding.before && crowding.before.metrics ? compact(crowding.before.metrics) : null,
    after: crowding.after && crowding.after.metrics ? compact(crowding.after.metrics) : null,
    displacement: crowding.after && crowding.after.displacement,
    unrelated: crowding.after && crowding.after.unrelated,
    pattern: crowding.selectedPattern
  };
}
console.log(JSON.stringify(report, null, 2));
