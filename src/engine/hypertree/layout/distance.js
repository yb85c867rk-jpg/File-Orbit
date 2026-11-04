import { LIMITS } from '../data/errors.js';
import { LayoutContractError } from './errors.js';

const DEFAULT_OFFSET = 0;
const MIN_COEFFICIENT_INDEX = 0.51;
const COEFFICIENT_STEP = 0.01;
const COEFFICIENT_FALLBACK = 0.75;

/**
 * Stage Hypertree level distances from an accepted angular-width result.
 *
 * Legacy contract:
 * - `maxDepth` is the maximum staged node depth. The legacy local `depth`
 *   variable is `maxDepth + 1` and is used by coefficient selection.
 * - Coefficient selection runs the legacy float loop from 0.51 in 0.01 steps,
 *   uses `i - 0.01` on the first series >= 2, and otherwise uses 0.75.
 * - Distance for a node of depth d is the descending sum
 *   `a^(d+1) + a^d + ... + a`, then `- offset`.
 * - `radius` becomes `node.scale`; it is not multiplied into distance.
 * - Future radial placement evaluates distance on the parent for its children.
 *
 * @param {{
 *   rootId: string,
 *   depths: Map<string, number>,
 *   children: Map<string, string[]>
 * }} angular accepted computeAngularWidths result
 * @param {{radius: number, offset?: number}} options
 * @returns {{
 *   rootId: string,
 *   radius: number,
 *   offset: number,
 *   maxDepth: number,
 *   legacyDepth: number,
 *   coefficient: number,
 *   selection: 'loop'|'fallback',
 *   distances: Map<string, number>,
 *   scales: Map<string, number>,
 *   placementDistances: Map<string, number>
 * }}
 */
export function computeLevelDistances(angular, options = {}) {
  if (!angular || typeof angular !== 'object') {
    throw new LayoutContractError('invalid-angular-result', 'angular result must be an object');
  }
  if (typeof angular.rootId !== 'string' || angular.rootId.length === 0) {
    throw new LayoutContractError('invalid-root', 'angular result has no rootId');
  }
  if (!(angular.depths instanceof Map) || angular.depths.size === 0) {
    throw new LayoutContractError('invalid-depth', 'angular result must have non-empty staged depths');
  }
  if (!(angular.children instanceof Map)) {
    throw new LayoutContractError('invalid-topology', 'angular result must have staged children');
  }

  const radius = requireFiniteNumber(options.radius, 'radius', 'invalid-radius');
  if (radius <= 0) {
    throw new LayoutContractError('invalid-radius', 'radius must be > 0');
  }
  const offset = options.offset === undefined
    ? DEFAULT_OFFSET
    : requireFiniteNumber(options.offset, 'offset', 'invalid-offset');

  const maxDepth = stagedMaxDepth(angular);
  const legacyDepth = maxDepth + 1;
  const selection = selectCoefficient(legacyDepth);

  const distanceCache = new Map();
  const distances = new Map();
  const scales = new Map();
  for (const [id, depth] of angular.depths) {
    if (!Number.isSafeInteger(depth) || depth < 0) {
      throw new LayoutContractError('invalid-depth', 'depth must be a non-negative safe integer', id);
    }
    if (!distanceCache.has(depth)) {
      distanceCache.set(depth, legacyDistance(selection.coefficient, depth, offset));
    }
    const distance = distanceCache.get(depth);
    if (!Number.isFinite(distance)) {
      throw new LayoutContractError('numeric-overflow', 'distance is not finite', id);
    }
    distances.set(id, distance);
    scales.set(id, radius);
  }

  // Only a node that has children contributes a child rho. Raw leaf/single-root
  // distances are retained, but they are not placement distances.
  const placementDistances = new Map();
  for (const [id, childIds] of angular.children) {
    if (!Array.isArray(childIds) || childIds.length === 0) continue;
    const distance = distances.get(id);
    if (distance === undefined) {
      throw new LayoutContractError('invalid-depth', 'parent has no staged distance', id);
    }
    // Hypertree's ordinary placement domain is the open unit disk relative to
    // the canvas radius. Legacy parent distances are <1; offset can leave it.
    if (!(distance > 0) || !(distance < 1)) {
      throw new LayoutContractError(
        'radial-domain',
        'distance used for child placement must satisfy 0 < distance < 1',
        id
      );
    }
    for (const childId of childIds) {
      if (!angular.depths.has(childId)) {
        throw new LayoutContractError('invalid-topology', 'child has no staged depth', childId);
      }
    }
    placementDistances.set(id, distance);
  }

  return {
    rootId: angular.rootId,
    radius,
    offset,
    maxDepth,
    legacyDepth,
    coefficient: selection.coefficient,
    selection: selection.kind,
    distances,
    scales,
    placementDistances
  };
}

/** @param {unknown} value @param {string} name @param {string} code */
function requireFiniteNumber(value, name, code) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new LayoutContractError(code, `${name} must be a finite number; "auto" and coercion are not supported`);
  }
  return value;
}

/** @param {{rootId:string, depths:Map<string,number>}} angular */
function stagedMaxDepth(angular) {
  if (!angular.depths.has(angular.rootId)) {
    throw new LayoutContractError('invalid-root', 'root has no staged depth', angular.rootId);
  }
  if (angular.depths.get(angular.rootId) !== 0) {
    throw new LayoutContractError('invalid-depth', 'root depth must be 0', angular.rootId);
  }
  let maxDepth = 0;
  for (const [id, depth] of angular.depths) {
    if (!Number.isSafeInteger(depth) || depth < 0) {
      throw new LayoutContractError('invalid-depth', 'depth must be a non-negative safe integer', id);
    }
    if (depth > maxDepth) maxDepth = depth;
  }
  if (maxDepth > LIMITS.maxDepth) {
    throw new LayoutContractError('depth-limit', `max depth exceeds limit ${LIMITS.maxDepth}`);
  }
  return maxDepth;
}

/**
 * Exact legacy coefficient loop. Do not replace with a closed form: the
 * float stepping and `i - 0.01` result are observable.
 * @param {number} legacyDepth
 * @returns {{coefficient:number, kind:'loop'|'fallback'}}
 */
function selectCoefficient(legacyDepth) {
  for (let i = MIN_COEFFICIENT_INDEX; i <= 1; i += COEFFICIENT_STEP) {
    const valSeries = (1 - Math.pow(i, legacyDepth)) / (1 - i);
    if (valSeries >= 2) {
      return { coefficient: i - COEFFICIENT_STEP, kind: 'loop' };
    }
  }
  return { coefficient: COEFFICIENT_FALLBACK, kind: 'fallback' };
}

/**
 * Legacy descending Math.pow accumulation for one depth.
 * @param {number} coefficient
 * @param {number} depth
 * @param {number} offset
 */
function legacyDistance(coefficient, depth, offset) {
  let d = depth + 1;
  let acum = 0;
  while (d) {
    acum += Math.pow(coefficient, d);
    d -= 1;
  }
  return acum - offset;
}
