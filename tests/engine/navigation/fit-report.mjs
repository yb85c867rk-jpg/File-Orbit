import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  EXPERIMENTAL_CAMERA_LIMITS,
  calculateFitCamera
} from '../../../src/engine/hypertree/navigation/index.js';
import {
  stageExperimentalV2Layout,
  applyFixedGlyphPolicy
} from '../../../src/engine/hypertree/layout/index.js';
import { createProjection, prepareGraphScene } from '../../../src/engine/hypertree/render/index.js';
import { f20, f200 } from '../layout/fixtures.mjs';
import { crowdedFolder, mixedDeepWide } from '../layout/crowding-fixtures.mjs';

const viewport = { width: 1100, height: 473 };
const fixtures = { f20, f200, crowdedFolder, mixedDeepWide };
const report = {};
for (const [name, make] of Object.entries(fixtures)) {
  const tree = make();
  const { graph } = loadTree(tree);
  const staged = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
  const projection = createProjection({ ...viewport, radius: 240 * staged.feasibility.workspaceScale });
  const dims = new Map([...graph.nodes].map(([id, n]) => [id, Number(n.data.$dim) || 0]));
  const kinds = new Map([...graph.nodes].map(([id, n]) => [id, n.kind]));
  const base = prepareGraphScene(staged, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds });
  const fixed = applyFixedGlyphPolicy(base);
  const fit = calculateFitCamera({
    nodes: [...fixed.nodes.values()],
    viewport,
    padding: 24,
    presentation: { kind: 'fixed', glyphRadiusCss: 6 },
    projectionScale: staged.feasibility.workspaceScale,
    limits: EXPERIMENTAL_CAMERA_LIMITS
  });
  report[name] = {
    workspaceScale: staged.feasibility.workspaceScale,
    nodeCount: staged.nodeCount,
    visibleNodes: [...fixed.nodes.values()].filter((n) => n.visible).length,
    fit: {
      ok: fit.ok,
      reason: fit.reason,
      eligibleCount: fit.eligibleCount,
      containedCount: fit.containedCount,
      clippedCount: fit.clippedCount,
      requiredZoom: fit.requiredZoom,
      appliedZoom: fit.appliedZoom,
      panX: fit.camera?.panX ?? null,
      panY: fit.camera?.panY ?? null,
      padding: fit.padding,
      limits: fit.limits,
      toleranceCss: fit.toleranceCss
    }
  };
}
console.log(JSON.stringify(report, null, 2));

