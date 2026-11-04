import { createProjection } from '../render/coordinates.js';
import { prepareGraphScene } from '../render/scene.js';
import { applyCameraToScene } from '../navigation/camera-scene.js';
import { calculateFitCamera } from '../navigation/fit.js';
import { EXPERIMENTAL_CAMERA_LIMITS } from '../navigation/camera.js';
import { GraphRenderError } from '../render/errors.js';
import { applyFixedGlyphPolicy, READABLE_GLYPH_RADIUS_CSS } from './experimental-v2-presentation.js';
import { measurePreparedScene, shapesOverlap } from './experimental-metrics.js';

export const CROWDING_MAX_NODES = 400;
export const CROWDING_MAX_CANDIDATES = 5;
export const CROWDING_MIN_BOUNDARY_GAIN_CSS = 0.25;

/**
 * Opt-in collision-aware correction.
 * Adjusts subtree angular sectors and individual radial lanes, then evaluates
 * every candidate after whole-graph fit and fixed-glyph rendering.
 */
export function refineExperimentalV2Crowding(staged, graph, options = {}) {
  const viewport = options.viewport || { width: 1100, height: 473 };
  const phase = options.phase === undefined ? staged.firstPhase : options.phase;
  if (!staged || !(staged.nodes instanceof Map) || !staged.feasibility) {
    throw new GraphRenderError('invalid-crowding', 'v2 staged layout is required');
  }
  if (!graph || !(graph.nodes instanceof Map)) throw new GraphRenderError('invalid-crowding', 'graph is required');
  if (staged.nodeCount > CROWDING_MAX_NODES) {
    throw new GraphRenderError('crowding-input-limit', 'staged node count exceeds crowding bound');
  }
  if (typeof phase !== 'string' || !staged.phases.includes(phase)) {
    throw new GraphRenderError('invalid-phase', 'crowding phase must be one of the staged phases');
  }
  if (!Number.isFinite(staged.feasibility.workspaceScale) || staged.feasibility.workspaceScale <= 0) {
    throw new GraphRenderError('invalid-crowding', 'workspace scale is required');
  }
  const base = evaluate(staged, graph, { ...options, viewport, phase });
  if (!base.metrics) {
    return { staged, crowding: result('no-improving-candidate', base, base, 1, phase) };
  }
  if (base.metrics.overlapPairs === 0) {
    return { staged, crowding: result('no-crowding', base, base, 1, phase) };
  }
  base.displacement = { meanCss: 0, maxCss: 0, changedNodes: 0 };
  const patterns = [
    { lanes: 4, angularPower: 4 },
    { lanes: 6, angularPower: 8 },
    { lanes: 8, angularPower: 8 },
    { lanes: 6, angularPower: 16 }
  ];
  const candidates = [];
  for (const pattern of patterns.slice(0, CROWDING_MAX_CANDIDATES - 1)) {
    let candidate;
    try {
      candidate = cloneStaged(staged);
      applyCorrection(candidate, pattern);
    } catch {
      continue;
    }
    const evaluation = evaluate(candidate, graph, { ...options, viewport, phase });
    evaluation.displacement = measureDisplacement(base.centers, evaluation.centers);
    candidate.crowdingPattern = pattern;
    candidates.push({ staged: candidate, evaluation, pattern });
  }
  let best = null;
  for (const candidate of candidates) {
    if (!improves(candidate.evaluation, base.evaluation || base)) continue;
    if (!best || better(candidate.evaluation, best.evaluation)) best = candidate;
  }
  if (!best) {
    const crowding = result('no-improving-candidate', base, base, 1 + patterns.length, phase, null, candidates);
    attachResidual(crowding, base, staged);
    return { staged, crowding };
  }
  const crowding = result('accepted', base, best.evaluation, 1 + patterns.length, phase, best.pattern, candidates);
  attachResidual(crowding, best.evaluation, best.staged);
  return { staged: best.staged, crowding };
}

