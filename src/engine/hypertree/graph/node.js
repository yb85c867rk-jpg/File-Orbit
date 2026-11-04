import { Polar } from '../math/index.js';
import {
  eachAdjacency,
  eachLevel,
  getParents,
  getSubnodes,
  isDescendantOf
} from './traversal.js';

/**
 * Graph node used by the Hypertree graph model.
 *
 * `pos`, `startPos`, and `endPos` are distinct position objects created from
 * `positionClass` (Polar by default). Metadata is stored in null-prototype
 * objects by the loader; `startData` and `endData` are independent stores.
 */
export class GraphNode {
  /**
   * @param {object} input
   * @param {string} input.id
   * @param {string} input.name
   * @param {string} input.kind
   * @param {object} [input.data]
   * @param {{positionClass?: Function, nodeDefaults?: object}} [options]
   */
  constructor(input, options = {}) {
    const positionClass = options.positionClass || Polar;
    const defaults = options.nodeDefaults || {};
    this.id = input.id;
    this.name = input.name;
    this.kind = input.kind;
    this.data = input.data || Object.create(null);
    this.startData = Object.create(null);
    this.endData = Object.create(null);
    this.adjacencies = new Map();
    this.selected = defaults.selected === true;
    this.drawn = defaults.drawn === true;
    this.exist = defaults.exist === true;
    this.visited = false;
    this._flag = false;
    this._depth = -1;
    this._level = 0;
    this._angularWidth = 0;
    this._treeAngularWidth = 0;
    this.angleSpan = { begin: 0, end: 0 };
    this.pos = new positionClass();
    this.startPos = new positionClass();
    this.endPos = new positionClass();
  }

  /** @param {string} id */
  getAdjacency(id) {
    return this.adjacencies.get(id);
  }

  /** @param {GraphNode} node */
  adjacentTo(node) {
    return this.adjacencies.has(node.id);
  }

  /** @param {string} [type] */
  getPos(type = 'current') {
    if (type === 'current') return this.pos;
    if (type === 'start') return this.startPos;
    if (type === 'end') return this.endPos;
    return undefined;
  }

  /**
   * @param {object} value
   * @param {string} [type]
   */
  setPos(value, type = 'current') {
    const slot = this.getPos(type);
    if (!slot) throw new TypeError(`Unknown position slot: ${type}`);
    if (value && typeof value.getp === 'function') {
      slot.set(value);
      return;
    }
    if (value && typeof value.setc === 'function' && Number.isFinite(value.x) && Number.isFinite(value.y)) {
      slot.setc(value.x, value.y);
      return;
    }
    throw new TypeError('Position value must be a Polar/Complex instance');
  }

  /**
   * Read a reserved `$` data property for a position phase.
   * @param {string} prop
   * @param {string} [type]
   * @param {boolean} [force]
   */
  getData(prop, type = 'current', force = false) {
    const store = type === 'start' ? this.startData : type === 'end' ? this.endData : this.data;
    const key = `$${prop}`;
    if (force) return store[key];
    if (key in store) return store[key];
    if (key in this.data) return this.data[key];
    return 0;
  }

  /**
   * @param {string} prop
   * @param {unknown} value
   * @param {string} [type]
   */
  setData(prop, value, type = 'current') {
    const store = type === 'start' ? this.startData : type === 'end' ? this.endData : this.data;
    store[`$${prop}`] = value;
  }

  /** @param {string} prop */
  removeData(prop) {
    const key = `$${prop}`;
    delete this.data[key];
    delete this.startData[key];
    delete this.endData[key];
  }

  /** @param {Function} action @param {string} [flags] */
  eachAdjacency(action, flags) {
    eachAdjacency(this, action, flags);
  }

  /** @param {number} begin @param {number|false} end @param {Function} action @param {string} [flags] */
  eachLevel(begin, end, action, flags) {
    eachLevel(this, begin, end, action, flags);
  }

  /** @param {Function} action @param {string} [flags] */
  eachSubgraph(action, flags) {
    eachLevel(this, 0, false, action, flags);
  }

  /** @param {Function} action @param {string} [flags] */
  eachSubnode(action, flags) {
    eachLevel(this, 1, 1, action, flags);
  }

  /** @param {Function} [condition] @param {string} [flags] */
  anySubnode(condition, flags) {
    const check = typeof condition === 'string'
      ? (node) => Boolean(node[condition])
      : (condition || (() => true));
    let found = false;
    this.eachSubnode((node) => {
      if (check(node)) found = true;
    }, flags);
    return found;
  }

  /** @param {number|number[]} [level] @param {string} [flags] */
  getSubnodes(level = 0, flags) {
    return getSubnodes(this, level, flags);
  }

  /** @param {string} [flags] */
  getParents(flags) {
    return getParents(this, flags);
  }

  /** @param {string} id */
  isDescendantOf(id) {
    return isDescendantOf(this, id);
  }
}
