/**
 * Pure immediate Hypertree focus-view transformation.
 *
 * Legacy audit:
 * - Hypertree.move() accepts a point, finds the closest node, and animates via
 *   the legacy "moebius" mode with `vector` (jit.js:18114-18133).
 * - Graph.Util.moebiusTransformation negates the vector (jit.js:17843-17849),
 *   then Complex.moebiusTransformation computes `(z + c) / (1 + conj(c) z)`
 *   (jit.js:17821-17826).
 * - Therefore centering a requested point f uses c = -f.
 *
 * Modern intentional differences:
 * - The requested stable ID is used directly; there is no closest-node
 *   substitution.
 * - The structural root/topology and accepted M3 layout are not modified.
 * - The focused view is a pure copy resolved from an authoritative base.
 */
import { mobiusTransform } from '../math/index.js';
import { GraphRenderError } from '../render/errors.js';

export const FOCUS_CENTER_TOLERANCE = 1e-12;

/**
 * @param {object} base accepted computeRadialLayout result
 * @param {{focusId?: string|null, phase?: string}} [options]
 */
export function createFocusView(base, options = {}) {
  const baseLayout = requireBase(base);
  const phase = requirePhase(baseLayout, options.phase);
  const focusId = requireFocusId(baseLayout, options.focusId);
  const copied = copyLayout(baseLayout);
  validateCopiedPositions(copied);
  if (focusId === null) {
    return {
      requestedId: null,
      centeredId: null,
      phase,
      parameter: { x: 0, y: 0 },
      baseFocusPosition: null,
      focusedPosition: null,
      centerError: 0,
      staged: copied
    };
  }

  const baseFocusPosition = readPosition(copied, focusId, phase);
  assertOpenDisk(baseFocusPosition, `focus node ${focusId}`);
  const parameter = { x: -baseFocusPosition.x, y: -baseFocusPosition.y };
  const transformedFocus = transformCopied(copied, parameter, phase, focusId);
  const centerError = Math.hypot(transformedFocus.x, transformedFocus.y);
  if (!Number.isFinite(centerError) || centerError > FOCUS_CENTER_TOLERANCE) {
    throw new GraphRenderError('focus-center', `focus center error ${centerError} exceeds ${FOCUS_CENTER_TOLERANCE}`);
  }
  return {
    requestedId: focusId,
    centeredId: focusId,
    phase,
    parameter,
    baseFocusPosition,
    focusedPosition: transformedFocus,
    centerError,
    staged: copied
  };
}

/** Möbius parameter c=-f for a requested base focus point f. */
export function focusParameter(base, focusId, phase) {
  const baseLayout = requireBase(base);
  const selectedPhase = requirePhase(baseLayout, phase);
  const selectedId = requireFocusId(baseLayout, focusId);
  if (selectedId === null) {
    throw new GraphRenderError('invalid-focus', 'focus ID is required for a focus parameter');
  }
  const copied = copyLayout(baseLayout);
  validateCopiedPositions(copied);
  const point = readPosition(copied, selectedId, selectedPhase);
  assertOpenDisk(point, `focus node ${selectedId}`);
  return { x: -point.x, y: -point.y };
}

/** Create a view at an explicit open-disk Möbius parameter. */
export function createFocusViewAtParameter(base, options = {}) {
  const baseLayout = requireBase(base);
  const phase = requirePhase(baseLayout, options.phase);
  const focusId = requireFocusId(baseLayout, options.focusId);
  const parameter = requireParameter(options.parameter);
  const copied = copyLayout(baseLayout);
  validateCopiedPositions(copied);
  const baseFocusPosition = focusId === null ? null : readPosition(copied, focusId, phase);
  const focusedPosition = transformCopied(copied, parameter, phase, focusId);
  return {
    requestedId: focusId,
    centeredId: focusId,
    phase,
    parameter,
    baseFocusPosition,
    focusedPosition,
    centerError: focusedPosition ? Math.hypot(focusedPosition.x, focusedPosition.y) : null,
    staged: copied
  };
}

function requirePhase(base, phase) {
  const selected = phase === undefined ? base.firstPhase : phase;
  if (typeof selected !== 'string' || !base.phases.includes(selected)) {
    throw new GraphRenderError('invalid-focus', 'focus phase must be one of the base phases');
  }
  return selected;
}

function requireFocusId(base, focusId) {
  const selected = focusId === undefined ? null : focusId;
  if (selected !== null && typeof selected !== 'string') {
    throw new GraphRenderError('invalid-focus', 'focus ID must be a string or null');
  }
  if (selected !== null && !base.nodes.has(selected)) {
    throw new GraphRenderError('invalid-focus', `unknown focus node ${JSON.stringify(selected)}`);
  }
  return selected;
}

function requireParameter(parameter) {
  if (!parameter || typeof parameter !== 'object'
      || typeof parameter.x !== 'number' || !Number.isFinite(parameter.x)
      || typeof parameter.y !== 'number' || !Number.isFinite(parameter.y)) {
    throw new GraphRenderError('invalid-focus', 'focus parameter must be finite');
  }
  assertOpenDisk(parameter, 'focus parameter');
  return { x: parameter.x, y: parameter.y };
}

