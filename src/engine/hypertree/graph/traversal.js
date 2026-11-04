/** @param {object} entity @param {string} [flags] */
function passesFlags(entity, flags) {
  if (!flags || typeof flags !== 'string') return true;
  for (const prop of flags.split(/\s+/)) {
    if (prop && entity[prop]) return false;
  }
  return true;
}

/**
 * Deterministic adjacency iteration in Map insertion order.
 * @param {import('./node.js').GraphNode} node
 * @param {(adj: object, id: string) => void} action
 * @param {string} [flags]
 */
export function eachAdjacency(node, action, flags) {
  for (const [id, adj] of node.adjacencies) {
    if (passesFlags(adj, flags)) action(adj, id);
  }
}

/**
 * Iterative replacement for the legacy recursive eachLevel. Children are
 * visited in adjacency insertion order; the legacy action-return stop rule is
 * preserved.
 * @param {import('./node.js').GraphNode} node
 * @param {number} levelBegin
 * @param {number|false} levelEnd
 * @param {(node: object, depth: number) => unknown} action
 * @param {string} [flags]
 */
export function eachLevel(node, levelBegin, levelEnd, action, flags) {
  const base = node._depth;
  const begin = levelBegin + base;
  const end = levelEnd === false ? Number.MAX_VALUE : levelEnd + base;
  const stack = [node];
  let shouldContinue = true;

  while (stack.length > 0 && shouldContinue) {
    const current = stack.pop();
    const depth = current._depth;
    if (depth >= begin && depth <= end && passesFlags(current, flags)) {
      const result = action(current, depth);
      if (typeof result !== 'undefined') shouldContinue = Boolean(result);
    }
    if (!shouldContinue || depth >= end) continue;

    const children = [];
    // Legacy eachLevel does not forward flags to eachAdjacency: edge flags do
    // not prune level traversal; node flags only filter the action.
    eachAdjacency(current, (adj) => {
      const next = adj.nodeTo;
      if (next._depth > depth) children.push(next);
    });
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
}

/** @param {import('./node.js').GraphNode} node @param {string} [flags] */
export function getParents(node, flags) {
  const parents = [];
  eachAdjacency(node, (adj) => {
    if (adj.nodeTo._depth < node._depth) parents.push(adj.nodeTo);
  }, flags);
  return parents;
}

/**
 * @param {import('./node.js').GraphNode} node
 * @param {number|number[]} [level]
 * @param {string} [flags]
 */
export function getSubnodes(node, level = 0, flags) {
  const out = [];
  let start;
  let end;
  if (Array.isArray(level)) {
    [start, end] = level;
  } else {
    start = level;
    end = Number.MAX_VALUE;
  }
  eachLevel(node, start, end, (current) => { out.push(current); }, flags);
  return out;
}

/**
 * Iterative descendant check; cycles are guarded even though the loader
 * rejects cyclic trees.
 * @param {import('./node.js').GraphNode} node
 * @param {string} id
 */
export function isDescendantOf(node, id) {
  const stack = [node];
  const seen = new Set();
  while (stack.length > 0) {
    const current = stack.pop();
    if (current.id === id) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const parent of getParents(current)) stack.push(parent);
  }
  return false;
}
