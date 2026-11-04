import { Graph } from '../graph/index.js';
import { LIMITS, TreeLoadError } from './errors.js';
import { cloneMetadata } from './metadata.js';

const ALLOWED_FIELDS = new Set(['id', 'name', 'kind', 'data', 'children']);

/**
 * Merge and validate loader limits.
 * @param {Partial<typeof LIMITS>} [overrides]
 * @returns {typeof LIMITS}
 */
export function normalizeLimits(overrides = {}) {
  const limits = { ...LIMITS, ...overrides };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`Loader limit ${key} must be a positive safe integer`);
    }
  }
  return Object.freeze(limits);
}

/**
 * @param {unknown} value
 * @param {string} path
 */
function requirePlainObject(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TreeLoadError('invalid-node', path, 'node must be a plain object');
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new TreeLoadError('invalid-node', path, 'node must have Object.prototype or null prototype');
  }
}

/**
 * Read own data descriptors without touching accessor values. Non-enumerable
 * fields are rejected for nodes (array length is the only allowed exception).
 * Symbol fields are rejected throughout the supported plain-data contract.
 * @param {object} value
 * @param {string} path
 * @param {boolean} [allowLength]
 * @returns {Map<string, PropertyDescriptor>}
 */
function readOwnDescriptors(value, path, allowLength = false) {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TreeLoadError('invalid-node', path, 'symbol fields are not supported');
  }
  const descriptors = new Map();
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) throw new TreeLoadError('invalid-node', `${path}.${key}`, 'missing descriptor');
    if (typeof descriptor.get === 'function' || typeof descriptor.set === 'function') {
      throw new TreeLoadError('accessor', `${path}.${key}`, 'accessor properties are not supported');
    }
    if (!descriptor.enumerable && !(allowLength && key === 'length')) {
      throw new TreeLoadError('non-enumerable', `${path}.${key}`, 'non-enumerable fields are not supported');
    }
    descriptors.set(key, descriptor);
  }
  return descriptors;
}

/**
 * Validate node fields before any value is read. Mandatory fields must be own,
 * enumerable data properties. Unknown/non-enumerable/accessor/symbol fields are
 * rejected. Proxy inputs are outside this plain-data contract and may execute
 * their own traps during this inspection.
 * @param {object} node
 * @param {string} path
 * @returns {Map<string, PropertyDescriptor>}
 */
function readNodeFields(node, path) {
  const descriptors = readOwnDescriptors(node, path);
  for (const key of descriptors.keys()) {
    if (!ALLOWED_FIELDS.has(key)) {
      throw new TreeLoadError('unknown-field', `${path}.${key}`, 'unexpected node field');
    }
  }
  for (const key of ['id', 'name', 'kind']) {
    if (!descriptors.has(key)) {
      throw new TreeLoadError('missing-field', `${path}.${key}`, 'mandatory field is missing');
    }
  }
  return descriptors;
}

/**
 * Validate a children array structurally, then return its values. The array
 * must be dense, have no extra/symbol/accessor/non-enumerable properties, and
 * only the normal length property is non-enumerable.
 * @param {unknown} value
 * @param {string} path
 * @param {typeof LIMITS} limits
 * @returns {unknown[]}
 */
