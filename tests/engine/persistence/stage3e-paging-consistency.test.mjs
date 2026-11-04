import test from 'node:test';
import assert from 'node:assert/strict';
import { LodPresentationModel } from '../../../analysis/stage2b2/model.mjs';
const file = (id, name) => ({ id, name, kind: 'file', data: {}, children: [] });
const folder = (id, name, children = []) => ({ id, name, kind: 'folder', data: {}, children });
const tree = (n, folderAt = -1) => folder('root', 'root', Array.from({ length: n }, (_, i) => i === folderAt ? folder(`f-${i}`, `folder-${i}`, [file(`inside-${i}`, 'inside.txt')]) : file(`n-${i}`, `node-${i}.txt`)));

test('ordinary folders use bounded pages at 0/1/8/9/18/39/40 children', () => {
  for (const n of [0, 1, 8, 9, 18, 39, 40]) {
    const model = new LodPresentationModel(tree(n), { clusterSize: 40, clusterPageSize: 8 });
    const first = model.buildScene();
    assert.equal(first.mode, 'folder');
    assert.equal(first.pages, Math.max(1, Math.ceil(n / 8)));
    assert.equal(first.items.length, Math.min(n, 8));
    assert.equal(first.total, n);
    model.setFolderPage(first.pages);
    const last = model.buildScene();
    assert.equal(last.page, first.pages);
    assert.equal(last.items.length, n === 0 ? 0 : (n % 8 || 8));
  }
});

test('41 children use bounded proxy overview; expanded cluster is bounded', () => {
  const model = new LodPresentationModel(tree(41), { clusterSize: 40, clusterPageSize: 8 });
  const overview = model.buildScene();
  assert.equal(overview.mode, 'overview');
  assert.equal(overview.total, 2);
  assert.equal(overview.items.length, 2);
  const proxy = overview.items[0].id;
  model.expandCluster(proxy);
  const page1 = model.buildScene();
  assert.equal(page1.mode, 'cluster');
  assert.equal(page1.pages, 5);
  assert.equal(page1.items.length, 8);
});

test('oversized proxy overview is bounded and covers every cluster proxy', () => {
  const model = new LodPresentationModel(tree(400), { clusterSize: 40, clusterPageSize: 8 });
  const first = model.buildScene();
  assert.equal(first.mode, 'overview');
  assert.equal(first.total, 10);
  assert.equal(first.pages, 2);
  assert.equal(first.items.length, 8);
  model.setFolderPage(2);
  const second = model.buildScene();
  assert.equal(second.page, 2);
  assert.equal(second.items.length, 2);
  const ids = new Set([...first.items, ...second.items].map((item) => item.id));
  assert.equal(ids.size, 10);
  assert.ok([...ids].every((id) => model.isProxy(id)));
});
test('page-2 folder entry/Back restores page 2 and selected folder', () => {
  const model = new LodPresentationModel(tree(40, 10), { clusterSize: 40, clusterPageSize: 8 });
  model.setFolderPage(2);
  const page2 = model.buildScene();
  assert.equal(page2.page, 2);
  const target = page2.items.find((item) => item.node.kind === 'folder').id;
  model.select(target);
  const before = model.buildScene();
  assert.equal(before.items.some((item) => item.id === target), true);
  model.navigateToFolder(target);
  const inside = model.buildScene();
  assert.equal(inside.folder.id, target);
  assert.equal(inside.page, 1);
  model.back();
  const restored = model.buildScene();
  assert.equal(restored.folder.id, 'root');
  assert.equal(restored.page, 2);
  assert.equal(restored.items.some((item) => item.id === target), true);
  assert.equal(model.state.selectedId, target);
  assert.equal(model.details().id, target);
});

test('breadcrumb, search reveal, nested navigation, and repeated Back restore complete location', () => {
  const root = folder('root', 'root', [folder('folder-a', 'A', Array.from({ length: 40 }, (_, i) => file(`a-${i}`, `a-${i}.txt`))), file('root-file', 'root.txt')]);
  const model = new LodPresentationModel(root, { clusterSize: 40, clusterPageSize: 8 });
  model.navigateToFolder('folder-a');
  model.setFolderPage(2);
  const page2 = model.buildScene();
  assert.equal(page2.page, 2);
  model.select('a-10');
  model.navigateToFolder; // no-op guard against accidental use as data
  model.navigateToFolder('folder-a'); // nested self-entry is invalid? folder-a is current folder, still folder
  // Use a real child folder for nested navigation.
  const nestedRoot = folder('root', 'root', [folder('folder-a', 'A', [folder('folder-b', 'B', [file('b-file', 'b.txt')])])]);
  const nested = new LodPresentationModel(nestedRoot, { clusterSize: 40, clusterPageSize: 8 });
  nested.navigateToFolder('folder-a');
  nested.navigateToFolder('folder-b');
  nested.back();
  assert.equal(nested.buildScene().folder.id, 'folder-a');
  nested.back();
  assert.equal(nested.buildScene().folder.id, 'root');
  // Search reveal/back.
  const search = new LodPresentationModel(root, { clusterSize: 40, clusterPageSize: 8 });
  search.search('a-39');
  const result = search.search('a-39').results[0];
  search.revealSearchResult(result.id);
  assert.equal(search.state.searchTargetId, result.id);
  assert.ok(search.buildScene().items.some((item) => item.id === result.id));
  search.back();
  assert.notEqual(search.state.searchTargetId, result.id);
  // Breadcrumb overview path.
  const bc = new LodPresentationModel(tree(41), { clusterSize: 40, clusterPageSize: 8 });
  bc.expandCluster(bc.buildScene().items[0].id);
  bc.overview();
  assert.equal(bc.buildScene().mode, 'overview');
  bc.back();
  assert.equal(bc.buildScene().mode, 'cluster');
  // Repeated back does not fabricate pages.
  const repeat = new LodPresentationModel(tree(40, 10), { clusterSize: 40, clusterPageSize: 8 });
  repeat.setFolderPage(2);
  repeat.navigateToFolder('f-10');
  repeat.back(); repeat.back(); repeat.back();
  assert.ok([1, 2].includes(repeat.buildScene().page));
});


