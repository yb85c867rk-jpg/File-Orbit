import { Graph, GraphNode } from '../graph/index.js';
import { Polar } from '../math/index.js';
import { stageRadialLayout } from './radial.js';
import { LayoutContractError } from './errors.js';

/**
 * Test-only seam. Not exported from layout/index.js. It runs after all staging
 * and destination preflight, before the first live write.
 * @type {null | ((staged: object) => void)}
 */
let beforeApplyHook = null;

/** @param {null | ((staged: object) => void)} hook */
export function __setCommitFailureHookForTests(hook) {
  if (hook !== null && typeof hook !== 'function') {
    throw new TypeError('commit hook must be null or a function');
  }
  beforeApplyHook = hook;
}

/**
 * Stage, preflight, and synchronously apply a complete radial layout.
 *
 * Supported targets: engine-owned M2 Graph/GraphNode and M1 Polar position
 * objects, with extensible data stores and writable own data properties.
 * Unsupported/frozen/accessor-backed targets fail before any write.
 *
 * @param {Graph} graph
 * @param {object} options accepted stageRadialLayout options
 * @returns {object} the staged result (now applied)
 */
export function computeRadialLayout(graph, options = {}) {
  const staged = stageRadialLayout(graph, options);
  const plan = prepareCommit(graph, staged);
  if (beforeApplyHook) beforeApplyHook(staged);
  applyCommit(plan);
  return staged;
}

/** @param {Graph} graph @param {object} staged */
function prepareCommit(graph, staged) {
  if (!(graph instanceof Graph)) {
    throw new LayoutContractError('unsupported-target', 'graph must be an engine-owned M2 Graph');
  }
  if (graph.positionClass !== Polar) {
    throw new LayoutContractError('unsupported-target', 'only M1 Polar position classes are supported');
  }
  const plan = [];
  for (const [id, record] of staged.nodes) {
    const node = graph.getNode(id);
    if (!node || !(node instanceof GraphNode)) {
      throw new LayoutContractError('unsupported-target', 'node must be an engine-owned GraphNode', id);
    }
    assertWritableSlot(node, '_depth', id);
    assertWritableSlot(node, '_angularWidth', id);
    assertWritableSlot(node, '_treeAngularWidth', id);
    assertWritableSlot(node, 'scale', id);
    assertWritableSlot(node, 'angleSpan', id);

    const phases = [];
    for (const phase of staged.phases) {
      const pos = phase === 'start' ? node.startPos : phase === 'end' ? node.endPos : node.pos;
      assertSupportedPosition(pos, id, phase);
      assertWritableOwn(pos, 'theta', `${id}.${phase}.theta`);
      assertWritableOwn(pos, 'rho', `${id}.${phase}.rho`);

      const store = phase === 'start' ? node.startData : phase === 'end' ? node.endData : node.data;
      assertExtensibleStore(store, `${id}.${phase}Data`);
      assertDataSlot(store, '$span', `${id}.${phase}.span`);
      if (id !== staged.rootId) {
        assertDataSlot(store, '$dim-quotient', `${id}.${phase}.dim-quotient`);
      }
      const span = record.spans.get(phase);
      const quotient = record.dimQuotients === null ? null : record.dimQuotients.get(phase);
      const position = record.positions.get(phase);
      if (!Number.isFinite(span) || span < 0) {
        throw new LayoutContractError('invalid-staged-value', 'span is invalid', id);
      }
      if (!position || !Number.isFinite(position.theta) || !Number.isFinite(position.rho)) {
        throw new LayoutContractError('invalid-staged-value', 'position is invalid', id);
      }
      if (id !== staged.rootId && (!Number.isFinite(quotient) || quotient < 0 || quotient > 1)) {
        throw new LayoutContractError('invalid-staged-value', 'dimension quotient is invalid', id);
      }
      phases.push({ phase, pos, store, span, quotient, theta: position.theta, rho: position.rho });
    }

    if (!record.angleSpan || !Number.isFinite(record.angleSpan.begin) || !Number.isFinite(record.angleSpan.end)) {
      throw new LayoutContractError('invalid-staged-value', 'angleSpan is invalid', id);
    }
    plan.push({
      node,
      id,
      depth: record.depth,
      angularWidth: record.angularWidth,
      treeAngularWidth: record.treeAngularWidth,
      scale: record.scale,
      angleSpan: { begin: record.angleSpan.begin, end: record.angleSpan.end },
      phases
    });
  }
  return plan;
}

