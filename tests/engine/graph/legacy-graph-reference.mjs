/**
 * Isolated legacy Graph oracle for M2 comparisons.
 *
 * Loads the unchanged vendor jit.js as a classic script in a Node VM and builds
 * the same tree shape with the legacy Graph API.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const JIT_PATH = path.resolve(here, '../../../vendor/jit/jit.2.0.1.js');
export const JIT_SHA256 = '4A413A0A21435AEE893EBE3572CAEB5EA81B14C437FA8BEC3AABB5F7A921546F';

const source = readFileSync(JIT_PATH, 'utf8');
const actual = createHash('sha256').update(source).digest('hex').toUpperCase();
if (actual !== JIT_SHA256) throw new Error(`vendor jit.js hash changed: ${actual}`);

function element() {
  return {
    style: {},
    appendChild() {},
    setAttribute() {},
    setAttributeNS() {},
    getContext() { return null; }
  };
}
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  navigator: { userAgent: 'hypetree-m2-test' },
  document: {
    getElementById() { return null; },
    createElement: element,
    createElementNS: element,
    body: { appendChild() {}, children: [] }
  }
};
sandbox.window = sandbox;
const context = createContext(sandbox);
runInContext(source, context, { filename: JIT_PATH });
const $jit = sandbox.$jit;
if (!$jit || typeof $jit.Graph !== 'function' || typeof $jit.Polar !== 'function') {
  throw new Error('legacy JIT did not expose Graph/Polar');
}

export const Legacy = Object.freeze({ Graph: $jit.Graph, Polar: $jit.Polar });

/**
 * Build a legacy tree graph iteratively, mirroring Loader.construct for trees.
 * @param {object} tree
 */
export function buildLegacyTree(tree) {
  const graph = new Legacy.Graph({
    klass: Legacy.Polar,
    Node: { selected: false, exist: true, drawn: true }
  }, {}, {}, {});
  const stack = [{ input: tree, parent: null }];
  while (stack.length > 0) {
    const frame = stack.pop();
    graph.addNode(frame.input);
    if (frame.parent) graph.addAdjacence(frame.parent, frame.input);
    const children = frame.input.children || [];
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push({ input: children[i], parent: frame.input });
    }
  }
  return graph;
}

/** @param {object} graph */
export function legacyNodeIds(graph) {
  const ids = [];
  for (const id in graph.nodes) ids.push(id);
  return ids;
}

/** @param {object} graph */
export function legacyEdgePairs(graph) {
  const pairs = new Set();
  for (const id in graph.nodes) {
    const node = graph.nodes[id];
    for (const other in node.adjacencies) {
      pairs.add([id, other].sort().join('|'));
    }
  }
  return [...pairs].sort();
}

/** @param {object} graph @param {string} id @param {string} type @param {number} theta @param {number} rho */
export function legacySetPolar(graph, id, type, theta, rho) {
  graph.getNode(id).setPos(new Legacy.Polar(theta, rho), type);
}

/** @param {object} graph @param {string} id @param {string} type */
export function legacyGetPolar(graph, id, type) {
  const pos = graph.getNode(id).getPos(type);
  return { theta: pos.theta, rho: pos.rho };
}

/** @param {object} graph @param {string} id @param {string} [flags] */
export function legacyBfsIds(graph, id, flags) {
  const ids = [];
  graph.eachBFS(id, (node) => ids.push(node.id), flags);
  return ids;
}

/** @param {object} graph @param {string} id */
export function legacySubnodeIds(graph, id) {
  const ids = [];
  graph.getNode(id).eachSubnode((node) => ids.push(node.id));
  return ids;
}

/** @param {object} graph @param {string} id */
export function legacyParentIds(graph, id) {
  return graph.getNode(id).getParents().map((node) => node.id);
}

/** @param {object} graph @param {object} pos */
export function legacyClosestId(graph, pos) {
  const node = graph.getClosestNodeToPos(pos);
  return node ? node.id : null;
}
