import { GraphRenderError } from '../render/errors.js';

export const DIAGNOSTIC_MAX_NODES = 300;
export const FIXED_DIAGNOSTIC_RADIUS_CSS = 6;

/**
 * Diagnostic metrics for comparing staged/prepared layouts.
 * All costs are O(N^2) and intended for the bounded comparison fixtures only.
 */
export function measurePreparedScene(scene, options = {}) {
  const limit = options.maxNodes === undefined ? DIAGNOSTIC_MAX_NODES : options.maxNodes;
  ensureDiagnosticBound(scene.nodes.size, limit);
  const all = [...scene.nodes.values()];
  const nodes = all.filter((node) => node.visible && node.radius > 0);
  const result = countOverlapPairs(nodes);
  const viewport = options.viewport || { width: 800, height: 600 };
  const viewportIntersectingNodes = nodes.filter((node) => (
    node.center.x - node.radius < viewport.width && node.center.x + node.radius > 0
    && node.center.y - node.radius < viewport.height && node.center.y + node.radius > 0
  )).length;
  return {
    totalNodes: all.length,
    visibleNodes: nodes.length,
    hiddenNodes: all.length - nodes.length,
    viewportIntersectingNodes,
    visibleIds: nodes.map((node) => node.id),
    hiddenIds: all.filter((node) => !node.visible || node.radius <= 0).map((node) => node.id),
    overlapPairs: result.overlaps,
    minCenterSeparation: result.minSeparation,
    minimumShapeBoundarySeparationCss: minimumShapeBoundarySeparation(nodes),
    bounds: result.bounds,
    radiusStats: {
      all: radiusStats(all.map((node) => node.radius)),
      visible: radiusStats(nodes.map((node) => node.radius))
    }
  };
}

export function comparePreparedScenes(baseline, experimental, options = {}) {
  const fixedRadius = options.fixedRadius === undefined ? FIXED_DIAGNOSTIC_RADIUS_CSS : options.fixedRadius;
  if (!Number.isFinite(fixedRadius) || fixedRadius <= 0) {
    throw new GraphRenderError('invalid-diagnostic', 'fixed diagnostic radius must be positive');
  }
  const baselineMetrics = measurePreparedScene(baseline, options);
  const experimentalMetrics = measurePreparedScene(experimental, options);
  const baselineIds = new Set(baseline.nodes.keys());
  const experimentalIds = new Set(experimental.nodes.keys());
  const baselineVisible = new Set(baselineMetrics.visibleIds);
  const experimentalVisible = new Set(experimentalMetrics.visibleIds);
  const newlyHiddenIds = [...baselineVisible].filter((id) => !experimentalVisible.has(id) && experimentalIds.has(id));
  const newlyVisibleIds = [...experimentalVisible].filter((id) => !baselineVisible.has(id) && baselineIds.has(id));
  const commonVisibleIds = [...baselineVisible].filter((id) => experimentalVisible.has(id));
  const commonNodes = (scene) => commonVisibleIds.map((id) => scene.nodes.get(id)).filter(Boolean);
  const commonBaseline = countOverlapPairs(commonNodes(baseline));
  const commonExperimental = countOverlapPairs(commonNodes(experimental));
  const fixedBaseline = countFixedOverlap(baseline.nodes.values(), fixedRadius, baseline);
  const fixedExperimental = countFixedOverlap(experimental.nodes.values(), fixedRadius, experimental);
  return {
    totalNodes: { baseline: baselineMetrics.totalNodes, experimental: experimentalMetrics.totalNodes },
    visible: { baseline: baselineMetrics.visibleNodes, experimental: experimentalMetrics.visibleNodes },
    hidden: { baseline: baselineMetrics.hiddenNodes, experimental: experimentalMetrics.hiddenNodes },
    viewportIntersecting: { baseline: baselineMetrics.viewportIntersectingNodes, experimental: experimentalMetrics.viewportIntersectingNodes },
    newlyHiddenIds,
    newlyVisibleIds,
    visibleOverlap: { baseline: baselineMetrics.overlapPairs, experimental: experimentalMetrics.overlapPairs },
    sameIdsVisibleBoth: {
      count: commonVisibleIds.length,
      baselineOverlap: commonBaseline.overlaps,
      experimentalOverlap: commonExperimental.overlaps
    },
    fixedSizeDiagnostic: {
      radiusCss: fixedRadius,
      shapeAware: true,
      sample: 'all nodes in the scene; visibility ignored',
      baselineOverlap: fixedBaseline,
      experimentalOverlap: fixedExperimental,
      provenance: 'analytical only; actual rendering/hit radii unchanged'
    },
    radiusStats: {
      baseline: baselineMetrics.radiusStats,
      experimental: experimentalMetrics.radiusStats
    },
    bounds: { baseline: baselineMetrics.bounds, experimental: experimentalMetrics.bounds },
    minCenterSeparation: {
      baseline: baselineMetrics.minCenterSeparation,
      experimental: experimentalMetrics.minCenterSeparation
    },
    diagnosticLimit: DIAGNOSTIC_MAX_NODES
  };
}

