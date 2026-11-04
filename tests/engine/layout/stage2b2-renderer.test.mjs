import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, buildFixture } from '../../../analysis/stage2a/fixtures.mjs';
import { LodPresentationModel } from '../../../analysis/stage2b2/model.mjs';
import { presentationStaged } from '../../../analysis/stage2b2/adapter.mjs';
import { createProjection } from '../../../src/engine/hypertree/render/coordinates.js';
import { prepareGraphScene } from '../../../src/engine/hypertree/render/scene.js';
import { createHitSnapshot, hitTestNode } from '../../../src/engine/hypertree/interaction/hit-test.js';

function modelFor(shape, total) { return new LodPresentationModel(buildFixture(shape, total), { clusterSize: 40 }); }
function prepareScene(model, width = 1200, height = 700) {
  const scene = model.buildScene();
  const staged = presentationStaged(scene, width, height);
  const kinds = new Map([[scene.folder.id, 'folder']]);
  const presentation = new Map([[scene.folder.id, { name: scene.folder.name, kind: 'folder' }]]);
  for (const item of scene.items) {
    kinds.set(item.id, item.proxy ? 'folder' : item.node.kind);
    presentation.set(item.id, { name: item.proxy ? item.cluster.label : item.node.name, kind: item.proxy ? 'folder' : item.node.kind });
  }
  const scenePrepared = prepareGraphScene(staged, { phase: 'current', projection: createProjection({ width, height, radius: Math.min(width, height) * 0.42 }), nodeKinds: kinds });
  return { scene, staged, presentation, prepared: scenePrepared };
}

test('every Stage 2B-2 model node is reachable by ID across all fixtures', () => {
  for (const shape of SHAPES) {
    for (const total of [300, 1000]) {
      const tree = buildFixture(shape, total);
      const before = JSON.stringify(tree);
      const model = modelFor(shape, total);
      for (const id of model.documentIdsList()) {
        const scene = model.revealNode(id);
        assert.equal(model.state.selectedId, id);
        assert.equal(scene.items.some((item) => item.id === id) || scene.folder.id === id, true, `${shape}/${total}/${id}`);
      }
      assert.equal(JSON.stringify(tree), before);
    }
  }
});

test('presentation staging feeds the production scene and hit-test contracts', () => {
  const model = modelFor('flat', 1000);
  const proxy = model.proxyIdsList()[0];
  const { scene, staged, prepared: scenePrepared, presentation } = prepareScene(model);
  assert.equal(scenePrepared.nodes.size, 26);
  assert.equal(scenePrepared.edges.length, 25);
  assert.equal(staged.rootId, 'root');
  assert.equal(presentation.get('root').kind, 'folder');
  const center = scenePrepared.nodes.get('root');
  const snapshot = createHitSnapshot(scenePrepared);
  assert.equal(hitTestNode(snapshot, center.center), 'root');
  const proxyNode = scenePrepared.nodes.get(proxy);
  assert.equal(hitTestNode(snapshot, proxyNode.center), proxy);
  assert.equal(hitTestNode(snapshot, { x: 1, y: 1 }), null);
});

test('proxy IDs cannot collide with document IDs in the renderer model', () => {
  const children = Array.from({ length: 45 }, (_, index) => ({ id: index === 0 ? 'proxy:root:0:40' : `n${index}`, name: `n${index}.txt`, kind: 'file', data: {}, children: [] }));
  const tree = { id: 'root', name: 'Root', kind: 'folder', data: {}, children };
  const model = new LodPresentationModel(tree, { clusterSize: 40 });
  const proxy = model.proxyIdsList()[0];
  assert.notEqual(proxy, 'proxy:root:0:40');
  assert.match(proxy, /~1$/);
  assert.equal(model.documentRecord(proxy), null);
  const { prepared: scenePrepared } = prepareScene(model);
  assert.equal(scenePrepared.nodes.has(proxy), true);
  assert.equal(model.documentRecord('proxy:root:0:40').node.id, 'proxy:root:0:40');
});

test('breadcrumb navigation and search reset remain coherent in the extracted model', () => {
  const model = modelFor('wide', 1000);
  model.enterFolder('g0');
  const proxy = model.proxyIdsList().find((id) => id.startsWith('proxy:g0:'));
  model.expandCluster(proxy);
  const scene = model.navigateToFolder('root');
  assert.equal(scene.mode, 'folder');
  assert.equal(model.state.expandedClusterId, null);
  model.back();
  assert.equal(model.state.expandedClusterId, proxy);
  const target = model.search('파일', 1).results[0].id;
  model.revealSearchResult(target);
  model.search('');
  assert.equal(model.state.searchTargetId, null);
  assert.equal(model.state.selectedId, target);
});

test('deep-300 uses bounded local scenes without global layout', () => {
  const model = modelFor('deep', 300);
  const deepest = model.deepestId();
  const scene = model.revealNode(deepest);
  assert.equal(model.state.selectedId, deepest);
  assert.equal(scene.items.length <= 40, true);
  const { prepared: scenePrepared } = prepareScene(model);
  assert.equal(scenePrepared.nodes.size, scene.items.length + 1);
});


test('model query state uses the documented query property', () => {
  const model = modelFor('flat', 1000);
  const page = model.search('파일', 1);
  assert.equal(model.state.query, '파일');
  assert.equal(model.state.searchQuery, undefined);
  assert.equal(page.page, 1);
  assert.equal(page.pages, 20);
  assert.equal(page.results.length, 50);
});