function transformCopied(copied, parameter, phase, focusId) {
  if (parameter.x === 0 && parameter.y === 0) {
    return focusId === null ? null : readPosition(copied, focusId, phase);
  }
  let transformedFocus = null;
  for (const [id, record] of copied.nodes) {
    const input = readPosition(copied, id, phase);
    assertOpenDisk(input, `node ${id}`);
    let output;
    try {
      output = mobiusTransform(input, parameter);
    } catch (error) {
      throw new GraphRenderError('focus-singular', `Möbius transformation failed for ${id}: ${error.message}`);
    }
    if (!Number.isFinite(output.x) || !Number.isFinite(output.y)) {
      throw new GraphRenderError('focus-nonfinite', `Möbius result is not finite for ${id}`);
    }
    const result = { x: output.x, y: output.y };
    if (Math.hypot(result.x, result.y) >= 1) {
      throw new GraphRenderError('focus-disk', `Möbius result leaves the open disk for ${id}`);
    }
    const copiedRecord = copied.nodes.get(id);
    copiedRecord.positions.set(phase, {
      theta: Math.atan2(result.y, result.x),
      rho: Math.hypot(result.x, result.y)
    });
    if (id === focusId) transformedFocus = result;
  }
  if (focusId !== null && !transformedFocus) {
    throw new GraphRenderError('invalid-focus', 'focus node transformation was not produced');
  }
  return transformedFocus;
}
function requireBase(base) {
  if (!base || !(base.nodes instanceof Map) || !Array.isArray(base.phases)
      || typeof base.firstPhase !== 'string' || typeof base.rootId !== 'string'
      || !(base.children instanceof Map)) {
    throw new GraphRenderError('invalid-focus', 'accepted staged layout is required');
  }
  return base;
}

function copyLayout(base) {
  const nodes = new Map();
  for (const [id, record] of base.nodes) {
    if (!record || !(record.positions instanceof Map)) {
      throw new GraphRenderError('invalid-focus', 'staged node positions are required', id);
    }
    const positions = new Map();
    for (const [phase, position] of record.positions) {
      if (!position || typeof position !== 'object') {
        throw new GraphRenderError('invalid-focus', `node ${id} ${phase} position is invalid`);
      }
      positions.set(phase, { theta: position.theta, rho: position.rho });
    }
    nodes.set(id, {
      ...record,
      positions,
      spans: record.spans instanceof Map ? new Map(record.spans) : record.spans,
      dimQuotients: record.dimQuotients instanceof Map ? new Map(record.dimQuotients) : record.dimQuotients,
      angleSpan: record.angleSpan && typeof record.angleSpan === 'object'
        ? { ...record.angleSpan }
        : record.angleSpan
    });
  }
  const children = new Map([...base.children].map(([id, list]) => [id, [...list]]));
  const copied = {
    ...base,
    nodes,
    children,
    phases: [...base.phases]
  };
  for (const key of ['depths', 'angularWidths', 'treeAngularWidths', 'distances', 'placementDistances', 'scales']) {
    if (base[key] instanceof Map) copied[key] = new Map(base[key]);
  }
  return copied;
}

function validateCopiedPositions(layout) {
  for (const [id, record] of layout.nodes) {
    if (!(record.positions instanceof Map)) {
      throw new GraphRenderError('invalid-focus', 'staged node positions are required', id);
    }
    for (const phase of layout.phases) {
      const position = record.positions.get(phase);
      if (!position || !Number.isFinite(position.theta) || !Number.isFinite(position.rho)
          || position.rho < 0) {
        throw new GraphRenderError('invalid-focus', `node ${id} has an invalid ${phase} position`);
      }
      const x = position.rho * Math.cos(position.theta);
      const y = position.rho * Math.sin(position.theta);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new GraphRenderError('invalid-focus', `node ${id} ${phase} Cartesian position is not finite`);
      }
      assertOpenDisk({ x, y }, `node ${id} ${phase}`);
    }
  }
}
function readPosition(base, id, phase) {
  const record = base.nodes.get(id);
  const position = record && record.positions ? record.positions.get(phase) : null;
  if (!position || !Number.isFinite(position.theta) || !Number.isFinite(position.rho)
      || position.rho < 0) {
    throw new GraphRenderError('invalid-focus', `node ${id} has an invalid ${phase} position`);
  }
  const x = position.rho * Math.cos(position.theta);
  const y = position.rho * Math.sin(position.theta);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new GraphRenderError('invalid-focus', `node ${id} Cartesian position is not finite`);
  }
  return { x, y };
}

function assertOpenDisk(point, label) {
  const norm = Math.hypot(point.x, point.y);
  if (!Number.isFinite(norm) || norm >= 1) {
    throw new GraphRenderError('focus-disk', `${label} must be strictly inside the open unit disk`);
  }
}


