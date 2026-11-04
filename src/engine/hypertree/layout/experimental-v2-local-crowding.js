import { createProjection } from '../render/coordinates.js';
import { prepareGraphScene } from '../render/scene.js';
import { applyCameraToScene } from '../navigation/camera-scene.js';
import { calculateFitCamera } from '../navigation/fit.js';
import { EXPERIMENTAL_CAMERA_LIMITS } from '../navigation/camera.js';
import { GraphRenderError } from '../render/errors.js';
import { applyFixedGlyphPolicy, READABLE_GLYPH_RADIUS_CSS } from './experimental-v2-presentation.js';
import { measurePreparedScene, shapesOverlap } from './experimental-metrics.js';

export const LOCAL_CROWDING_MAX_NODES = 400;
export const LOCAL_CROWDING_MAX_CANDIDATES = 6;
export const LOCAL_CROWDING_MAX_REGION = 24;
export const LOCAL_CROWDING_MAX_ANGLE_FRACTION = 0.2;
export const LOCAL_CROWDING_MAX_RADIAL_FRACTION = 0.75;
export const LOCAL_CROWDING_MAX_MEAN_SCREEN_CSS = 90;
export const LOCAL_CROWDING_MAX_SCREEN_CSS = 220;
export const LOCAL_CROWDING_MAX_UNRELATED_MEAN_CSS = 90;

/**
 * Opt-in local correction: only leaves in final-scene collision components may
 * move, and only inside their existing angular interval/radial headroom.
 */
export function refineExperimentalV2LocalCrowding(staged, graph, options = {}) {
  const viewport = options.viewport || { width: 1100, height: 473 };
  const phase = options.phase === undefined ? staged.firstPhase : options.phase;
  if (!staged || !(staged.nodes instanceof Map) || !staged.feasibility) {
    throw new GraphRenderError('invalid-local-crowding', 'v2 staged layout is required');
  }
  if (!graph || !(graph.nodes instanceof Map)) throw new GraphRenderError('invalid-local-crowding', 'graph is required');
  if (staged.nodeCount > LOCAL_CROWDING_MAX_NODES) {
    throw new GraphRenderError('local-crowding-input-limit', 'staged node count exceeds local bound');
  }
  if (typeof phase !== 'string' || !staged.phases.includes(phase)) {
    throw new GraphRenderError('invalid-phase', 'local crowding phase must be selected');
  }
  const base = evaluate(staged, graph, { ...options, viewport, phase });
  if (!base.metrics) {
    const crowding = summary('no-improving-candidate', base, base, 1, phase, 0, 0);
    attachResidual(crowding, base, staged);
    return { staged, crowding };
  }
  if (base.metrics.overlapPairs === 0) {
    const crowding = summary('no-crowding', base, base, 1, phase, 0, 0);
    attachResidual(crowding, base, staged);
    return { staged, crowding };
  }
  const leafIds = new Set();
  for (const [a, b] of base.overlaps) {
    if ((staged.children.get(a) || []).length === 0) leafIds.add(a);
    if ((staged.children.get(b) || []).length === 0) leafIds.add(b);
  }
  if (leafIds.size === 0) {
    return { staged, crowding: summary('no-improving-candidate', base, base, 1, phase, 0, 0) };
  }
  const regions = groupRegions(base.overlaps, leafIds, LOCAL_CROWDING_MAX_REGION);
  const affected = [...leafIds].filter((id) => regions.some((region) => region.has(id)));
  if (affected.length === 0) {
    return { staged, crowding: summary('no-improving-candidate', base, base, 1, phase, 0, regions.length) };
  }
  const neighbors = neighborMap(base.overlaps);
  const patterns = [
    { subset: 2, directional: true, radial: false },
    { subset: 3, directional: true, radial: false },
    { subset: 2, directional: false, radial: true },
    { subset: 3, directional: false, radial: true },
    { subset: 2, directional: true, radial: true },
    { subset: 3, directional: true, radial: true }
  ];
  const candidates = [];
  for (const pattern of patterns.slice(0, LOCAL_CROWDING_MAX_CANDIDATES - 1)) {
    const candidate = cloneStaged(staged);
    applyLocal(candidate, affected, neighbors, pattern);
    const evaluation = evaluate(candidate, graph, { ...options, viewport, phase });
    evaluation.displacement = displacement(base.centers, evaluation.centers);
    evaluation.unrelated = displacementOutside(base.centers, evaluation.centers, affected);
    evaluation.layoutDisplacement = layoutDisplacement(staged, candidate, affected);
    candidates.push({ staged: candidate, evaluation, pattern });
  }
  const baseWith = { ...base, displacement: { meanCss: 0, maxCss: 0, changedNodes: 0 }, unrelated: { meanCss: 0, maxCss: 0, changedNodes: 0 }, layoutDisplacement: { mean: 0, max: 0 } };
  let best = null;
  for (const candidate of candidates) {
    if (!acceptable(candidate.evaluation, baseWith, affected)) continue;
    if (!best || better(candidate.evaluation, best.evaluation)) best = candidate;
  }
  if (!best) {
    const crowding = summary('no-improving-candidate', baseWith, baseWith, 1 + Math.min(patterns.length, LOCAL_CROWDING_MAX_CANDIDATES - 1), phase, affected.length, regions.length, candidates);
    attachResidual(crowding, base, staged);
    return { staged, crowding };
  }
  const crowding = summary('accepted', baseWith, best.evaluation, 1 + Math.min(patterns.length, LOCAL_CROWDING_MAX_CANDIDATES - 1), phase, affected.length, regions.length, candidates, best.pattern);
  attachResidual(crowding, best.evaluation, best.staged);
  return { staged: best.staged, crowding };
}

