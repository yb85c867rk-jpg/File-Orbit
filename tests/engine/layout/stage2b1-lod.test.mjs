import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, buildFixture } from '../../../analysis/stage2a/fixtures.mjs';
import { LodPresentationModel, validateClusterSize } from '../../../analysis/stage2b1/model.mjs';
import { layoutScene, hitTestLayout } from '../../../analysis/stage2b1/layout.mjs';

function fixtureModel(shape, total, options = {}) { return new LodPresentationModel(buildFixture(shape, total), { clusterSize: 40, ...options }); }

test('LOD model reveals every document node by ID for every Stage 2A fixture', () => {
  for (const shape of SHAPES) {
    for (const total of [300, 1000]) {
      const tree = buildFixture(shape, total);
      const before = JSON.stringify(tree);
      const model = fixtureModel(shape, total);
      const ids = model.documentIdsList();
      assert.equal(ids.length, total, `${shape}/${total} ids`);
      for (const id of ids) {
        const scene = model.revealNode(id);
        assert.equal(model.state.selectedId, id, `${shape}/${total} selected ${id}`);
        assert.equal(model.state.searchTargetId, id, `${shape}/${total} target ${id}`);
        assert.equal(scene.items.some((item) => item.id === id) || scene.folder.id === id, true, `${shape}/${total} visible ${id}`);
        const details = model.details();
        assert.equal(details.id, id);
      }
      assert.equal(JSON.stringify(tree), before, `${shape}/${total} source unchanged`);
    }
  }
});

test('search paginates beyond 50 results and can reveal a later match', () => {
  const model = fixtureModel('flat', 1000);
  const first = model.search('파일', 1);
  assert.equal(first.results.length, 50);
  assert.equal(first.total > 50, true);
  assert.equal(first.pages, Math.ceil(first.total / 50));
  const all = [];
  for (let page = 1; page <= first.pages; page += 1) all.push(...model.search('파일', page).results.map((item) => item.id));
  assert.equal(new Set(all).size, first.total, 'every page is unique');
  assert.equal(all.length, first.total, 'every result is reachable');
  const target = all.at(-1);
  model.revealSearchResult(target);
  assert.equal(model.state.selectedId, target);
  assert.equal(model.state.searchTargetId, target);
  assert.equal(model.buildScene().items.some((item) => item.id === target), true);
});

test('duplicate names use IDs/paths and proxy-like document IDs cannot collide with clusters', () => {
  const children = Array.from({ length: 45 }, (_, index) => ({
    id: index === 0 ? 'proxy:root:0:40' : `doc-${index}`,
    name: index < 2 ? '같은이름.txt' : `노드-${index}.txt`,
    kind: 'file', data: {}, children: []
  }));
  const tree = { id: 'root', name: '중복 루트', kind: 'folder', data: {}, children };
  const model = new LodPresentationModel(tree, { clusterSize: 40 });
  const proxies = model.proxyIdsList();
  assert.equal(proxies.length, 2);
  assert.notEqual(proxies[0], 'proxy:root:0:40');
  assert.match(proxies[0], /~1$/);
  assert.equal(model.documentRecord(proxies[0]), null);
  assert.equal(model.documentRecord('proxy:root:0:40').node.name, '같은이름.txt');
  const duplicateResults = model.search('같은이름', 1);
  assert.equal(duplicateResults.total, 2);
  assert.notEqual(duplicateResults.results[0].id, duplicateResults.results[1].id);
  assert.equal(duplicateResults.results.every((result) => result.path.includes('중복 루트')), true);
  const last = model.clustersByParent.get('root').at(-1);
  assert.equal(last.count, 5, 'final partial cluster');
  assert.deepEqual([...last.memberIds], children.slice(40).map((child) => child.id));
});

test('cluster size validation is shared by model overview and focus paths', () => {
  const tree = buildFixture('flat', 300);
  for (const value of [0, 1, 1.5, NaN, '40', null, 501]) assert.throws(() => validateClusterSize(value));
  assert.equal(validateClusterSize(40), 40);
  const model = new LodPresentationModel(tree, { clusterSize: 40 });
  assert.equal(model.buildScene().mode, 'overview');
  const proxy = model.proxyIdsList()[0];
  model.expandCluster(proxy);
  assert.equal(model.buildScene().mode, 'cluster');
  assert.equal(model.buildScene().cluster.id, proxy);
});

test('local layout reports bounds and hit testing resolves displayed IDs', () => {
  const model = fixtureModel('mixed', 1000);
  const scene = model.buildScene();
  const layout = layoutScene(scene);
  assert.equal(layout.all.length, scene.items.length + 1);
  assert.equal(layout.bounds.minX >= 0 && layout.bounds.minY >= 0, true);
  assert.equal(layout.bounds.maxX <= 1600 && layout.bounds.maxY <= 900, true);
  for (const node of layout.nodes) {
    assert.equal(hitTestLayout(layout, node.x, node.y), node.id);
    model.select(node.id);
    assert.equal(model.state.selectedId, node.id);
    assert.equal(model.details().id, node.id);
  }
});