function ensureDiagnosticBound(nodeCount, limit) {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new GraphRenderError('invalid-diagnostic', 'diagnostic node limit must be a positive safe integer');
  }
  if (nodeCount > limit) {
    throw new GraphRenderError('diagnostic-limit', 'pairwise diagnostics reject ' + nodeCount + ' nodes above limit ' + limit);
  }
}

function countOverlapPairs(nodes) {
  let overlaps = 0;
  let minSeparation = Infinity;
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    bounds.minX = Math.min(bounds.minX, a.center.x - a.radius);
    bounds.minY = Math.min(bounds.minY, a.center.y - a.radius);
    bounds.maxX = Math.max(bounds.maxX, a.center.x + a.radius);
    bounds.maxY = Math.max(bounds.maxY, a.center.y + a.radius);
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j];
      minSeparation = Math.min(minSeparation, Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y));
      if (shapesOverlap(a, b)) overlaps += 1;
    }
  }
  return { overlaps, minSeparation: Number.isFinite(minSeparation) ? minSeparation : null, bounds: Number.isFinite(bounds.minX) ? bounds : null };
}

function countFixedOverlap(nodes, radius, scene) {
  const fixed = [...nodes].map((node) => ({ ...node, radius }));
  ensureDiagnosticBound(fixed.length, DIAGNOSTIC_MAX_NODES);
  return countOverlapPairs(fixed).overlaps;
}

function radiusStats(values) {
  if (values.length === 0) return { count: 0, min: null, max: null, mean: null, median: null, p90: null };
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((total, value) => total + value, 0);
  const median = count % 2 === 1
    ? sorted[(count - 1) / 2]
    : (sorted[count / 2 - 1] + sorted[count / 2]) / 2;
  return {
    count,
    min: sorted[0],
    max: sorted[count - 1],
    mean: sum / count,
    median,
    p90: sorted[Math.min(count - 1, Math.ceil(count * 0.9) - 1)]
  };
}

/** Exact circle/diamond overlap check for the two shapes used by this slice. */
/**
 * Signed boundary separation. Positive = gap, zero = touching,
 * negative = penetration depth. Shapes are the actual circle/diamond glyphs.
 */
export function shapeBoundarySeparation(a, b) {
  const aDiamond = a.shape === 'diamond';
  const bDiamond = b.shape === 'diamond';
  if (!aDiamond && !bDiamond) {
    return Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) - a.radius - b.radius;
  }
  if (aDiamond && bDiamond) return normalizeZero(polygonSeparation(diamond(a), diamond(b)));
  const circle = aDiamond ? b : a;
  const diamondNode = aDiamond ? a : b;
  return normalizeZero(circlePolygonSeparation(circle, diamond(diamondNode)));
}

