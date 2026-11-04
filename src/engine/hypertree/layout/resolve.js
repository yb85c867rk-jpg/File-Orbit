import { LayoutContractError } from './errors.js';

export const PHASES = Object.freeze(['current', 'start', 'end']);

export const DEFAULT_NODE_OPTIONS = Object.freeze({
  overridable: false,
  dim: 3,
  angularWidth: 1,
  span: 1
});

const NUMERIC_PROPS = Object.freeze({
  dim: { min: 0, defaultValue: 3 },
  angularWidth: { minExclusive: 0, defaultValue: 1 },
  span: { min: 0, defaultValue: 1 }
});

/**
 * Normalize a phase list. A string selects one phase; undefined selects all.
 * @param {string|string[]|undefined} phases
 * @returns {readonly string[]}
 */
export function normalizePhases(phases) {
  const list = phases === undefined ? [...PHASES] : (typeof phases === 'string' ? [phases] : phases);
  if (!Array.isArray(list) || list.length === 0) {
    throw new LayoutContractError('invalid-phase', 'phases must be a non-empty string or array');
  }
  const seen = new Set();
  for (const phase of list) {
    if (!PHASES.includes(phase)) {
      throw new LayoutContractError('invalid-phase', `unsupported phase ${JSON.stringify(phase)}`);
    }
    if (seen.has(phase)) {
      throw new LayoutContractError('invalid-phase', `duplicate phase ${phase}`);
    }
    seen.add(phase);
  }
  return Object.freeze([...list]);
}

/**
 * Snapshot/validate node option defaults. No caller object is retained.
 * @param {object} [options]
 * @returns {Readonly<typeof DEFAULT_NODE_OPTIONS>}
 */
export function normalizeNodeOptions(options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new LayoutContractError('invalid-option', 'nodeOptions must be an object');
  }
  const overridable = options.overridable === undefined ? false : options.overridable;
  if (typeof overridable !== 'boolean') {
    throw new LayoutContractError('invalid-option', 'nodeOptions.overridable must be boolean');
  }
  return Object.freeze({
    overridable,
    dim: normalizeNumericOption('dim', options.dim === undefined ? DEFAULT_NODE_OPTIONS.dim : options.dim),
    angularWidth: normalizeNumericOption('angularWidth', options.angularWidth === undefined ? DEFAULT_NODE_OPTIONS.angularWidth : options.angularWidth),
    span: normalizeNumericOption('span', options.span === undefined ? DEFAULT_NODE_OPTIONS.span : options.span)
  });
}

/** @param {string} prop @param {unknown} value */
function normalizeNumericOption(prop, value) {
  const rule = NUMERIC_PROPS[prop];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new LayoutContractError('invalid-option', `nodeOptions.${prop} must be finite`);
  }
  if (rule.min !== undefined && value < rule.min) {
    throw new LayoutContractError('invalid-option', `nodeOptions.${prop} must be >= ${rule.min}`);
  }
  if (rule.minExclusive !== undefined && value <= rule.minExclusive) {
    throw new LayoutContractError('invalid-option', `nodeOptions.${prop} must be > ${rule.minExclusive}`);
  }
  return value;
}

/** @param {object} data @param {string} key */
function hasOwn(data, key) {
  return data !== null && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, key);
}

/**
 * Resolve a numeric layout property without using M2 getData's fallback 0.
 *
 * Precedence:
 * - overridable=false: config/default, ignore node data;
 * - overridable=true: selected-phase own `$prop` -> current own `$prop` ->
 *   config -> documented default.
 *
 * @param {object} node accepted M2 GraphNode-like object
 * @param {'dim'|'angularWidth'|'span'} prop
 * @param {string} phase
 * @param {Readonly<typeof DEFAULT_NODE_OPTIONS>} options normalized options
 * @returns {number}
 */
export function resolveNodeNumber(node, prop, phase, options) {
  if (!node || typeof node !== 'object') {
    throw new LayoutContractError('invalid-node', 'node must be an object');
  }
  if (!NUMERIC_PROPS[prop]) {
    throw new LayoutContractError('unknown-property', `unsupported layout property ${JSON.stringify(prop)}`);
  }
  if (!PHASES.includes(phase)) {
    throw new LayoutContractError('invalid-phase', `unsupported phase ${JSON.stringify(phase)}`, node.id);
  }
  if (!options || typeof options !== 'object') {
    throw new LayoutContractError('invalid-option', 'normalized node options are required', node.id);
  }

  const configValue = options[prop] === undefined ? NUMERIC_PROPS[prop].defaultValue : options[prop];
  let value = configValue;

  if (options.overridable === true) {
    const phaseStore = phase === 'start'
      ? node.startData
      : phase === 'end'
        ? node.endData
        : node.data;
    if (phaseStore === null || typeof phaseStore !== 'object') {
      throw new LayoutContractError('invalid-node', 'node phase data must be an object', node.id);
    }
    const key = `$${prop}`;
    if (hasOwn(phaseStore, key)) {
      value = phaseStore[key];
    } else if (phase !== 'current' && hasOwn(node.data, key)) {
      value = node.data[key];
    }
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new LayoutContractError(
      prop === 'angularWidth' ? 'invalid-angular-width' : prop === 'dim' ? 'invalid-dim' : 'invalid-span',
      `${prop} must be finite`,
      node.id
    );
  }
  const rule = NUMERIC_PROPS[prop];
  if (rule.min !== undefined && value < rule.min) {
    throw new LayoutContractError(
      prop === 'angularWidth' ? 'invalid-angular-width' : prop === 'dim' ? 'invalid-dim' : 'invalid-span',
      `${prop} must be >= ${rule.min}`,
      node.id
    );
  }
  if (rule.minExclusive !== undefined && value <= rule.minExclusive) {
    throw new LayoutContractError('invalid-angular-width', `${prop} must be > ${rule.minExclusive}`, node.id);
  }
  return value;
}

/** @param {object} node @param {string} phase @param {object} options */
export function resolveDim(node, phase, options) {
  return resolveNodeNumber(node, 'dim', phase, options);
}

/** @param {object} node @param {string} phase @param {object} options */
export function resolveAngularWidth(node, phase, options) {
  return resolveNodeNumber(node, 'angularWidth', phase, options);
}

/** @param {object} node @param {string} phase @param {object} options */
export function resolveSpan(node, phase, options) {
  return resolveNodeNumber(node, 'span', phase, options);
}
