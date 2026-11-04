import { Graph } from '../graph/index.js';
import { LIMITS } from '../data/errors.js';
import { LayoutContractError } from './errors.js';
import {
  normalizeNodeOptions,
  normalizePhases,
  resolveAngularWidth
} from './resolve.js';

const DEFAULT_LIMITS = Object.freeze({
  maxDepth: LIMITS.maxDepth,
  maxNodes: LIMITS.maxNodes
});

/**
 * Compute staged depths and angular widths without mutating the graph.
 *
 * @param {Graph} graph accepted M2 Graph
 * @param {{
 *   rootId: string,
 *   phases?: string|string[],
 *   nodeOptions?: object,
 *   limits?: {maxDepth?: number, maxNodes?: number}
 * }} options
 * @returns {{
 *   rootId: string,
 *   phases: readonly string[],
 *   firstPhase: string,
 *   depths: Map<string, number>,
 *   angularWidths: Map<string, number>,
 *   treeAngularWidths: Map<string, number>,
 *   children: Map<string, string[]>,
 *   nodeCount: number
 * }}
 */
export function computeAngularWidths(graph, options = {}) {
  if (!(graph instanceof Graph)) {
    throw new LayoutContractError('invalid-graph', 'computeAngularWidths requires an M2 Graph');
  }
  if (typeof options.rootId !== 'string' || options.rootId.length === 0) {
    throw new LayoutContractError('invalid-root', 'rootId must be a non-empty string');
  }
  const phases = normalizePhases(options.phases);
  const nodeOptions = normalizeNodeOptions(options.nodeOptions);
  const limits = normalizeLimits(options.limits);
  const root = graph.getNode(options.rootId);
  if (!root) {
    throw new LayoutContractError('invalid-root', `root ${options.rootId} is not in the graph`);
  }
  if (graph.nodes.size > limits.maxNodes) {
    throw new LayoutContractError('node-limit', `node count exceeds limit ${limits.maxNodes}`);
  }

  // Reject visibility flags before any traversal/staging. M2/legacy handling is
  // not a consistent tree contract.
  for (const node of graph.nodes.values()) {
    if (node.ignore) {
      throw new LayoutContractError('unsupported-visibility-flag', 'ignore nodes are not supported', node.id);
    }
    for (const adj of node.adjacencies.values()) {
      if (adj._hiding) {
        throw new LayoutContractError('unsupported-visibility-flag', '_hiding edges are not supported', node.id);
      }
      if (!adj.nodeTo || !graph.nodes.has(adj.nodeTo.id)) {
        throw new LayoutContractError('invalid-topology', 'adjacency target is not in the graph', node.id);
      }
    }
  }

  const depths = new Map();
  const parentById = new Map();
  const children = new Map();
  const seen = new Set();
  const order = [];
  // M2's unshift/pop queue is FIFO for the observable BFS order. This front
  // array with a head cursor preserves that order without O(N) unshift.
  const queue = [root];
  let head = 0;

  depths.set(root.id, 0);
  parentById.set(root.id, null);
  seen.add(root.id);

  while (head < queue.length) {
    const node = queue[head];
    head += 1;
    order.push(node.id);
    const depth = depths.get(node.id);
    if (depth > limits.maxDepth) {
      throw new LayoutContractError('depth-limit', `depth ${depth} exceeds limit ${limits.maxDepth}`, node.id);
    }
    const childIds = [];
    children.set(node.id, childIds);
    const parentId = parentById.get(node.id);

    for (const [neighborId, adj] of node.adjacencies) {
      if (neighborId === parentId) continue;
      const neighbor = adj.nodeTo;
      if (!neighbor || neighbor.id !== neighborId) {
        throw new LayoutContractError('invalid-topology', 'adjacency id does not match target node', node.id);
      }
      if (seen.has(neighborId)) {
        throw new LayoutContractError('invalid-topology', 'cycle or multiple-parent edge', node.id);
      }
      seen.add(neighborId);
      parentById.set(neighborId, node.id);
      depths.set(neighborId, depth + 1);
      childIds.push(neighborId);
      queue.push(neighbor);
    }
  }

  if (seen.size !== graph.nodes.size) {
    throw new LayoutContractError('unreachable-node', 'graph has nodes unreachable from the root');
  }
  if (seen.size > limits.maxNodes) {
    throw new LayoutContractError('node-limit', `node count exceeds limit ${limits.maxNodes}`);
  }

  const firstPhase = phases[0];
  const angularWidths = new Map();
  for (const node of graph.nodes.values()) {
    const depth = depths.get(node.id);
    if (depth === undefined || depth < 0) {
      throw new LayoutContractError('invalid-depth', 'node has no staged depth', node.id);
    }
    // Validate every node, including the root, before applying the root
    // correction. Otherwise invalid root overrides would bypass resolution.
    const resolved = resolveAngularWidth(node, firstPhase, nodeOptions);
    if (depth === 0) {
      angularWidths.set(node.id, 0);
      continue;
    }
    const width = resolved / depth;
    if (!Number.isFinite(width) || width <= 0) {
      throw new LayoutContractError('numeric-overflow', 'angular width is not finite', node.id);
    }
    angularWidths.set(node.id, width);
  }

  const treeAngularWidths = new Map();
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const id = order[i];
    let sum = 0;
    for (const childId of children.get(id)) {
      const childWidth = treeAngularWidths.get(childId);
      if (!Number.isFinite(childWidth)) {
        throw new LayoutContractError('numeric-overflow', 'child angular width is not finite', childId);
      }
      sum += childWidth;
      if (!Number.isFinite(sum)) {
        throw new LayoutContractError('numeric-overflow', 'subtree angular width overflow', id);
      }
    }
    const own = angularWidths.get(id);
    const treeWidth = Math.max(own, sum);
    if (!Number.isFinite(treeWidth)) {
      throw new LayoutContractError('numeric-overflow', 'subtree angular width is not finite', id);
    }
    treeAngularWidths.set(id, treeWidth);
  }

  return {
    rootId: root.id,
    phases,
    firstPhase,
    depths,
    angularWidths,
    treeAngularWidths,
    children,
    nodeCount: seen.size
  };
}

/** @param {{maxDepth?: number, maxNodes?: number}|undefined} overrides */
function normalizeLimits(overrides = {}) {
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new LayoutContractError('invalid-limits', 'limits must be an object');
  }
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  for (const key of ['maxDepth', 'maxNodes']) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] <= 0) {
      throw new LayoutContractError('invalid-limits', `limits.${key} must be a positive safe integer`);
    }
  }
  return constraints(limits);
}

/** @param {{maxDepth:number,maxNodes:number}} limits */
function constraints(limits) {
  return Object.freeze(limits);
}