function summary(outcome, before, after, attempts, phase, affectedCount, regionCount, candidates = [], pattern = null) {
  return {
    requested: true,
    applied: outcome === 'accepted',
    outcome,
    mode: 'local',
    attempts,
    candidateLimit: LOCAL_CROWDING_MAX_CANDIDATES,
    maxNodes: LOCAL_CROWDING_MAX_NODES,
    maxRegionNodes: LOCAL_CROWDING_MAX_REGION,
    phase,
    affectedCount,
    regionCount,
    selectedPattern: pattern,
    before: compact(before),
    after: compact(after),
    budgets: {
      maxAngleFraction: LOCAL_CROWDING_MAX_ANGLE_FRACTION,
      maxRadialFraction: LOCAL_CROWDING_MAX_RADIAL_FRACTION,
      maxMeanScreenCss: LOCAL_CROWDING_MAX_MEAN_SCREEN_CSS,
      maxScreenCss: LOCAL_CROWDING_MAX_SCREEN_CSS,
      maxUnrelatedMeanScreenCss: LOCAL_CROWDING_MAX_UNRELATED_MEAN_CSS
    },
    candidates: candidates.map((item) => ({
      pattern: item.pattern,
      overlapPairs: item.evaluation.metrics?.overlapPairs ?? null,
      displacement: item.evaluation.displacement,
      unrelated: item.evaluation.unrelated,
      layoutDisplacement: item.evaluation.layoutDisplacement
    })),
    scope: 'local leaf collision regions; angular spans and branch sectors unchanged'
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
    displacement: evaluation.displacement,
    unrelated: evaluation.unrelated,
    layoutDisplacement: evaluation.layoutDisplacement
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
  return {
    metrics: measurePreparedScene(final, { viewport: options.viewport, maxNodes: LOCAL_CROWDING_MAX_NODES }),
    fit: { ok: true, eligibleCount: fit.eligibleCount, containedCount: fit.containedCount, clippedCount: fit.clippedCount, zoom: fit.appliedZoom },
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

function acceptable(candidate, base, affected) {
  if (!candidate.metrics || !candidate.fit.ok) return false;
  if (candidate.fit.clippedCount !== 0 || candidate.fit.containedCount !== candidate.fit.eligibleCount) return false;
  if (candidate.metrics.visibleNodes !== base.metrics.visibleNodes) return false;
  if (candidate.metrics.overlapPairs >= base.metrics.overlapPairs) return false;
  if (!localMovementWithinBudgets(candidate)) return false;
  const affectedSet = new Set(affected);
  const basePairs = new Set(base.overlaps.map(pairKey));
  for (const [a, b] of candidate.overlaps) {
    if (!basePairs.has(pairKey([a, b])) && (!affectedSet.has(a) || !affectedSet.has(b))) return false;
  }
  return true;
}

function better(a, b) {
  if (a.metrics.overlapPairs !== b.metrics.overlapPairs) return a.metrics.overlapPairs < b.metrics.overlapPairs;
  return a.displacement.meanCss < b.displacement.meanCss;
}

function applyLocal(staged, affected, neighbors, pattern) {
  const config = staged.experiment.config;
  const sorted = [...affected].sort((a, b) => a.localeCompare(b));
  for (let index = 0; index < sorted.length; index += 1) {
    if (index % pattern.subset !== 0) continue;
    const id = sorted[index];
    const node = staged.nodes.get(id);
    const relation = parentOf(staged, id);
    if (!relation) continue;
    const parent = staged.nodes.get(relation.parentId);
    const lower = parent.radialRadius + config.minStep;
    const upper = 1 - config.safetyMargin - config.minStep * (staged.maxDepth - node.depth);
    let rho = node.radialRadius;
    if (pattern.radial) rho = Math.max(lower, rho - 0.1 * (upper - lower));
    let theta = (node.angleSpan.begin + node.angleSpan.end) / 2;
    if (pattern.directional) {
      const angles = (neighbors.get(id) || []).map((otherId) => staged.nodes.get(otherId)?.positions.get('current')?.theta).filter(Number.isFinite);
      if (angles.length > 0) {
        const avg = angles.reduce((sum, value) => sum + value, 0) / angles.length;
        const direction = avg <= theta ? 1 : -1;
        const maxShift = (node.angleSpan.end - node.angleSpan.begin) * LOCAL_CROWDING_MAX_ANGLE_FRACTION;
        theta = clamp(theta + direction * maxShift, node.angleSpan.begin + 1e-9, node.angleSpan.end - 1e-9);
      }
    }
    node.radialRadius = rho;
    node.parentRadialRadius = parent.radialRadius;
    for (const phase of staged.phases) node.positions.set(phase, { theta, rho });
    staged.radialById.set(id, rho);
    staged.parentRadialById.set(id, parent.radialRadius);
    staged.placementRadiiById.set(id, rho);
  }
}
function parentOf(staged, id) {
  for (const [parentId, children] of staged.children) {
    if (children.includes(id)) return { parentId };
  }
  return null;
}

function groupRegions(pairs, leafIds, maxSize) {
  const parent = new Map();
  const find = (id) => {
    if (!parent.has(id)) parent.set(id, id);
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(id) !== root) { const next = parent.get(id); parent.set(id, root); id = next; }
    return root;
  };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const [a, b] of pairs) if (leafIds.has(a) && leafIds.has(b)) union(a, b);
  const groups = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, new Set());
    groups.get(root).add(id);
  }
  return [...groups.values()].filter((group) => group.size <= maxSize);
}