/** @param {object} node @param {string} key @param {string} id */
function assertWritableSlot(node, key, id) {
  const descriptor = Object.getOwnPropertyDescriptor(node, key);
  if (!descriptor) {
    if (findInheritedDescriptor(node, key)) {
      throw new LayoutContractError('unsupported-target', `${key} is not an own planned slot`, id);
    }
    if (!Object.isExtensible(node)) {
      throw new LayoutContractError('unsupported-target', `${key} is missing on a non-extensible node`, id);
    }
    return;
  }
  if (!('value' in descriptor) || descriptor.writable !== true) {
    throw new LayoutContractError('unsupported-target', `${key} must be a writable own data property`, id);
  }
}

/** @param {unknown} pos @param {string} id @param {string} phase */
function assertSupportedPosition(pos, id, phase) {
  if (!(pos instanceof Polar) || pos.constructor !== Polar) {
    throw new LayoutContractError('unsupported-position', 'only M1 Polar position objects are supported', `${id}.${phase}`);
  }
}

/** @param {object} target @param {string} key @param {string} label */
function assertWritableOwn(target, key, label) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor || !('value' in descriptor) || descriptor.writable !== true) {
    throw new LayoutContractError('unsupported-target', `${key} must be a writable own data property`, label);
  }
}

/** @param {object} store @param {string} label */
function assertExtensibleStore(store, label) {
  if (store === null || typeof store !== 'object' || Array.isArray(store) || !Object.isExtensible(store)) {
    throw new LayoutContractError('unsupported-target', 'phase data store must be extensible', label);
  }
}

/** @param {object} store @param {string} key @param {string} label */
function assertDataSlot(store, key, label) {
  const descriptor = Object.getOwnPropertyDescriptor(store, key);
  if (descriptor) {
    if (!('value' in descriptor) || descriptor.writable !== true) {
      throw new LayoutContractError('unsupported-target', `${key} must be a writable own data property`, label);
    }
    return;
  }
  if (findInheritedDescriptor(store, key)) {
    throw new LayoutContractError('unsupported-target', `${key} is not an own planned data property`, label);
  }
}

/**
 * Find a descriptor on the prototype chain without reading/invoking the
 * property. Any inherited descriptor at a planned own-property name makes the
 * destination unsupported, avoiding inherited setters/read-only properties.
 * @param {object} target
 * @param {string} key
 * @returns {PropertyDescriptor | undefined}
 */
function findInheritedDescriptor(target, key) {
  let proto = Object.getPrototypeOf(target);
  while (proto !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (descriptor) return descriptor;
    proto = Object.getPrototypeOf(proto);
  }
  return undefined;
}

/** @param {Array<object>} plan */
function applyCommit(plan) {
  // All destinations were validated before this loop. Direct writes avoid
  // invoking setPos/setData or other overridable methods.
  for (const item of plan) {
    const node = item.node;
    node._depth = item.depth;
    node._angularWidth = item.angularWidth;
    node._treeAngularWidth = item.treeAngularWidth;
    node.scale = item.scale;
    node.angleSpan = item.angleSpan;
    for (const phase of item.phases) {
      phase.pos.theta = phase.theta;
      phase.pos.rho = phase.rho;
      phase.store['$span'] = phase.span;
      if (phase.quotient !== null) {
        phase.store['$dim-quotient'] = phase.quotient;
      }
    }
  }
}