function result(outcome, before, after, attempts, phase, pattern = null, candidates = []) {
  return {
    requested: true,
    applied: outcome === 'accepted',
    outcome,
    attempts,
    candidateLimit: CROWDING_MAX_CANDIDATES,
    maxNodes: CROWDING_MAX_NODES,
    phase,
    selectedPattern: pattern,
    before: compact(before),
    after: compact(after),
    minimumBoundaryGainCss: CROWDING_MIN_BOUNDARY_GAIN_CSS,
    candidates: candidates.map((item) => ({ pattern: item.pattern, overlapPairs: item.evaluation.metrics?.overlapPairs ?? null, fit: item.evaluation.fit })),
    scope: 'final fitted fixed-glyph node geometry; labels separate'
  };
}

function compact(evaluation) {
  if (!evaluation || !evaluation.metrics) return null;
  return {
    metrics: {
      totalNodes: evaluation.metrics.totalNodes,
      visibleNodes: evaluation.metrics.visibleNodes,
      hiddenNodes: evaluation.metrics.hiddenNodes,
      overlapPairs: evaluation.metrics.overlapPairs,
      minCenterSeparation: evaluation.metrics.minCenterSeparation,
      minimumShapeBoundarySeparationCss: evaluation.metrics.minimumShapeBoundarySeparationCss
    },
    fit: evaluation.fit,
    displacement: evaluation.displacement || { meanCss: 0, maxCss: 0, changedNodes: 0 }
  };
}

function evaluate(staged, graph, options) {
  const projection = createProjection({
    width: options.viewport.width,
    height: options.viewport.height,
    radius: (options.projectionBaseRadiusCss || 198.66) * staged.feasibility.workspaceScale
  });
  const dims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const kinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  const base = prepareGraphScene(staged, { phase: options.phase, projection, nodeDims: dims, nodeKinds: kinds });
  const fixed = applyFixedGlyphPolicy(base);
  const fit = calculateFitCamera({
    nodes: [...fixed.nodes.values()], viewport: options.viewport,
    padding: options.padding === undefined ? 24 : options.padding,
    presentation: { kind: 'fixed', glyphRadiusCss: READABLE_GLYPH_RADIUS_CSS },
    projectionScale: staged.feasibility.workspaceScale,
    limits: EXPERIMENTAL_CAMERA_LIMITS
  });
  if (!fit.ok) return { metrics: null, fit: { ok: false, reason: fit.reason }, overlaps: [], centers: new Map() };
  const final = applyFixedGlyphPolicy(applyCameraToScene(fixed, fit.camera, options.viewport, EXPERIMENTAL_CAMERA_LIMITS));
  const metrics = measurePreparedScene(final, { viewport: options.viewport, maxNodes: CROWDING_MAX_NODES });
  return {
    metrics,
    fit: {
      ok: true,
      eligibleCount: fit.eligibleCount,
      containedCount: fit.containedCount,
      clippedCount: fit.clippedCount,
      zoom: fit.appliedZoom
    },
    overlaps: overlaps(final),
    centers: new Map([...final.nodes].map(([id, node]) => [id, node.center]))
  };
}

function overlaps(scene) {
  const nodes = [...scene.nodes.values()].filter((n) => n.visible);
  const pairs = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (shapesOverlap(nodes[i], nodes[j])) pairs.push([nodes[i].id, nodes[j].id]);
    }
  }
  return pairs;
}

function improves(candidate, base) {
  if (!candidate.metrics || !base.metrics) return false;
  if (candidate.fit.clippedCount !== 0 || candidate.fit.containedCount !== candidate.fit.eligibleCount) return false;
  if (candidate.metrics.visibleNodes !== base.metrics.visibleNodes) return false;
  if (candidate.metrics.overlapPairs < base.metrics.overlapPairs) return true;
  if (candidate.metrics.overlapPairs > base.metrics.overlapPairs) return false;
  return candidate.metrics.minimumShapeBoundarySeparationCss > base.metrics.minimumShapeBoundarySeparationCss + CROWDING_MIN_BOUNDARY_GAIN_CSS;
}

function better(a, b) {
  if (a.metrics.overlapPairs !== b.metrics.overlapPairs) return a.metrics.overlapPairs < b.metrics.overlapPairs;
  return a.metrics.minimumShapeBoundarySeparationCss > b.metrics.minimumShapeBoundarySeparationCss;
}

