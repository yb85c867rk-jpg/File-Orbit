/**
 * Deterministic synthetic fixtures for the M3 angular-width slice.
 * All returned trees are fresh plain objects and are not shared.
 */

const F20_PREORDER = Object.freeze([
  'n0', 'n1', 'n3', 'n7', 'n15', 'n16', 'n8', 'n17', 'n18', 'n4',
  'n9', 'n19', 'n10', 'n2', 'n5', 'n11', 'n12', 'n6', 'n13', 'n14'
]);

/** @param {string} id @param {string} kind @param {object[]} [children] */
function treeNode(id, kind, children) {
  const value = {
    id,
    name: `Node ${id.slice(1)}`,
    kind,
    data: Object.create(null)
  };
  value.data.$dim = 4 + (Number(id.slice(1)) % 5);
  value.data.$angularWidth = 1 + (Number(id.slice(1)) % 3) * 0.25;
  if (children !== undefined) value.children = children;
  return value;
}

export function f20() {
  const nodes = [];
  for (let i = 0; i < 20; i += 1) nodes.push(treeNode(`n${i}`, i < 10 ? 'folder' : 'file'));
  for (let i = 1; i < 20; i += 1) {
    const parent = nodes[Math.floor((i - 1) / 2)];
    if (!parent.children) parent.children = [];
    parent.children.push(nodes[i]);
  }
  return nodes[0];
}

export function f200() {
  const nodes = [];
  for (let i = 0; i < 200; i += 1) {
    const value = treeNode(`n${i}`, i < 40 ? 'folder' : 'file');
    value.data.$dim = 4 + (i % 7);
    value.data.$angularWidth = 0.8 + (i % 5) * 0.1;
    nodes.push(value);
  }
  for (let i = 1; i < 200; i += 1) {
    const parent = nodes[Math.floor((i - 1) / 5)];
    if (!parent.children) parent.children = [];
    parent.children.push(nodes[i]);
  }
  return nodes[0];
}

export function singleRoot() {
  const root = treeNode('n0', 'folder');
  root.data.$dim = 5;
  root.data.$angularWidth = 1;
  return root;
}

export function unequal() {
  return {
    id: 'r',
    name: 'Root',
    kind: 'folder',
    data: Object.assign(Object.create(null), { $dim: 4, $angularWidth: 1 }),
    children: [
      { id: 'a', name: 'A', kind: 'file', data: Object.assign(Object.create(null), { $dim: 2, $angularWidth: 1 }) },
      { id: 'b', name: 'B', kind: 'file', data: Object.assign(Object.create(null), { $dim: 10, $angularWidth: 2 }) },
      { id: 'c', name: 'C', kind: 'file', data: Object.assign(Object.create(null), { $dim: 6, $angularWidth: 1.5 }) }
    ]
  };
}

export function integerIds() {
  return {
    id: 'r',
    name: 'Root',
    kind: 'folder',
    data: Object.assign(Object.create(null), { $dim: 4, $angularWidth: 1 }),
    children: [
      { id: '10', name: '10', kind: 'file' },
      { id: '2', name: '2', kind: 'file' },
      { id: '1', name: '1', kind: 'file' }
    ]
  };
}

/** @param {number} [depth] */
export function deepChain(depth = 10000) {
  const root = { id: 'd0', name: 'D0', kind: 'folder', data: Object.assign(Object.create(null), { $dim: 4, $angularWidth: 1 }) };
  let current = root;
  for (let i = 1; i < depth; i += 1) {
    const child = { id: `d${i}`, name: `D${i}`, kind: 'folder', data: Object.assign(Object.create(null), { $dim: 4, $angularWidth: 1 }) };
    current.children = [child];
    current = child;
  }
  return root;
}

/** @param {number} [width] */
export function wide(width = 1000) {
  const root = { id: 'w0', name: 'Wide', kind: 'folder', data: Object.assign(Object.create(null), { $dim: 4, $angularWidth: 1 }) };
  root.children = [];
  for (let i = 0; i < width; i += 1) {
    root.children.push({
      id: `w${i + 1}`,
      name: `W${i + 1}`,
      kind: 'file',
      data: Object.assign(Object.create(null), { $dim: 4, $angularWidth: 1 })
    });
  }
  return root;
}

export { F20_PREORDER };
