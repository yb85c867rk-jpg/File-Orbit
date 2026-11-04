import { Polar } from '../math/index.js';
import { cloneMetadata } from '../data/metadata.js';
import { LIMITS } from '../data/errors.js';
import { GraphNode } from './node.js';
import { Adjacence } from './adjacence.js';
import { eachAdjacency } from './traversal.js';

/** @param {object} entity @param {string} [flags] */
function passesFlags(entity, flags) {
  if (!flags || typeof flags !== 'string') return true;
  for (const prop of flags.split(/\s+/)) {
    if (prop && entity[prop]) return false;
  }
  return true;
}

/**
 * M2 Hypertree graph model.
 *
 * Node/edge storage uses Map insertion order. Node IDs are strings. The
 * traversal methods deliberately reproduce the legacy non-integer-key order
 * and the legacy reverse-sibling `computeLevels`/`eachBFS` schedule; for
 * integer-like IDs this intentionally differs from JavaScript object
 * enumeration (see M2 docs).
 */
export class Graph {
  /**
   * @param {{positionClass?: Function, nodeDefaults?: object, metadataLimits?: typeof LIMITS}} [options]
   */
  constructor(options = {}) {
    if (options.positionClass !== undefined && typeof options.positionClass !== 'function') {
      throw new TypeError('Graph positionClass must be a constructor');
    }
    this.positionClass = options.positionClass || Polar;
    this.nodeDefaults = Object.freeze({ ...(options.nodeDefaults || {}) });
    this.metadataLimits = Object.freeze({ ...LIMITS, ...(options.metadataLimits || {}) });
    this.nodes = new Map();
    this.edges = new Map();
  }

  /** @param {string} id */
  getNode(id) {
    if (typeof id !== 'string') return false;
    return this.nodes.get(id) || false;
  }

  /** @param {string} id */
  get(id) {
    return this.getNode(id);
  }

  /** @param {string} name */
  getByName(name) {
    for (const node of this.nodes.values()) {
      if (node.name === name) return node;
    }
    return false;
  }

  /**
   * @param {string} id
   * @param {string} id2
   */
  getAdjacence(id, id2) {
    const row = this.edges.get(id);
    if (!row) return false;
    return row.get(id2) || false;
  }

  /**
   * @param {{id:string,name?:string,kind?:string,data?:object}} obj
   * @returns {GraphNode}
   */
  addNode(obj) {
    if (!obj || typeof obj.id !== 'string') throw new TypeError('Graph.addNode requires a string id');
    const existing = this.nodes.get(obj.id);
    if (existing) return existing;

    let data = Object.create(null);
    if (obj.data !== undefined) {
      data = /** @type {object} */ (cloneMetadata(obj.data, this.metadataLimits, `node.${obj.id}.data`));
    }
    const node = new GraphNode({
      id: obj.id,
      name: typeof obj.name === 'string' ? obj.name : obj.id,
      kind: typeof obj.kind === 'string' ? obj.kind : '',
      data
    }, {
      positionClass: this.positionClass,
      nodeDefaults: this.nodeDefaults
    });
    this.nodes.set(node.id, node);
    const edgeMap = new Map();
    this.edges.set(node.id, edgeMap);
    node.adjacencies = edgeMap;
    return node;
  }

  /**
   * @param {{id:string}} obj
   * @param {{id:string}} obj2
   * @param {object} [data]
   * @returns {Adjacence}
   */
  addAdjacence(obj, obj2, data) {
    const from = this.nodes.get(obj.id) || this.addNode({ id: obj.id });
    const to = this.nodes.get(obj2.id) || this.addNode({ id: obj2.id });
    const existing = this.getAdjacence(from.id, to.id);
    if (existing) return existing;

    const edgeData = data === undefined
      ? Object.create(null)
      : /** @type {object} */ (cloneMetadata(data, this.metadataLimits, `edge.${from.id}.${to.id}.data`));
    const forward = new Adjacence(from, to, edgeData);
    const reverse = new Adjacence(to, from, edgeData);
    this.edges.get(from.id).set(to.id, forward);
    this.edges.get(to.id).set(from.id, reverse);
    return forward;
  }

