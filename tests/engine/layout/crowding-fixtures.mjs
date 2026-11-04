/**
 * Deterministic crowding fixtures for experimental layout comparison.
 * IDs and insertion order are declared here and are not modified by results.
 */

function node(id, kind, name, children) {
  const value = {
    id,
    name,
    kind,
    data: Object.assign(Object.create(null), {
      $dim: 3 + (Number(String(id).replace(/\D/g, '')) || 0) % 5,
      $angularWidth: 1 + ((Number(String(id).replace(/\D/g, '')) || 0) % 3) * 0.2
    })
  };
  if (children) value.children = children;
  return value;
}

function file(id, name) { return node(id, 'file', name); }
function folder(id, name, children = []) { return node(id, 'folder', name, children); }

/** One dense folder beside three small folders. */
export function crowdedFolder() {
  const denseChildren = [];
  for (let i = 0; i < 24; i += 1) denseChildren.push(file(`dense-${i}`, `dense-file-${i}.txt`));
  return folder('r', 'Root', [
    folder('dense', 'Dense downloads', denseChildren),
    folder('small-a', 'Small A', [file('a-0', 'a.txt'), file('a-1', 'a.md')]),
    folder('small-b', 'Small B', [file('b-0', 'b.pdf')]),
    folder('small-c', 'Small C', [file('c-0', 'c.png'), file('c-1', 'c.zip')])
  ]);
}

/** Multiple dense neighboring folders. */
export function denseNeighbors() {
  const children = [];
  for (const group of ['a', 'b', 'c', 'd']) {
    const files = [];
    for (let i = 0; i < 12; i += 1) files.push(file(`${group}-${i}`, `${group}-file-${i}.md`));
    children.push(folder(group, `Dense ${group.toUpperCase()}`, files));
  }
  return folder('r', 'Root', children);
}

/** Deep chain, wide folder, and a medium branching folder. */
export function mixedDeepWide() {
  let deep = folder('deep-5', 'Deep 5', [file('deep-leaf', 'leaf.txt')]);
  for (let i = 4; i >= 0; i -= 1) deep = folder(`deep-${i}`, `Deep ${i}`, [deep]);
  const wideFiles = [];
  for (let i = 0; i < 20; i += 1) wideFiles.push(file(`wide-${i}`, `wide-${i}.csv`));
  const medium = [];
  for (let i = 0; i < 5; i += 1) {
    const files = [];
    for (let j = 0; j < 3; j += 1) files.push(file(`medium-${i}-${j}`, `m-${i}-${j}.json`));
    medium.push(folder(`medium-${i}`, `Medium ${i}`, files));
  }
  return folder('r', 'Root', [
    deep,
    folder('wide', 'Wide', wideFiles),
    folder('medium', 'Medium', medium)
  ]);
}

/** Long display names and varied file-type cues. */
export function longLabels() {
  return folder('r', 'Projects with an unusually long root name', [
    folder('long-folder', 'A folder name that is deliberately very long for label measurement', [
      file('long-pdf', 'quarterly-financial-report-with-a-very-long-name.pdf'),
      file('long-md', 'design-decision-record-for-the-adaptive-layout-experiment.md'),
      file('long-txt', 'notes-from-a-long-meeting-with-many-details.txt'),
      file('long-img', 'screenshot-of-the-comparison-harness-2026-10-26.png')
    ]),
    folder('types', 'Mixed types', [
      file('type-1', 'archive-of-old-documents.tar.gz'),
      file('type-2', 'unknown-without-extension'),
      file('type-3', 'unicode-résumé-日本語.md'),
      file('type-4', 'bundle.zip')
    ])
  ]);
}

/** Deep chain that cannot fit the declared minimum radial step. */
export function infeasibleDepth() {
  let current = folder('depth-60', 'Depth 60', [file('depth-leaf', 'leaf.txt')]);
  for (let i = 59; i >= 0; i -= 1) current = folder(`depth-${i}`, `Depth ${i}`, [current]);
  return current;
}

export const CROWDING_FIXTURES = Object.freeze({
  crowdedFolder,
  denseNeighbors,
  mixedDeepWide,
  longLabels
});