function applyCorrection(staged, pattern) {
  const config = staged.experiment.config;
  const maxDepth = staged.maxDepth;
  assign(staged.rootId, staged.nodes.get(staged.rootId).angleSpan.begin, staged.nodes.get(staged.rootId).angleSpan.end, 0);
  function assign(id, begin, end, depth) {
    const node = staged.nodes.get(id);
    node.angleSpan = { begin, end };
    staged.allocatedSpanById.set(id, end - begin);
    for (const phase of staged.phases) {
      const position = node.positions.get(phase);
      node.positions.set(phase, { theta: (begin + end) / 2, rho: position.rho });
      node.spans.set(phase, end - begin);
    }
    const children = staged.children.get(id) || [];
    if (children.length === 0) return;
    const weights = children.map((childId) => Math.pow(staged.demandById.get(childId) || 1, pattern.angularPower));
    const total = weights.reduce((sum, value) => sum + value, 0);
    let cursor = begin;
    for (let index = 0; index < children.length; index += 1) {
      const childId = children[index];
      const span = (end - begin) * weights[index] / total;
      const child = staged.nodes.get(childId);
      const parentRho = node.radialRadius;
      const lower = parentRho + config.minStep;
      const upper = 1 - config.safetyMargin - config.minStep * (maxDepth - child.depth);
      const isLeaf = (staged.children.get(childId) || []).length === 0;
      const lane = (index + depth) % pattern.lanes;
      const fraction = (lane + 0.5) / pattern.lanes;
      const rho = isLeaf ? lower + config.radialFlex * fraction * (upper - lower) : child.radialRadius;
      child.radialRadius = rho;
      child.parentRadialRadius = parentRho;
      child.bandIndex = lane;
      for (const phase of staged.phases) {
        child.positions.set(phase, { theta: cursor + span / 2, rho });
      }
      staged.radialById.set(childId, rho);
      staged.parentRadialById.set(childId, parentRho);
      staged.placementRadiiById.set(childId, rho);
      assign(childId, cursor, cursor + span, depth + 1);
      cursor += span;
    }
  }
}
function cloneStaged(staged) {
  const nodes = new Map();
  for (const [id, node] of staged.nodes) {
    nodes.set(id, {
      ...node,
      angleSpan: { ...node.angleSpan },
      positions: new Map([...node.positions].map(([phase, p]) => [phase, { ...p }])),
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

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (value && typeof value === 'object') {
    const copy = {};
    for (const [key, item] of Object.entries(value)) copy[key] = clonePlain(item);
    return copy;
  }
  return value;
}
function attachResidual(crowding, evaluation, staged) {
  const pairs = evaluation.overlaps || [];
  const byDepth = {};
  const sample = [];
  for (const [a, b] of pairs) {
    const da = staged.nodes.get(a)?.depth;
    const db = staged.nodes.get(b)?.depth;
    byDepth[da] = (byDepth[da] || 0) + 1;
    byDepth[db] = (byDepth[db] || 0) + 1;
    if (sample.length < 10) {
      const ca = evaluation.centers?.get(a);
      const cb = evaluation.centers?.get(b);
      sample.push({ a, b, depthA: da, depthB: db, aCenter: ca, bCenter: cb });
    }
  }
  crowding.residualPairCount = pairs.length;
  crowding.residualPairs = pairs;
  crowding.residualByDepth = byDepth;
  crowding.residualSample = sample;
}
/** Mean/max fitted-screen displacement by stable ID, plus changed count. */
export function measureDisplacement(beforeCenters, afterCenters) {
  let total = 0;
  let max = 0;
  let changed = 0;
  let count = 0;
  for (const [id, before] of beforeCenters) {
    const after = afterCenters.get(id);
    if (!after) continue;
    const distance = Math.hypot(after.x - before.x, after.y - before.y);
    total += distance;
    max = Math.max(max, distance);
    if (distance > 1e-9) changed += 1;
    count += 1;
  }
  return { meanCss: count === 0 ? 0 : total / count, maxCss: max, changedNodes: changed };
}


