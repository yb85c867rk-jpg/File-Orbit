import { computeAngularWidths } from './angular-width.js';
import { computeLevelDistances } from './distance.js';
import { LayoutContractError } from './errors.js';
import { normalizeNodeOptions, resolveDim } from './resolve.js';

const TWO_PI = Math.PI * 2;
const INTERVAL_ABS = 1e-12;
const INTERVAL_REL = 1e-12;

/**
 * Compose the accepted angular-width and distance stages into one staged
 * radial result. No live graph field is read for depth/flag and nothing is
 * committed to the graph.
 *
 * @param {import('../graph/index.js').Graph} graph
 * @param {{
 *   rootId: string,
 *   phases?: string|string[],
 *   nodeOptions?: object,
 *   radius: number,
 *   offset?: number,
 *   limits?: {maxDepth?: number, maxNodes?: number}
 * }} options
 */
export function stageRadialLayout(graph, options = {}) {
  const normalizedOptions = normalizeNodeOptions(options.nodeOptions);
  const angular = computeAngularWidths(graph, {
    rootId: options.rootId,
    phases: options.phases,
    nodeOptions: normalizedOptions,
    limits: options.limits
  });
  const distance = computeLevelDistances(angular, {
    radius: options.radius,
    offset: options.offset
  });

  const phases = [...angular.phases];
  const nodes = new Map();
  const children = new Map();
  const depths = new Map(angular.depths);
  const angularWidths = new Map(angular.angularWidths);
  const treeAngularWidths = new Map(angular.treeAngularWidths);
  const distances = new Map(distance.distances);
  const placementDistances = new Map(distance.placementDistances);
  const scales = new Map(distance.scales);

  for (const [id, childIds] of angular.children) {
    children.set(id, [...childIds]);
  }

  // Root outputs: positions, root span, and angleSpan. Root dim-quotient is
  // intentionally absent because legacy computePositions never writes it.
  const rootPositions = new Map();
  const rootSpans = new Map();
  for (const phase of phases) {
    rootPositions.set(phase, { theta: 0, rho: 0 });
    rootSpans.set(phase, TWO_PI);
  }
  const rootRecord = makeRecord(angular, distance, angular.rootId, rootPositions, rootSpans, null);
  rootRecord.angleSpan = { begin: 0, end: TWO_PI };
  nodes.set(angular.rootId, rootRecord);
  for (const id of graph.nodes.keys()) {
    if (id !== angular.rootId) {
      nodes.set(id, makeRecord(angular, distance, id, new Map(), new Map(), new Map()));
    }
  }

  const queue = [angular.rootId];
  let head = 0;
  while (head < queue.length) {
    const parentId = queue[head];
    head += 1;
    const childIds = children.get(parentId) || [];
    if (childIds.length === 0) continue;
    const parent = nodes.get(parentId);
    if (!parent || !parent.angleSpan) {
      throw new LayoutContractError('invalid-topology', 'parent has no staged angleSpan', parentId);
    }
    const placement = placementDistances.get(parentId);
    if (placement === undefined) {
      throw new LayoutContractError('radial-domain', 'parent has no valid placement distance', parentId);
    }

    const parentSpan = parent.angleSpan.end - parent.angleSpan.begin;
    let totalAngularWidths = 0;
    const maxDim = new Map(phases.map((phase) => [phase, -Infinity]));
    const childDims = new Map();

    for (const childId of childIds) {
      const weight = treeAngularWidths.get(childId);
      if (!Number.isFinite(weight) || weight <= 0) {
        throw new LayoutContractError('invalid-angular-width', 'child subtree weight must be positive', childId);
      }
      totalAngularWidths += weight;
      const dims = new Map();
      for (const phase of phases) {
        const dim = resolveDim(requireNode(graph, childId), phase, normalizedOptions);
        dims.set(phase, dim);
        maxDim.set(phase, Math.max(maxDim.get(phase), dim));
      }
      childDims.set(childId, dims);
    }
    if (!Number.isFinite(totalAngularWidths) || totalAngularWidths <= 0) {
      throw new LayoutContractError('numeric-overflow', 'total angular width is not finite', parentId);
    }

    let angleInit = parent.angleSpan.begin;
    for (const childId of childIds) {
      const child = nodes.get(childId);
      if (!child) {
        throw new LayoutContractError('invalid-topology', 'child has no staged record', childId);
      }
      const weight = treeAngularWidths.get(childId);
      const angleProportion = weight / totalAngularWidths * parentSpan;
      if (!Number.isFinite(angleProportion) || angleProportion < 0) {
        throw new LayoutContractError('numeric-overflow', 'child angular proportion is invalid', childId);
      }
      const nextAngle = angleInit + angleProportion;
      // Underflow/absorption must not be presented as a distinguishable
      // interval. Reject rather than silently emitting identical boundaries.
      if (angleProportion === 0 || nextAngle === angleInit) {
        throw new LayoutContractError(
          'allocation-underflow',
          'positive child weight produced an indistinguishable angular interval',
          childId
        );
      }
      const theta = angleInit + angleProportion / 2;
      if (!Number.isFinite(theta) || !Number.isFinite(placement)) {
        throw new LayoutContractError('numeric-overflow', 'staged position is not finite', childId);
      }
      for (const phase of phases) {
        child.positions.set(phase, { theta, rho: placement });
        child.spans.set(phase, angleProportion);
        const max = maxDim.get(phase);
        const dim = childDims.get(childId).get(phase);
        const quotient = max === 0 ? 0 : dim / max;
        if (!Number.isFinite(quotient) || quotient < 0 || quotient > 1) {
          throw new LayoutContractError('numeric-overflow', 'dimension quotient is invalid', childId);
        }
        child.dimQuotients.set(phase, quotient);
      }
      child.angleSpan = { begin: angleInit, end: nextAngle };
      validateInterval(child.angleSpan, childId);
      angleInit = nextAngle;
      queue.push(childId);
    }

    closeInterval(angleInit, parent.angleSpan.end, parentId);
  }

  validateAllRecords(nodes, phases);
  return {
    rootId: angular.rootId,
    phases,
    firstPhase: angular.firstPhase,
    nodeCount: angular.nodeCount,
    maxDepth: distance.maxDepth,
    legacyDepth: distance.legacyDepth,
    coefficient: distance.coefficient,
    selection: distance.selection,
    radius: distance.radius,
    offset: distance.offset,
    nodes,
    depths,
    angularWidths,
    treeAngularWidths,
    distances,
    placementDistances,
    scales,
    children
  };
}

