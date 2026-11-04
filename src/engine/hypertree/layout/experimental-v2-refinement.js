import { GraphRenderError } from '../render/errors.js';
import { createProjection } from '../render/coordinates.js';
import { prepareGraphScene } from '../render/scene.js';
import { applyCameraToScene } from '../navigation/camera-scene.js';
import { calculateFitCamera } from '../navigation/fit.js';
import { EXPERIMENTAL_CAMERA_LIMITS } from '../navigation/camera.js';
import { applyFixedGlyphPolicy, READABLE_GLYPH_RADIUS_CSS } from './experimental-v2-presentation.js';
import { measurePreparedScene } from './experimental-metrics.js';

export const REFINEMENT_MAX_CANDIDATES = 4;
export const REFINEMENT_MIN_BOUNDARY_GAIN_CSS = 0.25;

/**
 * Opt-in refinement of an existing v2 staged layout.
 * Candidates change only sibling band assignment; angular sectors, order,
 * depths, and phases remain the v2 values. Every candidate is evaluated after
 * its own whole-graph fit and fixed-glyph transform.
 */
export function refineExperimentalV2Layout(staged, graph, options = {}) {
  const viewport = options.viewport || { width: 1100, height: 473 };
  const phase = options.phase === undefined ? staged.firstPhase : options.phase;
  if (typeof phase !== 'string' || !staged.phases.includes(phase)) {
    throw new GraphRenderError('invalid-phase', 'refinement phase must be one of the staged phases');
  }
  const padding = options.padding === undefined ? 24 : options.padding;
  const diagnosticMaxNodes = options.diagnosticMaxNodes;
  const projectionBaseRadiusCss = options.projectionBaseRadiusCss || 198.66;
  const workspaceScale = staged.feasibility && staged.feasibility.workspaceScale;
  const bandCount = staged.experiment?.config?.bandCount || 2;
  if (!staged || !(staged.nodes instanceof Map) || !staged.feasibility) {
    throw new GraphRenderError('invalid-refinement', 'v2 staged layout is required');
  }
  if (!graph || !(graph.nodes instanceof Map)) {
    throw new GraphRenderError('invalid-refinement', 'graph is required');
  }
  if (!Number.isFinite(workspaceScale) || workspaceScale <= 0) {
    throw new GraphRenderError('invalid-refinement', 'v2 workspace scale is required');
  }
  const base = evaluateCandidate(staged, graph, {
    viewport, padding, projectionBaseRadiusCss, workspaceScale, phase, diagnosticMaxNodes
  });
  const patterns = [{ kind: 'shift', shift: 0, label: 'base' }];
  for (let shift = 1; shift <= Math.min(REFINEMENT_MAX_CANDIDATES - 1, Math.max(0, bandCount - 1)); shift += 1) {
    patterns.push({ kind: 'shift', shift, label: 'shift-' + shift });
  }
  if (bandCount > 1 && patterns.length < REFINEMENT_MAX_CANDIDATES) {
    patterns.push({ kind: 'depth', label: 'depth-stagger' });
  }
  if (base.metrics) {
    base.metrics.displacementFromBase = { meanCss: 0, maxCss: 0, changedNodes: 0 };
  }
  const candidates = [{ pattern: patterns[0], staged, evaluation: base }];
  for (const pattern of patterns.slice(1)) {
    const candidate = cloneStaged(staged);
    reband(candidate, pattern);
    const evaluation = evaluateCandidate(candidate, graph, {
      viewport, padding, projectionBaseRadiusCss, workspaceScale, phase, diagnosticMaxNodes
    });
    if (evaluation.metrics && base.screenCenters) {
      evaluation.metrics.displacementFromBase = displacement(base.screenCenters, evaluation.screenCenters);
    }
    candidates.push({ pattern, staged: candidate, evaluation });
  }
  let best = candidates[0];
  for (const candidate of candidates.slice(1)) {
    if (improves(candidate.evaluation, best.evaluation)) best = candidate;
  }
  const accepted = best.pattern.kind !== 'base' && improves(best.evaluation, base);
  return {
    staged: accepted ? best.staged : staged,
    refinement: {
      requested: true,
      applied: accepted,
      outcome: accepted ? 'accepted' : 'no-improving-candidate',
      selectedCandidateIndex: accepted ? candidates.indexOf(best) : 0,
      selectedPattern: accepted ? best.pattern.label : 'base',
      attempts: candidates.length,
      candidateLimit: REFINEMENT_MAX_CANDIDATES,
      bandCount,
      minimumBoundaryGainCss: REFINEMENT_MIN_BOUNDARY_GAIN_CSS,
      phase,
      before: base.metrics,
      after: accepted ? best.evaluation.metrics : base.metrics,
      beforeFit: base.fitSummary,
      afterFit: accepted ? best.evaluation.fitSummary : base.fitSummary,
      presentation: {
        fixedGlyphRadiusCss: READABLE_GLYPH_RADIUS_CSS,
        projectionBaseRadiusCss,
        workspaceScale,
        viewport,
        padding
      }
    }
  };
}

