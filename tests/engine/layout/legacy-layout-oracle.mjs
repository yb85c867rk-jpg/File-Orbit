/**
 * Isolated actual-legacy angular-width oracle.
 *
 * Loads the unchanged vendor jit.js and calls the real legacy
 * Layouts.Radial.setAngularWidthForNodes / setSubtreesAngularWidth methods.
 * No legacy formula is reimplemented here.
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
  navigator: { userAgent: 'hypetree-m3-oracle' },
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
if (!$jit || typeof $jit.Graph !== 'function' || !$jit.Layouts || !$jit.Layouts.Radial || typeof $jit.Hypertree !== 'function') {
  throw new Error('legacy JIT did not expose Graph/Layouts.Radial/Hypertree');
}

export const Legacy = Object.freeze({
  Graph: $jit.Graph,
  Polar: $jit.Polar,
  Radial: $jit.Layouts.Radial,
  Hypertree: $jit.Hypertree
});

const NODE_CONFIG = Object.freeze({
  overridable: true,
  dim: 3,
  angularWidth: 1,
  span: 1,
  autoWidth: false,
  autoHeight: false
});

/**
 * Build a legacy graph from a M2-style tree with the accepted non-integer
 * insertion policy: preorder node insertion, children ascending, parent edge
 * before child edges.
 * @param {object} tree
 */
export function buildLegacyTree(tree) {
  const graph = new Legacy.Graph({
    klass: Legacy.Polar,
    Node: { selected: false, exist: true, drawn: true }
  }, NODE_CONFIG, {}, {});
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

/**
 * Execute the actual legacy angular-width methods on an isolated graph.
 * @param {object} tree
 * @param {string} rootId
 */
export function legacyAngularWidths(tree, rootId) {
  const graph = buildLegacyTree(tree);
  graph.computeLevels(rootId, 0, 'ignore');

  const host = Object.create(Legacy.Radial.prototype);
  host.graph = graph;
  host.root = rootId;
  host.parent = null;
  host.config = { Node: NODE_CONFIG };
  host.setAngularWidthForNodes(['current', 'start', 'end']);
  host.setSubtreesAngularWidth();

  const depths = new Map();
  const angularWidths = new Map();
  const treeAngularWidths = new Map();
  for (const id of Object.keys(graph.nodes)) {
    const node = graph.nodes[id];
    depths.set(id, node._depth);
    angularWidths.set(id, node._angularWidth);
    treeAngularWidths.set(id, node._treeAngularWidth);
  }
  return {
    graph,
    rootId,
    depths,
    angularWidths,
    treeAngularWidths,
    rootAngularWidth: angularWidths.get(rootId),
    rootTreeAngularWidth: treeAngularWidths.get(rootId)
  };
}

/**
 * Execute the actual legacy Hypertree.createLevelDistanceFunc on an isolated
 * graph. This sets legacy node.scale and returns legacy distances; it does not
 * execute radial positions or the full legacy layout.
 * @param {object} tree
 * @param {string} rootId
 * @param {{radius:number, offset:number}} options
 */
export function legacyLevelDistances(tree, rootId, options) {
  const graph = buildLegacyTree(tree);
  graph.computeLevels(rootId, 0, 'ignore');
  const host = Object.create(Legacy.Hypertree.prototype);
  host.graph = graph;
  host.config = { offset: options.offset };
  host.getRadius = () => options.radius;
  const distanceFunc = host.createLevelDistanceFunc();

  const distances = new Map();
  const scales = new Map();
  for (const id of Object.keys(graph.nodes)) {
    const node = graph.nodes[id];
    distances.set(id, distanceFunc(node));
    scales.set(id, node.scale);
  }
  return { graph, distances, scales };
}

/**
 * Execute actual legacy Layouts.Radial.compute (including NodeDim and position
 * allocation) on an isolated graph. autoWidth/autoHeight stay false; the DOM
 * stub only supports NodeDim label initialization.
 * @param {object} tree
 * @param {string} rootId
 * @param {{radius:number, offset:number, phases:string[], beforeCompute?: (graph:object)=>void}} options
 */
export function legacyRadialLayout(tree, rootId, options) {
  const graph = buildLegacyTree(tree);
  if (options.beforeCompute) options.beforeCompute(graph);
  const host = Object.create(Legacy.Radial.prototype);
  host.graph = graph;
  host.root = rootId;
  host.parent = null;
  host.config = { Node: NODE_CONFIG, offset: options.offset };
  host.getRadius = () => options.radius;
  host.createLevelDistanceFunc = Legacy.Hypertree.prototype.createLevelDistanceFunc;
  host.compute(options.phases);

  const phases = options.phases;
  const result = new Map();
  for (const id of Object.keys(graph.nodes)) {
    const node = graph.nodes[id];
    const positions = new Map();
    const spans = new Map();
    const dimQuotients = new Map();
    const hasDimQuotient = new Map();
    for (const phase of phases) {
      const pos = node.getPos(phase);
      positions.set(phase, { theta: pos.theta, rho: pos.rho });
      const store = phase === 'start' ? node.startData : phase === 'end' ? node.endData : node.data;
      spans.set(phase, store.$span);
      hasDimQuotient.set(phase, Object.prototype.hasOwnProperty.call(store, '$dim-quotient'));
      dimQuotients.set(phase, store['$dim-quotient']);
    }
    result.set(id, {
      depth: node._depth,
      positions,
      spans,
      dimQuotients,
      hasDimQuotient,
      angleSpan: node.angleSpan ? { begin: node.angleSpan.begin, end: node.angleSpan.end } : null,
      scale: node.scale
    });
  }
  return { graph, nodes: result };
}
