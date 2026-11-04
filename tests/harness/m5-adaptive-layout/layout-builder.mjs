import { loadTree as defaultLoadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  stageRadialLayout as defaultStageBaseline,
  stageExperimentalLayout as defaultStageV1,
  stageExperimentalV2Layout as defaultStageV2,
  refineExperimentalV2Layout as defaultRefine,
  refineExperimentalV2Crowding as defaultCrowd,
  refineExperimentalV2LocalCrowding as defaultLocalCrowd
} from '../../../src/engine/hypertree/layout/index.js';

/**
 * Shared stage sequencing for the adaptive-layout harness.
 * v2 -> refinement (if requested) -> crowding correction (if requested).
 */
export function buildLayoutPlan({
  mode,
  tree,
  config = {},
  phases = ['current', 'start', 'end'],
  viewport,
  baseRadiusCss,
  phase,
  refine = false,
  crowd = false,
  correction = null,
  implementations = {}
}) {
  const loadTree = implementations.loadTree || defaultLoadTree;
  const stageBaseline = implementations.stageBaseline || defaultStageBaseline;
  const stageV1 = implementations.stageV1 || defaultStageV1;
  const stageV2 = implementations.stageV2 || defaultStageV2;
  const refineV2 = implementations.refine || defaultRefine;
  const crowdV2 = implementations.crowd || defaultCrowd;
  const localCrowdV2 = implementations.localCrowd || defaultLocalCrowd;
  const correctionMode = correction || (crowd ? 'global' : 'off');
  const { graph } = loadTree(tree);
  const options = {
    viewport,
    padding: 24,
    phase,
    projectionBaseRadiusCss: baseRadiusCss
  };
  let staged;
  let workspaceScale = 1;
  if (mode === 'v2') {
    staged = stageV2(graph, {
      rootId: tree.id,
      phases,
      nodeOptions: { overridable: true },
      experimentV2: { ...config, referenceProjectionRadiusCss: baseRadiusCss }
    });
    workspaceScale = staged.feasibility.workspaceScale;
  } else if (mode === 'v1') {
    staged = stageV1(graph, { rootId: tree.id, phases, nodeOptions: { overridable: true }, experiment: config });
  } else {
    staged = stageBaseline(graph, { rootId: tree.id, phases, nodeOptions: { overridable: true }, radius: 100, offset: 0.1 });
  }

  let refinement = null;
  let crowding = null;
  if (mode === 'v2' && refine) {
    const result = refineV2(staged, graph, options);
    staged = result.staged;
    refinement = result.refinement;
  }
  if (mode === 'v2' && correctionMode === 'global') {
    const result = crowdV2(staged, graph, options);
    staged = result.staged;
    crowding = result.crowding;
  } else if (mode === 'v2' && correctionMode === 'local') {
    const result = localCrowdV2(staged, graph, options);
    staged = result.staged;
    crowding = result.crowding;
  }
  return {
    tree,
    graph,
    staged,
    config,
    workspaceScale,
    feasibility: staged.feasibility || null,
    refinement,
    crowding,
    correctionMode
  };
}

