import { computeAngularWidths } from './angular-width.js';
import { LayoutContractError } from './errors.js';
import { normalizeNodeOptions, resolveDim } from './resolve.js';

const TWO_PI = Math.PI * 2;
export const V2_MAX_NODES = 2000;
export const V2_MAX_DEPTH = 64;
export const V2_MAX_SCALE_ATTEMPTS = 61;

export const V2_DEFAULTS = Object.freeze({
  minStep: 0.008,
  bandCount: 2,
  radialFlex: 0.65,
  branchWeight: 0.75,
  demandCompression: 0.6,
  safetyMargin: 1e-6,
  glyphRadiusCss: 6,
  clearanceCss: 4,
  referenceProjectionRadiusCss: 240,
  workspaceScaleMin: 1,
  workspaceScaleMax: 16,
  workspaceScaleStep: 0.25,
  radius: 1
});

/**
 * Experimental v2: deterministic multi-band, size-aware staged layout.
 * Workspace scale affects angular capacity only; normalized positions remain
 * open-disk and the caller decides whether to enlarge projection radius.
 */
export function stageExperimentalV2Layout(graph, options = {}) {
  const config = normalizeV2Config(options);
  const angular = computeAngularWidths(graph, {
    rootId: options.rootId,
    phases: options.phases,
    nodeOptions: options.nodeOptions,
    limits: options.limits
  });
  const nodeOptions = normalizeNodeOptions(options.nodeOptions);
  const phases = [...angular.phases];
  const maxDepth = Math.max(...angular.depths.values());
  if (graph.nodes.size > V2_MAX_NODES) {
    throw new LayoutContractError('experimental-v2-input-limit', 'node count exceeds ' + V2_MAX_NODES);
  }
  if (maxDepth > V2_MAX_DEPTH) {
    throw new LayoutContractError('experimental-v2-input-limit', 'depth exceeds ' + V2_MAX_DEPTH);
  }
  if (maxDepth > 0 && 1 - config.safetyMargin - config.minStep * maxDepth <= 0) {
    throw new LayoutContractError('experimental-v2-infeasible', 'depth and minStep cannot fit inside the unit disk');
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
    demand.set(id, Math.pow(raw, config.demandCompression));
  }

  const scales = buildScaleCandidates(config);
  let lastDiagnostics = null;
  for (let index = 0; index < scales.length; index += 1) {
    const workspaceScale = scales[index];
    const result = attemptV2(graph, angular, nodeOptions, phases, maxDepth, maxRhoByDepth, demand, config, workspaceScale);
    result.feasibility.attemptCount = index + 1;
    result.feasibility.selectedCandidateIndex = index;
    result.feasibility.candidateCount = scales.length;
    if (result.feasibility.satisfied) {
      validateV2Invariants(result.nodes, angular, config);
      return result;
    }
    lastDiagnostics = result.feasibility;
  }
  const error = new LayoutContractError(
    'experimental-v2-infeasible',
    `no workspace scale up to ${config.workspaceScaleMax} satisfies angular clearance`,
    angular.rootId
  );
  error.diagnostics = lastDiagnostics || {
    satisfied: false,
    candidateCount: scales.length,
    attemptCount: scales.length,
    selectedCandidateIndex: null
  };
  throw error;
}

function buildScaleCandidates(config) {
  const span = config.workspaceScaleMax - config.workspaceScaleMin;
  if (span < 0) throw new LayoutContractError('invalid-experiment-v2', 'workspaceScaleMax must be >= workspaceScaleMin');
  if (span === 0) return [config.workspaceScaleMin];
  const ratio = span / config.workspaceScaleStep;
  if (!Number.isFinite(ratio) || ratio > 1e9) {
    throw new LayoutContractError('invalid-experiment-v2', 'workspace scale range produces a non-finite candidate count');
  }
  const count = Math.floor(ratio + 1e-9) + 1;
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new LayoutContractError('invalid-experiment-v2', 'workspace scale candidate count is invalid');
  }
  if (count > V2_MAX_SCALE_ATTEMPTS) {
    throw new LayoutContractError('invalid-experiment-v2', `workspace scale range requires ${count} candidates; maximum is ${V2_MAX_SCALE_ATTEMPTS}`);
  }
  const candidates = [];
  for (let index = 0; index < count; index += 1) {
    const raw = config.workspaceScaleMin + index * config.workspaceScaleStep;
    if (!Number.isFinite(raw) || raw > config.workspaceScaleMax + 1e-9) {
      throw new LayoutContractError('invalid-experiment-v2', 'workspace scale candidate exceeds declared range');
    }
    const rounded = Number(raw.toFixed(6));
    if (candidates.length > 0 && rounded <= candidates[candidates.length - 1]) {
      throw new LayoutContractError('invalid-experiment-v2', 'workspace scale candidates do not strictly progress');
    }
    candidates.push(rounded);
  }
  return candidates;
}