/** @param {import('../graph/index.js').Graph} graph */
function requireNode(graph, id) {
  const node = graph.getNode(id);
  if (!node) throw new LayoutContractError('invalid-topology', 'node is not in the graph', id);
  return node;
}

/** @param {object} angular */
function makeRecord(angular, distance, id, positions, spans, dimQuotients) {
  return {
    id,
    depth: angular.depths.get(id),
    angularWidth: angular.angularWidths.get(id),
    treeAngularWidth: angular.treeAngularWidths.get(id),
    scale: distance.scales.get(id),
    distance: distance.distances.get(id),
    placementDistance: distance.placementDistances.has(id) ? distance.placementDistances.get(id) : null,
    angleSpan: null,
    positions,
    spans,
    dimQuotients
  };
}

/** @param {{begin:number,end:number}} interval @param {string} id */
function validateInterval(interval, id) {
  if (!Number.isFinite(interval.begin) || !Number.isFinite(interval.end)) {
    throw new LayoutContractError('numeric-overflow', 'angle interval is not finite', id);
  }
  if (interval.end < interval.begin) {
    throw new LayoutContractError('numeric-overflow', 'angle interval is reversed', id);
  }
}

/** @param {number} actual @param {number} expected @param {string} id */
function closeInterval(actual, expected, id) {
  const allowed = INTERVAL_ABS + INTERVAL_REL * Math.max(1, Math.abs(expected));
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > allowed) {
    throw new LayoutContractError('numeric-overflow', 'child intervals do not cover parent interval', id);
  }
}

/** @param {Map<string, object>} nodes @param {string[]} phases */
function validateAllRecords(nodes, phases) {
  for (const [id, record] of nodes) {
    if (!release(record.angleSpan)) {
      throw new LayoutContractError('numeric-overflow', 'angleSpan is missing', id);
    }
    validateInterval(record.angleSpan, id);
    if (record.depth === 0) {
      if (record.angleSpan.begin !== 0 || record.angleSpan.end !== TWO_PI) {
        throw new LayoutContractError('invalid-root', 'root angleSpan must be [0, 2π]', id);
      }
    }
    if (!Number.isFinite(record.scale)) {
      throw new LayoutContractError('numeric-overflow', 'scale is not finite', id);
    }
    for (const phase of phases) {
      const pos = record.positions.get(phase);
      if (!pos || !Number.isFinite(pos.theta) || !Number.isFinite(pos.rho)) {
        throw new LayoutContractError('numeric-overflow', 'staged position is not finite', id);
      }
      if (!Number.isFinite(record.spans.get(phase)) || record.spans.get(phase) < 0) {
        throw new LayoutContractError('numeric-overflow', 'span is invalid', id);
      }
      if (record.dimQuotients !== null) {
        const quotient = record.dimQuotients.get(phase);
        if (!Number.isFinite(quotient) || quotient < 0 || quotient > 1) {
          throw new LayoutContractError('numeric-overflow', 'dimension quotient is invalid', id);
        }
      }
    }
  }
}

function release(value) {
  return value !== null && typeof value === 'object';
}