  /** @param {string} id */
  removeNode(id) {
    const node = this.nodes.get(id);
    if (!node) return;
    const row = this.edges.get(id);
    if (row) {
      for (const neighbor of row.keys()) {
        const reverse = this.edges.get(neighbor);
        if (reverse) reverse.delete(id);
      }
    }
    this.edges.delete(id);
    this.nodes.delete(id);
  }

  /**
   * @param {string} id1
   * @param {string} id2
   */
  removeAdjacence(id1, id2) {
    this.edges.get(id1)?.delete(id2);
    this.edges.get(id2)?.delete(id1);
  }

  /** @param {string} id */
  hasNode(id) {
    return typeof id === 'string' && this.nodes.has(id);
  }

  empty() {
    this.nodes.clear();
    this.edges.clear();
  }

  /** @param {Graph} other */
  replaceWith(other) {
    if (!(other instanceof Graph)) throw new TypeError('replaceWith requires a Graph');
    this.positionClass = other.positionClass;
    this.nodeDefaults = other.nodeDefaults;
    this.metadataLimits = other.metadataLimits;
    this.nodes = other.nodes;
    this.edges = other.edges;
  }

  /**
   * @param {(node: GraphNode) => void} action
   * @param {string} [flags]
   */
  eachNode(action, flags) {
    for (const node of this.nodes.values()) {
      if (passesFlags(node, flags)) action(node);
    }
  }

  /** @param {(node: GraphNode) => void} action @param {string} [flags] */
  each(action, flags) {
    this.eachNode(action, flags);
  }

  /**
   * Legacy-compatible level computation. The reverse-sibling queue is
   * intentional: it matches the legacy `unshift`/`pop` schedule.
   * @param {string} id
   * @param {number} [startDepth]
   * @param {string} [flags]
   */
  computeLevels(id, startDepth = 0, flags) {
    for (const node of this.nodes.values()) {
      node._flag = false;
      node._depth = -1;
    }
    const root = this.getNode(id);
    if (!root) throw new Error(`Graph.computeLevels: unknown root ${id}`);
    root._depth = startDepth;
    const queue = [root];
    while (queue.length > 0) {
      const node = queue.pop();
      node._flag = true;
      eachAdjacency(node, (adj) => {
        const next = adj.nodeTo;
        if (!next._flag && passesFlags(next, flags) && !adj._hiding) {
          if (next._depth < 0) next._depth = node._depth + 1 + startDepth;
          queue.unshift(next);
        }
      }, flags);
    }
  }

  /**
   * @param {string} id
   * @param {(node: GraphNode, depth: number) => void} action
   * @param {string} [flags]
   */
  eachBFS(id, action, flags) {
    this.clean();
    const queue = [this.getNode(id)];
    while (queue.length > 0) {
      const node = queue.pop();
      if (!node) return;
      node._flag = true;
      action(node, node._depth);
      eachAdjacency(node, (adj) => {
        const next = adj.nodeTo;
        if (!next._flag && passesFlags(next, flags) && !adj._hiding) {
          next._flag = true;
          queue.unshift(next);
        }
      }, flags);
    }
  }

  clean() {
    for (const node of this.nodes.values()) node._flag = false;
  }

  /**
   * First node in Map insertion order wins ties (strict `<` comparison).
   * @param {object} pos
   * @param {string} [prop]
   * @param {string} [flags]
   */
  getClosestNodeToPos(pos, prop = 'current', flags) {
    const target = pos && typeof pos.getc === 'function' ? pos.getc(true) : pos;
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
      throw new TypeError('Graph.getClosestNodeToPos requires a finite x/y position');
    }
    let found = null;
    let best = Infinity;
    for (const node of this.nodes.values()) {
      if (!passesFlags(node, flags)) continue;
      const point = node.getPos(prop).getc(true);
      const dx = point.x - target.x;
      const dy = point.y - target.y;
      const distance = dx * dx + dy * dy;
      if (distance < best) {
        best = distance;
        found = node;
      }
    }
    return found;
  }

  /** @param {string} [prop] @param {string} [flags] */
  getClosestNodeToOrigin(prop = 'current', flags) {
    return this.getClosestNodeToPos(new Polar(0, 0), prop, flags);
  }
}