function neighborMap(pairs) {
  const map = new Map();
  for (const [a, b] of pairs) {
    if (!map.has(a)) map.set(a, []);
    if (!map.has(b)) map.set(b, []);
    map.get(a).push(b);
    map.get(b).push(a);
  }
  return map;
}

function displacement(before, after) {
  return measureDisplacement(before, after);
}

function displacementOutside(before, after, affected) {
  const set = new Set(affected);
  const filteredBefore = new Map([...before].filter(([id]) => !set.has(id)));
  const filteredAfter = new Map([...after].filter(([id]) => !set.has(id)));
  return measureDisplacement(filteredBefore, filteredAfter);
}

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

function layoutDisplacement(before, after, affected) {
  let total = 0;
  let max = 0;
  for (const id of affected) {
    const a = before.nodes.get(id).positions.get('current');
    const b = after.nodes.get(id).positions.get('current');
    const value = Math.hypot(a.theta - b.theta, a.rho - b.rho);
    total += value;
    max = Math.max(max, value);
  }
  return { mean: affected.length ? total / affected.length : 0, max };
}

function pairKey([a, b]) { return `${a}\u0000${b}`; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

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
export function localMovementWithinBudgets(evaluation) {
  if (!evaluation || !evaluation.displacement || !evaluation.unrelated || !evaluation.layoutDisplacement) return false;
  return evaluation.displacement.meanCss <= LOCAL_CROWDING_MAX_MEAN_SCREEN_CSS
    && evaluation.displacement.maxCss <= LOCAL_CROWDING_MAX_SCREEN_CSS
    && evaluation.unrelated.meanCss <= LOCAL_CROWDING_MAX_UNRELATED_MEAN_CSS
    && evaluation.layoutDisplacement.max <= LOCAL_CROWDING_MAX_ANGLE_FRACTION + LOCAL_CROWDING_MAX_RADIAL_FRACTION;
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
      sample.push({ a, b, depthA: da, depthB: db, aCenter: evaluation.centers?.get(a), bCenter: evaluation.centers?.get(b) });
    }
  }
  crowding.residualPairCount = pairs.length;
  crowding.residualByDepth = byDepth;
  crowding.residualSample = sample;
}