function validateV2Invariants(nodes, angular, config) {
  const root = nodes.get(angular.rootId);
  if (!root || root.radialRadius !== 0) {
    throw new LayoutContractError('experimental-v2-invariant', 'root is not at normalized origin', angular.rootId);
  }
  for (const [parentId, childIds] of angular.children) {
    const parent = nodes.get(parentId);
    if (!parent) throw new LayoutContractError('experimental-v2-invariant', 'missing parent record', parentId);
    let cursor = parent.angleSpan.begin;
    for (const childId of childIds) {
      const child = nodes.get(childId);
      if (!child) throw new LayoutContractError('experimental-v2-invariant', 'missing child record', childId);
      if (child.radialRadius < parent.radialRadius + config.minStep - 1e-12) {
        throw new LayoutContractError('experimental-v2-invariant', 'child minStep violated', childId);
      }
      if (Math.abs(child.angleSpan.begin - cursor) > 1e-9
          || Math.abs(child.angleSpan.end - child.angleSpan.begin) <= 0) {
        throw new LayoutContractError('experimental-v2-invariant', 'child angular interval is not contiguous', childId);
      }
      cursor = child.angleSpan.end;
    }
    if (childIds.length > 0 && Math.abs(cursor - parent.angleSpan.end) > 1e-9) {
      throw new LayoutContractError('experimental-v2-invariant', 'child intervals do not cover parent', parentId);
    }
  }
}
function attemptV2(graph, angular, nodeOptions, phases, maxDepth, maxRhoByDepth, demand, config, workspaceScale) {
  const nodes = new Map();
  const positions = (theta, rho) => new Map(phases.map((phase) => [phase, { theta, rho }]));
  const rootPositions = positions(0, 0);
  const rootSpans = new Map(phases.map((phase) => [phase, TWO_PI]));
  nodes.set(angular.rootId, {
    id: angular.rootId,
    depth: 0,
    demand: demand.get(angular.rootId),
    radialRadius: 0,
    parentRadialRadius: null,
    bandIndex: 0,
    angleSpan: { begin: 0, end: TWO_PI },
    positions: rootPositions,
    spans: rootSpans,
    dimQuotients: null,
    scale: config.radius
  });
  for (const id of graph.nodes.keys()) {
    if (id === angular.rootId) continue;
    nodes.set(id, {
      id,
      depth: angular.depths.get(id),
      demand: demand.get(id),
      radialRadius: 0,
      parentRadialRadius: null,
      bandIndex: 0,
      angleSpan: null,
      positions: new Map(),
      spans: new Map(),
      dimQuotients: new Map(),
      scale: config.radius
    });
  }
  const unsatisfied = [];
  const queue = [angular.rootId];
  let head = 0;
  while (head < queue.length) {
    const parentId = queue[head];
    head += 1;
    const parent = nodes.get(parentId);
    const childIds = angular.children.get(parentId) || [];
    if (childIds.length === 0) continue;
    const parentSpan = parent.angleSpan.end - parent.angleSpan.begin;
    const parentRho = parent.positions.get(phases[0]).rho;
    const childInfo = childIds.map((childId, index) => {
      const depth = angular.depths.get(childId);
      const bandIndex = index % config.bandCount;
      const lower = parentRho + config.minStep;
      const upper = maxRhoByDepth.get(depth);
      if (!Number.isFinite(upper) || upper < lower) {
        unsatisfied.push({ parentId, reason: 'radial-band', lower, upper, workspaceScale });
        return {
          feasibility: {
            satisfied: false,
            workspaceScale,
            maxWorkspaceScale: config.workspaceScaleMax,
            unsatisfied,
            glyphRadiusCss: config.glyphRadiusCss,
            clearanceCss: config.clearanceCss,
            referenceProjectionRadiusCss: config.referenceProjectionRadiusCss
          }
        };
      }
      const bandFraction = config.bandCount === 1 ? 1 : 0.2 + 0.8 * bandIndex / (config.bandCount - 1);
      const approximateRho = lower + config.radialFlex * bandFraction * (upper - lower);
      const arcRadius = approximateRho * config.referenceProjectionRadiusCss * workspaceScale;
      const required = 2 * Math.asin(Math.min(1, (2 * config.glyphRadiusCss + config.clearanceCss) / (2 * arcRadius)));
      return { childId, index, depth, bandIndex, lower, upper, bandFraction, approximateRho, required };
    });
    const totalRequired = childInfo.reduce((sum, item) => sum + item.required, 0);
    if (totalRequired > parentSpan) {
      unsatisfied.push({ parentId, required: totalRequired, available: parentSpan, workspaceScale });
      return {
        feasibility: {
          satisfied: false,
          workspaceScale,
          maxWorkspaceScale: config.workspaceScaleMax,
          unsatisfied,
          glyphRadiusCss: config.glyphRadiusCss,
          clearanceCss: config.clearanceCss,
          referenceProjectionRadiusCss: config.referenceProjectionRadiusCss
        }
      };
    }
    const remaining = parentSpan - totalRequired;
    const totalDemand = childInfo.reduce((sum, item) => sum + demand.get(item.childId), 0);
    const maxDim = new Map(phases.map((phase) => [phase, -Infinity]));
    const childDims = new Map();
    for (const item of childInfo) {
      const dims = new Map();
      for (const phase of phases) {
        const dim = resolveDim(graph.getNode(item.childId), phase, nodeOptions);
        dims.set(phase, dim);
        maxDim.set(phase, Math.max(maxDim.get(phase), dim));
      }
      childDims.set(item.childId, dims);
    }
    let angleInit = parent.angleSpan.begin;
    for (const item of childInfo) {
      const child = nodes.get(item.childId);
      const span = item.required + remaining * demand.get(item.childId) / totalDemand;
      const next = angleInit + span;
      const rho = item.lower + config.radialFlex * item.bandFraction * (item.upper - item.lower);
      child.angleSpan = { begin: angleInit, end: next };
      child.radialRadius = rho;
      child.parentRadialRadius = parentRho;
      child.bandIndex = item.bandIndex;
      child.positions = positions(angleInit + span / 2, rho);
      child.spans = new Map(phases.map((phase) => [phase, span]));
      child.dimQuotients = new Map();
      for (const phase of phases) {
        const max = maxDim.get(phase);
        child.dimQuotients.set(phase, max === 0 ? 0 : childDims.get(item.childId).get(phase) / max);
      }
      angleInit = next;
      queue.push(item.childId);
    }
    if (Math.abs(angleInit - parent.angleSpan.end) > 1e-12) {
      unsatisfied.push({ parentId, reason: 'interval-coverage', workspaceScale });
      return {
        feasibility: {
          satisfied: false,
          workspaceScale,
          maxWorkspaceScale: config.workspaceScaleMax,
          unsatisfied,
          glyphRadiusCss: config.glyphRadiusCss,
          clearanceCss: config.clearanceCss,
          referenceProjectionRadiusCss: config.referenceProjectionRadiusCss
        }
      };
    }
  }
  const depths = new Map(angular.depths);
  const demandById = new Map();
  const allocatedSpanById = new Map();
  const radialById = new Map();
  const parentRadialById = new Map();
  const placementRadiiById = new Map();
  const scales = new Map();
  for (const [id, node] of nodes) {
    demandById.set(id, node.demand);
    allocatedSpanById.set(id, node.angleSpan.end - node.angleSpan.begin);
    radialById.set(id, node.radialRadius);
    if (node.parentRadialRadius !== null) parentRadialById.set(id, node.parentRadialRadius);
    if (id !== angular.rootId) placementRadiiById.set(id, node.radialRadius);
    scales.set(id, node.scale);
    for (const phase of phases) {
      const p = node.positions.get(phase);
      if (!p || !Number.isFinite(p.theta) || !Number.isFinite(p.rho) || p.rho < 0 || p.rho >= 1) {
        throw new LayoutContractError('experimental-v2-invalid', 'position is not finite/open-disk', id);
      }
    }
  }
  return {
    schema: 'experimental-adaptive-layout-v2',
    rootId: angular.rootId,
    phases,
    firstPhase: angular.firstPhase,
    nodeCount: angular.nodeCount,
    maxDepth,
    legacyDepth: maxDepth + 1,
    coefficient: null,
    selection: 'experimental-v2',
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
    feasibility: {
      satisfied: unsatisfied.length === 0,
      workspaceScale,
      maxWorkspaceScale: config.workspaceScaleMax,
      unsatisfied,
      glyphRadiusCss: config.glyphRadiusCss,
      clearanceCss: config.clearanceCss,
      referenceProjectionRadiusCss: config.referenceProjectionRadiusCss,
      projectionScope: 'local sibling angular capacity only; not a global node-clearance guarantee'
    },
    experiment: {
      algorithm: 'multi-band-size-aware-v2',
      schema: 'experimental-adaptive-layout-v2',
      config
    }
  };
}

