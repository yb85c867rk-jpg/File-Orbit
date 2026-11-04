const KOREAN = '아주긴한국어이름으로만든노드';
const suffix = (index) => `${KOREAN}-${String(index).padStart(4, '0')}-파일`;
function makeNode(id, kind, name, children = []) {
  return { id, kind, name, data: {}, children };
}

function flat(total) {
  const children = Array.from({ length: total - 1 }, (_, index) => makeNode(`n${index + 1}`, 'file', suffix(index)));
  return makeNode('root', 'folder', `${KOREAN}-평면-루트`, children);
}

function wide(total) {
  const groups = 12;
  const leaves = total - 1 - groups;
  const folders = Array.from({ length: groups }, (_, index) => makeNode(`g${index}`, 'folder', `${KOREAN}-넓은그룹-${index}`, []));
  for (let index = 0; index < leaves; index += 1) {
    folders[index % groups].children.push(makeNode(`n${index + groups + 1}`, 'file', suffix(index + groups + 1)));
  }
  return makeNode('root', 'folder', `${KOREAN}-넓은-루트`, folders);
}

function balanced(total) {
  const root = makeNode('root', 'folder', `${KOREAN}-균형-루트`, []);
  const parents = [root];
  let next = 1;
  let cursor = 0;
  while (next < total) {
    const parent = parents[cursor];
    cursor += 1;
    for (let branch = 0; branch < 3 && next < total; branch += 1) {
      const child = makeNode(`n${next}`, 'folder', suffix(next), []);
      parent.children.push(child);
      parents.push(child);
      next += 1;
    }
  }
  return root;
}

function mixed(total) {
  const root = makeNode('root', 'folder', `${KOREAN}-혼합-루트`, []);
  const groups = 6;
  const folders = Array.from({ length: groups }, (_, index) => makeNode(`g${index}`, 'folder', `${KOREAN}-혼합그룹-${index}`, []));
  root.children.push(...folders);
  let next = 1 + groups;
  let parent = folders[0];
  for (let depth = 0; depth < 8 && next < total; depth += 1) {
    const child = makeNode(`n${next}`, 'folder', suffix(next), []);
    parent.children.push(child);
    parent = child;
    next += 1;
  }
  for (let index = 0; index < 50 && next < total; index += 1) {
    folders[1].children.push(makeNode(`n${next}`, 'file', suffix(next)));
    next += 1;
  }
  let group = 2;
  while (next < total) {
    folders[group % groups].children.push(makeNode(`n${next}`, 'file', suffix(next)));
    next += 1;
    group += 1;
  }
  return root;
}

function deep(total) {
  const depth = Math.min(50, total - 1);
  const chain = [makeNode('root', 'folder', `${KOREAN}-깊은-루트`, [])];
  let next = 1;
  for (let level = 1; level <= depth; level += 1) {
    const child = makeNode(`n${next}`, 'folder', suffix(next), []);
    chain[level - 1].children.push(child);
    chain.push(child);
    next += 1;
  }
  let level = 0;
  while (next < total) {
    chain[level % chain.length].children.push(makeNode(`n${next}`, 'file', suffix(next)));
    next += 1;
    level += 1;
  }
  return chain[0];
}

export const SHAPES = Object.freeze(['flat', 'wide', 'balanced', 'mixed', 'deep']);
export function buildFixture(shape, total) {
  if (!SHAPES.includes(shape)) throw new Error(`unknown fixture shape ${shape}`);
  if (!Number.isSafeInteger(total) || total < 2) throw new Error('fixture total must be an integer >= 2');
  if (shape === 'flat') return flat(total);
  if (shape === 'wide') return wide(total);
  if (shape === 'balanced') return balanced(total);
  if (shape === 'mixed') return mixed(total);
  return deep(total);
}
export function measureTree(root) {
  let nodeCount = 0;
  let maxDepth = 0;
  let maxFanout = 0;
  let folderCount = 0;
  let fileCount = 0;
  const stack = [{ node: root, depth: 0 }];
  while (stack.length) {
    const { node, depth } = stack.pop();
    nodeCount += 1;
    maxDepth = Math.max(maxDepth, depth);
    if (node.kind === 'folder') folderCount += 1; else fileCount += 1;
    const children = node.children || [];
    maxFanout = Math.max(maxFanout, children.length);
    for (const child of children) stack.push({ node: child, depth: depth + 1 });
  }
  return { nodeCount, depth: maxDepth, maxFanout, folderCount, fileCount };
}