function readChildren(value, path, limits) {
  if (!Array.isArray(value)) {
    throw new TreeLoadError('invalid-children', path, 'children must be an array');
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TreeLoadError('invalid-children', path, 'children array cannot have symbol fields');
  }
  const descriptors = readOwnDescriptors(value, path, true);
  const lengthDescriptor = descriptors.get('length');
  if (!lengthDescriptor || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
    throw new TreeLoadError('invalid-children', path, 'children array has no valid length');
  }
  const length = lengthDescriptor.value;
  if (length > limits.maxChildren) {
    throw new TreeLoadError('children-limit', path, 'child count exceeds limit');
  }
  if (descriptors.size !== length + 1) {
    throw new TreeLoadError('invalid-children', path, 'sparse arrays or extra properties are not supported');
  }
  const values = [];
  for (let i = 0; i < length; i += 1) {
    const descriptor = descriptors.get(String(i));
    if (!descriptor) {
      throw new TreeLoadError('invalid-children', `${path}[${i}]`, 'sparse children array');
    }
    if (!descriptor.enumerable) {
      throw new TreeLoadError('non-enumerable', `${path}[${i}]`, 'non-enumerable child entries are not supported');
    }
    values.push(descriptor.value);
  }
  return values;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {typeof LIMITS} limits
 */
function validateName(value, path, limits) {
  if (typeof value !== 'string' || value.length > limits.maxNameLength) {
    throw new TreeLoadError('invalid-name', path, 'name must be a bounded string');
  }
  return value;
}

/**
 * Load a rooted folder/file tree into a new Graph.
 *
 * Tree-only: root arrays (legacy graph adjacency form) are rejected rather than
 * silently interpreted as a tree. Validation and graph construction complete
 * before an optional target graph is replaced.
 *
 * @param {object} tree
 * @param {{limits?: Partial<typeof LIMITS>, positionClass?: Function, nodeDefaults?: object, targetGraph?: Graph}} [options]
 * @returns {{graph: Graph, rootId: string}}
 */
export function loadTree(tree, options = {}) {
  if (Array.isArray(tree)) {
    throw new TreeLoadError('unsupported-graph', 'root', 'graph adjacency arrays are not supported; provide a rooted tree');
  }
  const limits = normalizeLimits(options.limits);
  const targetGraph = options.targetGraph;
  if (targetGraph !== undefined && !(targetGraph instanceof Graph)) {
    throw new TypeError('targetGraph must be a Graph');
  }
  const effectivePositionClass = options.positionClass !== undefined
    ? options.positionClass
    : (targetGraph ? targetGraph.positionClass : undefined);
  const effectiveNodeDefaults = options.nodeDefaults !== undefined
    ? options.nodeDefaults
    : (targetGraph ? targetGraph.nodeDefaults : {});
  const effectiveMetadataLimits = options.limits !== undefined
    ? limits
    : (targetGraph ? targetGraph.metadataLimits : limits);
  const graph = new Graph({
    positionClass: effectivePositionClass,
    nodeDefaults: effectiveNodeDefaults,
    metadataLimits: effectiveMetadataLimits
  });

  requirePlainObject(tree, 'root');
  const seenObjects = new WeakSet();
  const seenIds = new Set();
  const stack = [{ input: tree, parent: null, depth: 0, path: 'root' }];
  let nodeCount = 0;
  let rootId = null;

  while (stack.length > 0) {
    const frame = stack.pop();
    const input = frame.input;
    requirePlainObject(input, frame.path);
    const descriptors = readNodeFields(input, frame.path);

    if (seenObjects.has(input)) {
      throw new TreeLoadError('cycle', frame.path, 'repeated or cyclic node object');
    }
    seenObjects.add(input);

    const id = descriptors.get('id').value;
    if (typeof id !== 'string' || id.length === 0) {
      throw new TreeLoadError('invalid-id', `${frame.path}.id`, 'id must be a non-empty string');
    }
    if (id.length > limits.maxIdLength) {
      throw new TreeLoadError('invalid-id', `${frame.path}.id`, 'id exceeds length limit');
    }
    if (seenIds.has(id)) {
      throw new TreeLoadError('duplicate-id', `${frame.path}.id`, `duplicate id ${JSON.stringify(id)}`);
    }
    seenIds.add(id);

    const name = validateName(descriptors.get('name').value, `${frame.path}.name`, limits);
    const kind = descriptors.get('kind').value;
    if (kind !== 'folder' && kind !== 'file') {
      throw new TreeLoadError('invalid-kind', `${frame.path}.kind`, "kind must be 'folder' or 'file'");
    }
    if (frame.depth > limits.maxDepth) {
      throw new TreeLoadError('depth-limit', frame.path, 'tree depth exceeds limit');
    }
    nodeCount += 1;
    if (nodeCount > limits.maxNodes) {
      throw new TreeLoadError('node-limit', frame.path, 'node count exceeds limit');
    }

    let data = Object.create(null);
    if (descriptors.has('data')) {
      const dataValue = descriptors.get('data').value;
      requirePlainObject(dataValue, `${frame.path}.data`);
      data = /** @type {object} */ (cloneMetadata(dataValue, limits, `${frame.path}.data`));
    }
    if (frame.parent === null && rootId === null) rootId = id;

    const graphNode = graph.addNode({ id, name, kind, data });
    if (frame.parent) graph.addAdjacence(frame.parent, graphNode);

    if (descriptors.has('children')) {
      const children = readChildren(descriptors.get('children').value, `${frame.path}.children`, limits);
      if (kind === 'file' && children.length > 0) {
        throw new TreeLoadError('file-children', `${frame.path}.children`, 'file nodes cannot have children');
      }
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push({
          input: children[i],
          parent: graphNode,
          depth: frame.depth + 1,
          path: `${frame.path}.children[${i}]`
        });
      }
    }
  }

  if (rootId === null) throw new TreeLoadError('empty-tree', 'root', 'tree has no root');
  if (targetGraph) {
    targetGraph.replaceWith(graph);
    return { graph: targetGraph, rootId };
  }
  return { graph, rootId };
}
