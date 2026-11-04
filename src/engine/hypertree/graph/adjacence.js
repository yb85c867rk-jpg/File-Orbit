/**
 * Directed adjacency record. The graph creates one record per direction; edge
 * data is shared between the two directions but no caller object is retained.
 */
export class Adjacence {
  /**
   * @param {import('./node.js').GraphNode} nodeFrom
   * @param {import('./node.js').GraphNode} nodeTo
   * @param {object} [data]
   */
  constructor(nodeFrom, nodeTo, data = Object.create(null)) {
    this.nodeFrom = nodeFrom;
    this.nodeTo = nodeTo;
    this.data = data;
    this._hiding = false;
  }
}
