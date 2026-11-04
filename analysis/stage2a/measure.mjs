import { shapesOverlap } from '../../src/engine/hypertree/layout/experimental-metrics.js';

function visibleNodes(scene) {
  return [...scene.nodes.values()].filter((node) => node.visible && node.radius > 0);
}

function boundsOf(nodes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.center.x - node.radius);
    minY = Math.min(minY, node.center.y - node.radius);
    maxX = Math.max(maxX, node.center.x + node.radius);
    maxY = Math.max(maxY, node.center.y + node.radius);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function exactOverlapPairs(nodes) {
  if (nodes.length < 2) return 0;
  let maxRadius = 0;
  for (const node of nodes) maxRadius = Math.max(maxRadius, node.radius);
  const cell = maxRadius * 2;
  if (!(cell > 0) || !Number.isFinite(cell)) return bruteOverlap(nodes);
  const buckets = new Map();
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const key = `${Math.floor(node.center.x / cell)}:${Math.floor(node.center.y / cell)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(index);
  }
  let overlaps = 0;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const cx = Math.floor(node.center.x / cell);
    const cy = Math.floor(node.center.y / cell);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucket = buckets.get(`${cx + dx}:${cy + dy}`);
        if (!bucket) continue;
        for (const otherIndex of bucket) {
          if (otherIndex <= index) continue;
          if (shapesOverlap(node, nodes[otherIndex])) overlaps += 1;
        }
      }
    }
  }
  return overlaps;
}

function bruteOverlap(nodes) {
  let overlaps = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) if (shapesOverlap(nodes[i], nodes[j])) overlaps += 1;
  }
  return overlaps;
}

function buildKd(items, depth = 0) {
  if (items.length === 0) return null;
  const axis = depth % 2;
  const sorted = [...items].sort((a, b) => axis === 0 ? a.center.x - b.center.x || a.center.y - b.center.y : a.center.y - b.center.y || a.center.x - b.center.x);
  const middle = Math.floor(sorted.length / 2);
  return { node: sorted[middle], axis, left: buildKd(sorted.slice(0, middle), depth + 1), right: buildKd(sorted.slice(middle + 1), depth + 1) };
}

function nearestDistance(target, tree, best) {
  if (!tree) return best;
  const node = tree.node;
  if (node !== target) best = Math.min(best, Math.hypot(node.center.x - target.center.x, node.center.y - target.center.y));
  const delta = tree.axis === 0 ? target.center.x - node.center.x : target.center.y - node.center.y;
  const near = delta <= 0 ? tree.left : tree.right;
  const far = delta <= 0 ? tree.right : tree.left;
  best = nearestDistance(target, near, best);
  if (delta * delta < best * best) best = nearestDistance(target, far, best);
  return best;
}

export function minimumCenterSeparation(nodes) {
  if (nodes.length < 2) return null;
  const tree = buildKd(nodes);
  let best = Infinity;
  for (const node of nodes) best = nearestDistance(node, tree, best);
  return Number.isFinite(best) ? best : null;
}

function radiusStats(values) {
  if (values.length === 0) return { count: 0, min: null, max: null, mean: null, median: null, p90: null };
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const median = count % 2 === 1 ? sorted[(count - 1) / 2] : (sorted[count / 2 - 1] + sorted[count / 2]) / 2;
  return {
    count, min: sorted[0], max: sorted[count - 1],
    mean: sorted.reduce((sum, value) => sum + value, 0) / count,
    median, p90: sorted[Math.min(count - 1, Math.ceil(count * 0.9) - 1)]
  };
}

/**
 * Exact broad-phase diagnostics for analysis only.
 * Overlap pairs use a uniform grid and exact shape tests; min center separation
 * uses an exact balanced k-d tree nearest-neighbour query.
 */
export function measureSceneExact(scene, options = {}) {
  const all = [...scene.nodes.values()];
  const nodes = visibleNodes(scene);
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
    overlapPairs: exactOverlapPairs(nodes),
    minCenterSeparation: minimumCenterSeparation(nodes),
    bounds: boundsOf(nodes),
    radiusStats: { all: radiusStats(all.map((node) => node.radius)), visible: radiusStats(nodes.map((node) => node.radius)) },
    diagnostic: { method: 'grid-overlap+kd-min-separation', exact: true }
  };
}
