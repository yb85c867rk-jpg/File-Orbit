import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { FakeIndexedDB } from './fake-indexeddb.mjs';
import { buildSaveSnapshot, createPersistenceRepository } from '../../../src/engine/hypertree/persistence/index.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';
import { FREE_POLICY_CONTEXT } from '../../../src/engine/hypertree/edition/index.js';
import { PAID_TEST_CONTEXT } from '../../helpers/stage3a-paid-context.mjs';
import { createSavedDocumentLodBridge } from '../../../analysis/stage3d/bridge.mjs';
import { buildLodFixture } from '../../../analysis/stage3d/fixture.mjs';
const viewport = { width: 1280, height: 800 };
const ids = (root) => { const out = []; const walk = (n) => { out.push(n.id); for (const c of n.children || []) walk(c); }; walk(root); return out; };
for (const count of [300, 1000]) {
  test(`Stage 3E cluster paging ${count}: bounded pages, all IDs, stable selection, reveal`, async () => {
    const context = count > 300 ? PAID_TEST_CONTEXT : FREE_POLICY_CONTEXT;
    const repo = createPersistenceRepository({ indexedDB: new FakeIndexedDB(), dbName: `stage3e-pages-${count}`, policyContext: context });
    const registry = createAttachmentRegistry({ datasetToken: 1 });
    const fixture = buildLodFixture(count, registry, File);
    const saved = await repo.save(buildSaveSnapshot({ tree: fixture.tree, registry, datasetToken: 1, capturedRevision: 0, policyContext: context }));
    const loaded = await repo.load(saved.mapId);
    const before = JSON.stringify(loaded.document.tree);
    const bridge = createSavedDocumentLodBridge({ loaded, datasetToken: 4, viewport, policyContext: context, clusterSize: 40, clusterPageSize: 8, searchPageSize: 50 });
    assert.equal(bridge.nodeCount, count);
    bridge.openFolder('folder-big');
    const overview = bridge.scene();
    assert.equal(overview.mode, 'overview');
    const proxy = overview.items.find((item) => item.proxy);
    bridge.expandCluster(proxy.id);
    const page1 = bridge.scene();
    assert.equal(page1.mode, 'cluster');
    assert.equal(page1.items.length, 8);
    assert.ok(page1.clusterPages >= 5);
    assert.equal(page1.clusterTotal, proxy.cluster.count);
    const page1Ids = page1.items.map((item) => item.id);
    bridge.clusterNext();
    const page2 = bridge.scene();
    assert.equal(page2.clusterPage, 2);
    assert.equal(page2.items.length, 8);
    assert.notDeepEqual(page2.items.map((item) => item.id), page1Ids);
    bridge.clusterPrev();
    assert.equal(bridge.scene().clusterPage, 1);
    // Selection changes labels/ring but not scene membership.
    const selectedId = bridge.scene().items.find((item) => !item.proxy).id;
    const sceneIdsBefore = bridge.scene().items.map((item) => item.id);
    bridge.select(selectedId);
    assert.deepEqual(bridge.scene().items.map((item) => item.id), sceneIdsBefore);
    assert.equal(bridge.details().id, selectedId);
    // Every original node remains reachable by ID; reveal puts it in a scene.
    for (const id of ids(loaded.document.tree)) {
      bridge.model.revealNode(id);
      if (id === 'root') continue;
      const scene = bridge.scene();
      assert.ok(scene.items.some((item) => item.id === id), 'revealed node visible: ' + id);
    }
    assert.equal(JSON.stringify(loaded.document.tree), before, 'paging/reveal never changes the document tree');
    // Search target must resolve to a page where it is present.
    const search = bridge.search('파일', 1);
    assert.ok(search.total > 0);
    const target = search.results[0].id;
    bridge.revealSearchResult(target);
    assert.equal(bridge.model.state.searchTargetId, target);
    assert.ok(bridge.scene().items.some((item) => item.id === target));
    bridge.dispose();
  });
}