function evaluateCandidate(staged, graph, options) {
  const projection = createProjection({
    width: options.viewport.width,
    height: options.viewport.height,
    radius: options.projectionBaseRadiusCss * options.workspaceScale
  });
  const nodeDims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const nodeKinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  const baseScene = prepareGraphScene(staged, {
    phase: options.phase, projection, nodeDims, nodeKinds
  });
  const fixedBase = applyFixedGlyphPolicy(baseScene, { radius: READABLE_GLYPH_RADIUS_CSS });
  const fit = calculateFitCamera({
    nodes: [...fixedBase.nodes.values()],
    viewport: options.viewport,
    padding: options.padding,
    presentation: { kind: 'fixed', glyphRadiusCss: READABLE_GLYPH_RADIUS_CSS },
    projectionScale: options.workspaceScale,
    limits: EXPERIMENTAL_CAMERA_LIMITS
  });
  if (!fit.ok) {
    return {
      contained: false,
      fitSummary: { ok: false, reason: fit.reason },
      metrics: null
    };
  }
  const cameraScene = applyCameraToScene(fixedBase, fit.camera, options.viewport, EXPERIMENTAL_CAMERA_LIMITS);
  const finalScene = applyFixedGlyphPolicy(cameraScene, { radius: READABLE_GLYPH_RADIUS_CSS });
  const metrics = measurePreparedScene(finalScene, { viewport: options.viewport, maxNodes: options.diagnosticMaxNodes });
  return {
    contained: fit.containedCount === fit.eligibleCount && fit.clippedCount === 0,
    fitSummary: {
      ok: fit.ok,
      zoom: fit.appliedZoom,
      eligibleCount: fit.eligibleCount,
      containedCount: fit.containedCount,
      clippedCount: fit.clippedCount
    },
    metrics: {
      ...metrics,
      minimumGlyphBoundarySeparationCss: metrics.minimumShapeBoundarySeparationCss
    },
    screenCenters: new Map([...finalScene.nodes].map(([id, node]) => [id, node.center]))
  };
}

function improves(candidate, base) {
  if (!candidate.contained || !candidate.metrics) return false;
  if (!base.metrics) return true;
  if (candidate.metrics.visibleNodes !== base.metrics.visibleNodes) return false;
  if (candidate.metrics.overlapPairs < base.metrics.overlapPairs) return true;
  if (candidate.metrics.overlapPairs > base.metrics.overlapPairs) return false;
  const candidateGap = candidate.metrics.minimumGlyphBoundarySeparationCss;
  const baseGap = base.metrics.minimumGlyphBoundarySeparationCss;
  return candidateGap !== null && baseGap !== null
    && candidateGap > baseGap + REFINEMENT_MIN_BOUNDARY_GAIN_CSS;
}

function reband(staged, pattern) {
  const config = staged.experiment.config;
  const maxDepth = staged.maxDepth;
  const bandCount = config.bandCount;
  for (const [parentId, childIds] of staged.children) {
    const parent = staged.nodes.get(parentId);
    if (!parent || childIds.length === 0) continue;
    const parentRho = parent.radialRadius;
    for (let index = 0; index < childIds.length; index += 1) {
      const child = staged.nodes.get(childIds[index]);
      child.bandIndex = pattern.kind === 'depth'
        ? (index + parent.depth) % bandCount
        : (index + pattern.shift) % bandCount;
      const lower = parentRho + config.minStep;
      const upper = 1 - config.safetyMargin - config.minStep * (maxDepth - child.depth);
      if (!Number.isFinite(upper) || upper < lower) {
        throw new GraphRenderError('experimental-v2-refinement-infeasible', 'radial band is invalid');
      }
      const fraction = bandCount === 1 ? 1 : 0.2 + 0.8 * child.bandIndex / (bandCount - 1);
      const rho = lower + config.radialFlex * fraction * (upper - lower);
      child.radialRadius = rho;
      child.parentRadialRadius = parentRho;
      for (const phase of staged.phases) {
        child.positions.set(phase, {
          theta: (child.angleSpan.begin + child.angleSpan.end) / 2,
          rho
        });
      }
      if (staged.radialById) staged.radialById.set(child.id, rho);
      if (staged.parentRadialById) staged.parentRadialById.set(child.id, parentRho);
      if (staged.placementRadiiById) staged.placementRadiiById.set(child.id, rho);
    }
  }
}

function cloneStaged(staged) {
  const positions = (node) => new Map([...node.positions].map(([phase, p]) => [phase, { ...p }]));
  const nodes = new Map();
  for (const [id, node] of staged.nodes) {
    nodes.set(id, {
      ...node,
      angleSpan: node.angleSpan ? { ...node.angleSpan } : node.angleSpan,
      positions: positions(node),
      spans: new Map(node.spans),
      dimQuotients: node.dimQuotients ? new Map(node.dimQuotients) : null
    });
  }
  return {
    ...staged,
    phases: [...staged.phases],
    experiment: clonePlain(staged.experiment),
    feasibility: clonePlain(staged.feasibility),
    nodes,
    depths: new Map(staged.depths),
    demandById: new Map(staged.demandById),
    allocatedSpanById: new Map(staged.allocatedSpanById),
    radialById: new Map(staged.radialById),
    parentRadialById: new Map(staged.parentRadialById),
    placementRadiiById: new Map(staged.placementRadiiById),
    scales: new Map(staged.scales),
    children: new Map([...staged.children].map(([id, ids]) => [id, [...ids]]))
  };
}
function displacement(baseCenters, candidateCenters) {
  let total = 0;
  let max = 0;
  let changed = 0;
  let count = 0;
  for (const [id, base] of baseCenters) {
    const candidate = candidateCenters.get(id);
    if (!candidate) continue;
    const distance = Math.hypot(candidate.x - base.x, candidate.y - base.y);
    total += distance;
    max = Math.max(max, distance);
    if (distance > 1e-9) changed += 1;
    count += 1;
  }
  return { meanCss: count === 0 ? 0 : total / count, maxCss: max, changedNodes: changed };
}
function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (value && typeof value === 'object') {
    const copy = {};
    for (const [key, item] of Object.entries(value)) copy[key] = clonePlain(item);
    return copy;
  }
  return value;
}