export function minimumShapeBoundarySeparation(nodes) {
  let minimum = Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      minimum = Math.min(minimum, shapeBoundarySeparation(nodes[i], nodes[j]));
    }
  }
  return Number.isFinite(minimum) ? minimum : null;
}
export function shapesOverlap(a, b) {
  if (a.shape === 'circle' && b.shape === 'circle') {
    return Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) < a.radius + b.radius;
  }
  if (a.shape === 'diamond' && b.shape === 'diamond') {
    return polygonsOverlap(diamond(a), diamond(b));
  }
  const circle = a.shape === 'circle' ? a : b;
  const diamondNode = a.shape === 'diamond' ? a : b;
  return circleDiamondOverlap(circle, diamondNode);
}

export function radialSpread(staged, phase) {
  const byDepth = new Map();
  for (const node of staged.nodes.values()) {
    const pos = node.positions.get(phase);
    if (!byDepth.has(node.depth)) byDepth.set(node.depth, []);
    byDepth.get(node.depth).push(pos.rho);
  }
  const result = new Map();
  for (const [depth, values] of byDepth) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    result.set(depth, { min, max, mean, count: values.length });
  }
  return result;
}

function diamond(node) {
  const { x, y } = node.center;
  const r = node.radius;
  return [
    { x, y: y - r }, { x: x + r, y },
    { x, y: y + r }, { x: x - r, y }
  ];
}

function polygonsOverlap(polyA, polyB) {
  for (const poly of [polyA, polyB]) {
    for (let i = 0; i < poly.length; i += 1) {
      const next = poly[(i + 1) % poly.length];
      const axis = { x: -(next.y - poly[i].y), y: next.x - poly[i].x };
      const length = Math.hypot(axis.x, axis.y);
      if (length === 0) continue;
      axis.x /= length;
      axis.y /= length;
      const projectionA = project(polyA, axis);
      const projectionB = project(polyB, axis);
      if (projectionA.max <= projectionB.min || projectionB.max <= projectionA.min) return false;
    }
  }
  return true;
}

function project(poly, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const point of poly) {
    const value = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function circleDiamondOverlap(circle, diamondNode) {
  const points = diamond(diamondNode);
  if (pointInConvex(circle.center, points)) return true;
  for (let i = 0; i < points.length; i += 1) {
    if (pointSegmentDistance(circle.center, points[i], points[(i + 1) % points.length]) < circle.radius) {
      return true;
    }
  }
  return false;
}

function pointInConvex(point, poly) {
  let sign = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (cross !== 0) {
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
  }
  return true;
}

function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}
function polygonSeparation(polyA, polyB) {
  if (polygonsOverlap(polyA, polyB)) return -satPenetration(polyA, polyB);
  let minimum = Infinity;
  for (let i = 0; i < polyA.length; i += 1) {
    for (let j = 0; j < polyB.length; j += 1) {
      minimum = Math.min(
        minimum,
        segmentDistance(polyA[i], polyA[(i + 1) % polyA.length], polyB[j], polyB[(j + 1) % polyB.length])
      );
    }
  }
  return minimum;
}

function satPenetration(polyA, polyB) {
  let penetration = Infinity;
  for (const poly of [polyA, polyB]) {
    for (let i = 0; i < poly.length; i += 1) {
      const next = poly[(i + 1) % poly.length];
      const axis = { x: -(next.y - poly[i].y), y: next.x - poly[i].x };
      const length = Math.hypot(axis.x, axis.y);
      if (length === 0) continue;
      axis.x /= length;
      axis.y /= length;
      const a = project(polyA, axis);
      const b = project(polyB, axis);
      // Minimum translation to separate the intervals, including containment.
      const translation = Math.min(a.max - b.min, b.max - a.min);
      if (translation < penetration) penetration = translation;
    }
  }
  return penetration === Infinity ? 0 : penetration;
}

function circlePolygonSeparation(circle, polygon) {
  const center = circle.center;
  let distance = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    distance = Math.min(distance, pointSegmentDistance(center, polygon[i], polygon[(i + 1) % polygon.length]));
  }
  if (pointInConvex(center, polygon)) return -(circle.radius + distance);
  if (distance > circle.radius) return distance - circle.radius;
  return -(circle.radius - distance);
}

function segmentDistance(a, b, c, d) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b)
  );
}

function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
}
function normalizeZero(value) {
  return value === 0 ? 0 : value;
}