test('navigation preserves breadcrumb and back state without mutating the document', () => {
  const tree = buildFixture('wide', 1000);
  const before = JSON.stringify(tree);
  const model = new LodPresentationModel(tree, { clusterSize: 40 });
  const group = tree.children[0];
  model.enterFolder(group.id);
  assert.equal(model.state.folderId, group.id);
  assert.equal(model.breadcrumb().at(-1).id, group.id);
  model.select(group.children[0].id);
  const selected = model.state.selectedId;
  model.back();
  assert.equal(model.state.folderId, tree.id);
  assert.equal(JSON.stringify(tree), before);
  assert.equal(model.documentRecord(selected).node.name, group.children[0].name);
});

﻿test('cluster mapping covers every grouped child exactly once', () => {
  for (const shape of SHAPES) {
    const tree = buildFixture(shape, 1000);
    const model = new LodPresentationModel(tree, { clusterSize: 40 });
    for (const [parentId, clusters] of model.clustersByParent) {
      const parent = model.documentRecord(parentId).node;
      const covered = clusters.flatMap((cluster) => cluster.memberIds);
      assert.equal(covered.length, parent.children.length, shape + ' mapping length');
      assert.equal(new Set(covered).size, parent.children.length, shape + ' mapping uniqueness');
      assert.deepEqual(covered, parent.children.map((child) => child.id), shape + ' mapping order');
      for (const cluster of clusters) assert.equal(cluster.memberIds.length <= 40, true);
    }
  }
});

﻿
test('breadcrumbs navigate through the model from expanded clusters and preserve Back', () => {
  const flat = buildFixture('flat', 1000);
  const flatModel = new LodPresentationModel(flat, { clusterSize: 40 });
  const flatProxy = flatModel.proxyIdsList()[0];
  flatModel.expandCluster(flatProxy);
  const rootScene = flatModel.navigateToFolder('root');
  assert.equal(flatModel.state.folderId, 'root');
  assert.equal(flatModel.state.expandedClusterId, null);
  assert.equal(rootScene.mode, 'overview');
  flatModel.back();
  assert.equal(flatModel.state.expandedClusterId, flatProxy, 'Back returns to the expanded root-level cluster');

  const wide = buildFixture('wide', 1000);
  const wideModel = new LodPresentationModel(wide, { clusterSize: 40 });
  wideModel.enterFolder('g0');
  const wideProxy = wideModel.proxyIdsList().find((id) => id.startsWith('proxy:g0:'));
  wideModel.expandCluster(wideProxy);
  assert.equal(wideModel.buildScene().mode, 'cluster');
  const ancestorScene = wideModel.navigateToFolder('root');
  assert.equal(ancestorScene.folder.id, 'root');
  assert.equal(wideModel.state.expandedClusterId, null);
  assert.equal(wideModel.state.selectedId, null);
  wideModel.back();
  assert.equal(wideModel.state.folderId, 'g0');
  assert.equal(wideModel.state.expandedClusterId, wideProxy);
});

test('clearing or changing search removes search-target highlighting but keeps ordinary selection', () => {
  const model = fixtureModel('flat', 1000);
  model.search('파일', 1);
  const target = model.search('파일', 1).results[0].id;
  model.revealSearchResult(target);
  model.select(target);
  assert.equal(model.state.searchTargetId, target);
  const cleared = model.search('');
  assert.equal(cleared.total, 0);
  assert.equal(model.state.searchTargetId, null);
  assert.equal(model.state.selectedId, target);
  model.search('파일', 1);
  model.revealSearchResult(target);
  assert.equal(model.state.searchTargetId, target);
  model.search('노드', 1);
  assert.equal(model.state.searchTargetId, null, 'changing the query clears the old target');
});

test('layout hit testing includes center and returns null for empty background', () => {
  const model = fixtureModel('mixed', 1000);
  const layout = layoutScene(model.buildScene());
  assert.equal(hitTestLayout(layout, layout.centerNode.x, layout.centerNode.y), layout.centerNode.id);
  assert.equal(hitTestLayout(layout, 1, 1), null);
  for (const node of layout.nodes) assert.equal(hitTestLayout(layout, node.x, node.y), node.id);
});

test('layout balances rings and prioritizes selected/search labels', () => {
  const tree = buildFixture('flat', 1000);
  const model = new LodPresentationModel(tree, { clusterSize: 40 });
  const proxy = model.proxyIdsList()[0];
  model.expandCluster(proxy);
  const scene = model.buildScene();
  const target = scene.items[39].id;
  const layout = layoutScene(scene, { priorityIds: [target] });
  assert.equal(layout.ringCount, 2);
  assert.equal(layout.nodes.filter((node) => node.ring === 0).length, 20);
  assert.equal(layout.nodes.filter((node) => node.ring === 1).length, 20);
  assert.equal(layout.nodes.find((node) => node.id === target).showLabel, true);
  assert.equal(layout.nodes.filter((node) => node.showLabel && !node.priority).length <= 18, true);
});
