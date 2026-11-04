import { computeAngularWidths } from './angular-width.js';
import { LayoutContractError } from './errors.js';
import { normalizeNodeOptions, resolveDim } from './resolve.js';

const TWO_PI = Math.PI * 2;
const SAFETY = 1e-6;

export const EXPERIMENTAL_DEFAULTS = Object.freeze({
  minStep: 0.01,
  radialFlex: 0.65,
  branchWeight: 0.75,
  demandCompression: 0.6,
  safetyMargin: SAFETY,
  radius: 1
});

/**
 * Opt-in experimental staged layout.
 *
 * Angular allocation is proportional to compressed subtree demand (subtree
 * size + direct branching). Radial placement uses a depth-aware capacity band;
 * siblings may receive different radii according to relative demand. This is a
 * deterministic heuristic, not a collision-free or optimal layout.
 */
export function stageExperimentalLayout(graph, options = {}) {
  const config = normalizeConfig(options);
  const angular = computeAngularWidths(graph, {
    rootId: options.rootId,
    phases: options.phases,
    nodeOptions: options.nodeOptions,
    limits: options.limits
  });
  const nodeOptions = normalizeNodeOptions(options.nodeOptions);
  const phases = [...angular.phases];
  const maxDepth = angular.depths.get(angular.rootId) === 0
    ? Math.max(...angular.depths.values())
    : (() => { throw new LayoutContractError('invalid-root', 'root depth must be 0'); })();

  if (maxDepth > 0 && 1 - config.safetyMargin - config.minStep * maxDepth <= 0) {
    throw new LayoutContractError('experimental-infeasible', 'depth and minStep cannot fit inside the unit disk');
  }
  const maxRhoByDepth = new Map();
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    maxRhoByDepth.set(depth, 1 - config.safetyMargin - config.minStep * (maxDepth - depth));
  }

  const order = [];
  const queue = [angular.rootId];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head];
    head += 1;
    order.push(id);
    for (const childId of angular.children.get(id) || []) queue.push(childId);
  }
  const subtreeSize = new Map();
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const id = order[i];
    let size = 1;
    for (const childId of angular.children.get(id) || []) size += subtreeSize.get(childId);
    subtreeSize.set(id, size);
  }
  const demand = new Map();
  for (const id of order) {
    const childCount = (angular.children.get(id) || []).length;
    const raw = 1 + Math.log1p(subtreeSize.get(id)) + config.branchWeight * Math.log1p(childCount);
    const value = Math.pow(raw, config.demandCompression);
    if (!Number.isFinite(value) || value <= 0) {
      throw new LayoutContractError('experimental-demand', 'demand is not finite and positive', id);
    }
    demand.set(id, value);
  }

  const nodes = new Map();
  const makePositions = (theta, rho) => {
    const positions = new Map();
    for (const phase of phases) positions.set(phase, { theta, rho });
    return positions;
  };
  const rootPositions = makePositions(0, 0);
  const rootSpans = new Map();
  for (const phase of phases) rootSpans.set(phase, TWO_PI);
  const rootRecord = {
    id: angular.rootId,
    depth: 0,
    demand: demand.get(angular.rootId),
    scale: config.radius,
    radialRadius: 0,
    parentRadialRadius: null,
    angleSpan: { begin: 0, end: TWO_PI },
    positions: rootPositions,
    spans: rootSpans,
    dimQuotients: null
  };
  nodes.set(angular.rootId, rootRecord);
  for (const id of graph.nodes.keys()) {
    if (id === angular.rootId) continue;
    nodes.set(id, {
      id,
      depth: angular.depths.get(id),
      demand: demand.get(id),
      scale: config.radius,
      radialRadius: 0,
      parentRadialRadius: null,
      angleSpan: null,
      positions: new Map(),
      spans: new Map(),
      dimQuotients: new Map()
    });
  }

  const queueNodes = [angular.rootId];
  head = 0;
  while (head < queueNodes.length) {
    const parentId = queueNodes[head];
    head += 1;
    const parent = nodes.get(parentId);
    const childIds = angular.children.get(parentId) || [];
    if (childIds.length === 0) continue;
    const parentSpan = parent.angleSpan.end - parent.angleSpan.begin;
    const demands = childIds.map((id) => demand.get(id));
    const totalDemand = demands.reduce((sum, value) => sum + value, 0);
    if (!Number.isFinite(totalDemand) || totalDemand <= 0) {
      throw new LayoutContractError('experimental-demand', 'sibling demand is invalid', parentId);
    }
    const maxDemand = Math.max(...demands);
    const childDims = new Map();
    const maxDim = new Map(phases.map((phase) => [phase, -Infinity]));
    for (const childId of childIds) {
      const dims = new Map();
      for (const phase of phases) {
        const dim = resolveDim(graph.getNode(childId), phase, nodeOptions);
        if (!Number.isFinite(dim) || dim < 0) {
          throw new LayoutContractError('experimental-dimension', 'child dimension is invalid', childId);
        }
        dims.set(phase, dim);
        maxDim.set(phase, Math.max(maxDim.get(phase), dim));
      }
      childDims.set(childId, dims);
    }

    let angleInit = parent.angleSpan.begin;
    for (let index = 0; index < childIds.length; index += 1) {
      const childId = childIds[index];
      const child = nodes.get(childId);
      if (!child) throw new LayoutContractError('invalid-topology', 'child has no staged record', childId);
      const childSpan = parentSpan * demands[index] / totalDemand;
      const next = angleInit + childSpan;
      if (!Number.isFinite(childSpan) || childSpan <= 0 || next === angleInit) {
        throw new LayoutContractError('experimental-allocation', 'child angular interval is indistinguishable', childId);
      }
      const depth = angular.depths.get(childId);
      const lower = parent.positions.get(phases[0]).rho + config.minStep;
      const upper = maxRhoByDepth.get(depth);
      if (!Number.isFinite(upper) || upper < lower) {
        throw new LayoutContractError('experimental-infeasible', 'radial band is too small for child', childId);
      }
      const ratio = demands[index] / maxDemand;
      const rho = lower + config.radialFlex * ratio * (upper - lower);
      if (!Number.isFinite(rho) || rho <= parent.positions.get(phases[0]).rho || rho >= 1) {
        throw new LayoutContractError('experimental-radial', 'child radius is outside the open disk', childId);
      }
      child.depth = depth;
      child.angleSpan = { begin: angleInit, end: next };
      child.demand = demand.get(childId);
      child.radialRadius = rho;
      child.parentRadialRadius = parent.positions.get(phases[0]).rho;
      child.positions = makePositions(angleInit + childSpan / 2, rho);
      child.spans = new Map(phases.map((phase) => [phase, childSpan]));
      child.dimQuotients = new Map();
      for (const phase of phases) {
        const max = maxDim.get(phase);
        const quotient = max === 0 ? 0 : childDims.get(childId).get(phase) / max;
        if (!Number.isFinite(quotient) || quotient < 0 || quotient > 1) {
          throw new LayoutContractError('experimental-dimension', 'dimension quotient is invalid', childId);
        }
        child.dimQuotients.set(phase, quotient);
      }
      angleInit = next;
      queueNodes.push(childId);
    }
    if (Math.abs(angleInit - parent.angleSpan.end) > 1e-12) {
      throw new LayoutContractError('experimental-allocation', 'child intervals do not cover parent interval', parentId);
    }
  }

  const depths = new Map(angular.depths);
  const demandById = new Map();
  const allocatedSpanById = new Map();
  const radialById = new Map();
  const parentRadialById = new Map();
  const placementRadiiById = new Map();
  const scales = new Map();
  for (const [id, record] of nodes) {
    demandById.set(id, record.demand);
    allocatedSpanById.set(id, record.angleSpan.end - record.angleSpan.begin);
    radialById.set(id, record.radialRadius);
    if (record.parentRadialRadius !== null) parentRadialById.set(id, record.parentRadialRadius);
    if (id !== angular.rootId) placementRadiiById.set(id, record.radialRadius);
    scales.set(id, record.scale);
    validateRecord(record, phases);
  }
  return {
    schema: 'experimental-adaptive-layout-v1',
    rootId: angular.rootId,
    phases,
    firstPhase: angular.firstPhase,
    nodeCount: angular.nodeCount,
    maxDepth,
    legacyDepth: maxDepth + 1,
    coefficient: null,
    selection: 'experimental',
    radius: config.radius,
    offset: 0,
    nodes,
    depths,
    demandById,
    allocatedSpanById,
    radialById,
    parentRadialById,
    placementRadiiById,
    scales,
    children: new Map([...angular.children].map(([id, ids]) => [id, [...ids]])),
    experiment: {
      algorithm: 'density-demand-radial-v1',
      schema: 'experimental-adaptive-layout-v1',
      config
    }
  };
}

