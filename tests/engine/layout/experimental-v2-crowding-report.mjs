import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  stageExperimentalV2Layout,
  refineExperimentalV2Layout,
  refineExperimentalV2Crowding
} from '../../../src/engine/hypertree/layout/index.js';
import { f20, f200 } from './fixtures.mjs';
import { crowdedFolder, denseNeighbors, mixedDeepWide, longLabels } from './crowding-fixtures.mjs';

const fixtures = { f20, f200, crowdedFolder, denseNeighbors, mixedDeepWide, longLabels };
const viewport = { width: 1100, height: 473 };
const report = {};
for (const [name, make] of Object.entries(fixtures)) {
  const tree = make();
  const { graph } = loadTree(tree);
  const staged = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current', 'end'], nodeOptions: { overridable: true } });
  const refined = refineExperimentalV2Layout(staged, graph, { viewport, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current' });
  const crowding = refineExperimentalV2Crowding(refined.staged, graph, {
    viewport, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current'
  });
  report[name] = {
    workspaceScale: staged.feasibility.workspaceScale,
    before: crowdedCompact(refined.refinement.after),
    crowding: crowding.crowding,
    after: crowdedCompact(crowding.crowding.after ? refToMetrics(crowding.crowding.after) : null)
  };
  if (name === 'f200') {
    const small = refineExperimentalV2Crowding(refined.staged, graph, { viewport: { width: 800, height: 600 }, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current' });
    const wide = refineExperimentalV2Crowding(refined.staged, graph, { viewport: { width: 1600, height: 900 }, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current' });
    report[name].secondViewport = {
      small: { viewport: { width: 800, height: 600 }, outcome: small.crowding.outcome, before: small.crowding.before?.metrics, after: small.crowding.after?.metrics, fit: small.crowding.after?.fit },
      wide: { viewport: { width: 1600, height: 900 }, outcome: wide.crowding.outcome, before: wide.crowding.before?.metrics, after: wide.crowding.after?.metrics, fit: wide.crowding.after?.fit }
    };
  }
}
function crowdedCompact(value) {
  if (!value) return null;
  if (value.metrics) {
    return {
      metrics: value.metrics,
      fit: value.fit,
      displacement: value.displacement
    };
  }
  return value;
}
function refToMetrics(value) {
  return { metrics: value.metrics, fit: value.fit, displacement: value.displacement };
}
console.log(JSON.stringify(report, null, 2));