function normalizeV2Config(options) {
  const config = { ...V2_DEFAULTS, ...(options.experimentV2 || {}) };
  for (const key of ['minStep', 'radialFlex', 'branchWeight', 'demandCompression', 'safetyMargin', 'glyphRadiusCss', 'clearanceCss', 'referenceProjectionRadiusCss', 'workspaceScaleMin', 'workspaceScaleMax', 'workspaceScaleStep', 'radius']) {
    if (typeof config[key] !== 'number' || !Number.isFinite(config[key])) {
      throw new LayoutContractError('invalid-experiment-v2', `${key} must be finite`);
    }
  }
  if (!Number.isSafeInteger(config.bandCount) || config.bandCount < 1 || config.bandCount > 4) {
    throw new LayoutContractError('invalid-experiment-v2', 'bandCount must be an integer 1..4');
  }
  if (config.minStep <= 0 || config.minStep > 0.25) throw new LayoutContractError('invalid-experiment-v2', 'minStep out of range');
  if (config.radialFlex < 0 || config.radialFlex > 1) throw new LayoutContractError('invalid-experiment-v2', 'radialFlex out of range');
  if (config.branchWeight < 0 || config.branchWeight > 10) throw new LayoutContractError('invalid-experiment-v2', 'branchWeight out of range');
  if (config.safetyMargin < 0 || config.safetyMargin >= 0.25) throw new LayoutContractError('invalid-experiment-v2', 'safetyMargin out of range');
  if (config.radius <= 0) throw new LayoutContractError('invalid-experiment-v2', 'radius must be positive');
  if (config.demandCompression <= 0 || config.demandCompression > 1) throw new LayoutContractError('invalid-experiment-v2', 'demandCompression out of range');
  if (config.glyphRadiusCss <= 0 || config.glyphRadiusCss > 32) throw new LayoutContractError('invalid-experiment-v2', 'glyphRadiusCss out of range');
  if (config.clearanceCss < 0 || config.clearanceCss > 64) throw new LayoutContractError('invalid-experiment-v2', 'clearanceCss out of range');
  if (config.referenceProjectionRadiusCss <= 0 || config.referenceProjectionRadiusCss > 4096) throw new LayoutContractError('invalid-experiment-v2', 'referenceProjectionRadiusCss out of range');
  if (config.workspaceScaleMin < 0.5 || config.workspaceScaleMax > 16 || config.workspaceScaleMin > config.workspaceScaleMax || config.workspaceScaleStep <= 0) {
    throw new LayoutContractError('invalid-experiment-v2', 'workspace scale range is invalid');
  }
  return Object.freeze(config);
}
export function v2ProjectionContract({
  calculationRadiusCss,
  displayBaseRadiusCss,
  workspaceScale,
  cameraZoom,
  resized = false
}) {
  for (const value of [calculationRadiusCss, displayBaseRadiusCss, workspaceScale, cameraZoom]) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new LayoutContractError('invalid-experiment-v2', 'projection contract values must be finite and positive');
    }
  }
  return {
    calculationRadiusCss,
    displayedRadiusCss: displayBaseRadiusCss * workspaceScale,
    workspaceScale,
    cameraZoom,
    feasibilityGuaranteeApplicable: !resized,
    scope: 'local sibling angular capacity only; not a global node-clearance guarantee'
  };
}