function validateRecord(record, phases) {
  if (!record.angleSpan || !Number.isFinite(record.angleSpan.begin) || !Number.isFinite(record.angleSpan.end)) {
    throw new LayoutContractError('experimental-validation', 'angleSpan is invalid', record.id);
  }
  for (const phase of phases) {
    const position = record.positions.get(phase);
    const span = record.spans.get(phase);
    if (!position || !Number.isFinite(position.theta) || !Number.isFinite(position.rho)
        || position.rho < 0 || position.rho >= 1) {
      throw new LayoutContractError('experimental-validation', 'position is invalid', record.id);
    }
    if (!Number.isFinite(span) || span < 0) {
      throw new LayoutContractError('experimental-validation', 'span is invalid', record.id);
    }
  }
}

function normalizeConfig(options) {
  const config = { ...EXPERIMENTAL_DEFAULTS, ...(options.experiment || {}) };
  for (const key of ['minStep', 'radialFlex', 'branchWeight', 'demandCompression', 'safetyMargin', 'radius']) {
    if (typeof config[key] !== 'number' || !Number.isFinite(config[key])) {
      throw new LayoutContractError('invalid-experiment', `${key} must be finite`);
    }
  }
  if (config.minStep <= 0 || config.minStep > 0.25) {
    throw new LayoutContractError('invalid-experiment', 'minStep must be in (0, 0.25]');
  }
  if (config.radialFlex < 0 || config.radialFlex > 1) {
    throw new LayoutContractError('invalid-experiment', 'radialFlex must be within [0,1]');
  }
  if (config.branchWeight < 0 || config.branchWeight > 10) {
    throw new LayoutContractError('invalid-experiment', 'branchWeight must be within [0,10]');
  }
  if (config.demandCompression <= 0 || config.demandCompression > 1) {
    throw new LayoutContractError('invalid-experiment', 'demandCompression must be within (0,1]');
  }
  if (config.safetyMargin < 0 || config.safetyMargin >= 0.25) {
    throw new LayoutContractError('invalid-experiment', 'safetyMargin must be within [0,0.25)');
  }
  if (config.radius <= 0) throw new LayoutContractError('invalid-experiment', 'radius must be positive');
  return Object.freeze(config);
}



