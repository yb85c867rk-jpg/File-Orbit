import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { FakeIndexedDB } from './fake-indexeddb.mjs';
import {
  buildSaveSnapshot, createPersistenceRepository, createRestoredAttachmentRegistry
} from '../../../src/engine/hypertree/persistence/index.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';
import { FREE_POLICY_CONTEXT } from '../../../src/engine/hypertree/edition/index.js';
import { PAID_TEST_CONTEXT } from '../../helpers/stage3a-paid-context.mjs';
import { createSavedDocumentLodBridge } from '../../../analysis/stage3d/bridge.mjs';
import { buildLodFixture } from '../../../analysis/stage3d/fixture.mjs';

const sha = async (blob) => createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
const viewport = { width: 900, height: 600 };
const code = (expected) => (error) => error?.code === expected;
function ids(root) { const out = []; const walk = (n) => { out.push(n.id); for (const c of n.children || []) walk(c); }; walk(root); return out; }
function file(id, name, data = {}) { return { id, name, kind: 'file', data, children: [] }; }
function folder(id, name, children = []) { return { id, name, kind: 'folder', data: {}, children }; }
function allocate(count, folders, prefix) {
  const out = Array.from({ length: folders }, (_, i) => folder(`${prefix}-folder-${i}`, i % 3 ? `폴더-${i}` : `아주-긴-한국어-폴더-${i}`, []));
  let remaining = count - 1 - folders;
  for (let i = 0; remaining > 0; i += 1) {
    const target = out[i % folders];
    target.children.push(file(`${prefix}-${i}`, i < 6 ? '같은이름.txt' : `노드-${i}.txt`, { description: `설명 ${i}` }));
    remaining -= 1;
  }
  return folder('root', `Stage 3D ${prefix}`, out);
}
function shape(kind, count) {
  if (kind === 'flat') return { id: 'root', name: '평면-루트', kind: 'folder', data: {}, children: Array.from({ length: count - 1 }, (_, i) => file(i === 7 ? 'proxy:root:0:40' : `flat-${i}`, i < 8 ? '같은이름.txt' : `평면-${'아주-긴-이름-'.repeat(2)}${i}.txt`, { description: `d${i}` })) };
  if (kind === 'wide') return allocate(count, 20, 'wide');
  if (kind === 'balanced') {
    const root = folder('root', '균형-루트', []);
    let total = 1; let queue = [root];
    while (total < count) {
      const parent = queue.shift();
      for (let i = 0; i < 2 && total < count; i += 1) {
        const child = total < Math.min(count - 1, 500) ? folder(`bal-${total}`, `폴더-${total}`, []) : file(`bal-${total}`, `파일-${total}.txt`, { description: `b${total}` });
        parent.children.push(child); if (child.kind === 'folder') queue.push(child); total += 1;
      }
      if (!queue.length) queue.push(root);
    }
    return root;
  }
  if (kind === 'deep') {
    let root = folder('root', '깊은-루트'); let current = root; let total = 1;
    const depth = Math.min(50, count - 2);
    for (let i = 1; i <= depth; i += 1) { const child = folder(`deep-folder-${i}`, `깊은-폴더-${i}`); current.children.push(child); current = child; total += 1; }
    while (total < count) { current.children.push(file(`deep-file-${total}`, `깊은-파일-${total}.txt`)); total += 1; }
    return root;
  }
  throw new Error('unknown shape ' + kind);
}
function fixture(kind, count) {
  if (kind === 'mixed') { const registry = createAttachmentRegistry({ datasetToken: 1 }); const f = buildLodFixture(count, registry, File); return { tree: f.tree, registry, attachments: f.attachments }; }
  return { tree: shape(kind, count), registry: createAttachmentRegistry({ datasetToken: 1 }), attachments: [] };
}
const mapIdFactory = (() => { let n = 0; return () => `map_stage3d_${String(++n).padStart(8, '0')}`; })();

for (const count of [300, 1000]) {
  for (const kind of ['flat', 'wide', 'balanced', 'mixed', 'deep']) {
    test(`Stage 3D bridge ${kind} ${count}: repository load, LOD navigation, reachability, and re-save`, async () => {
      const context = count > 300 ? PAID_TEST_CONTEXT : FREE_POLICY_CONTEXT;
      const factory = new FakeIndexedDB(); const repo = createPersistenceRepository({ indexedDB: factory, dbName: `stage3d-${kind}-${count}`, mapIdFactory, policyContext: context });
      const f = fixture(kind, count);
      const snapshot = buildSaveSnapshot({ tree: f.tree, registry: f.registry, datasetToken: 1, capturedRevision: 0, policyContext: context });
      const saved = await repo.save(snapshot); const loaded = await repo.load(saved.mapId);
      const beforeTree = JSON.stringify(loaded.document.tree); const beforeIds = ids(loaded.document.tree);
      const bridge = createSavedDocumentLodBridge({ loaded, datasetToken: 5, viewport, policyContext: context, clusterSize: 40, searchPageSize: 50 });
      assert.equal(bridge.nodeCount, count);
      assert.equal(bridge.documentIds.length, count);
      assert.equal(new Set(bridge.documentIds).size, count);
      assert.deepEqual(bridge.documentIds, beforeIds);
      for (const id of bridge.documentIds) assert.ok(bridge.model.documentRecord(id), 'original ID reachable ' + id);
      assert.equal(JSON.stringify(loaded.document.tree), beforeTree, 'bridge construction does not mutate tree');
      assert.equal(bridge.proxyIds.some((id) => bridge.documentIds.includes(id)), false, 'proxies never document IDs');
      // Folder/cluster navigation.
      const folders = f.tree.children.filter((n) => n.kind === 'folder');
      if (folders.length) {
        bridge.openFolder(folders[0].id);
        assert.equal(bridge.scene().folder.id, folders[0].id);
        if (bridge.proxyIds.length) {
          const scene = bridge.scene();
          if (scene.mode === 'overview' && scene.items[0]?.proxy) {
            bridge.expandCluster(scene.items[0].id);
            assert.equal(bridge.scene().mode, 'cluster');
            assert.ok(bridge.breadcrumb().some((c) => c.proxy));
            bridge.back();
          }
        }
      }
      // Search pagination and reveal.
      const search1 = bridge.search('파일', 1); const search2 = bridge.search('파일', 2);
      if (search1.total > 0) {
        assert.ok(search1.results.length <= 50);
        assert.ok(search2.page === Math.min(2, search1.pages));
        const target = search1.results[0].id;
        bridge.revealSearchResult(target);
        assert.equal(bridge.model.state.searchTargetId, target);
        assert.ok(bridge.documentIds.includes(target));
      }
      // Navigate back to root for a deterministic re-save; navigation must not alter tree.
      bridge.openFolder('root');
      assert.equal(JSON.stringify(loaded.document.tree), beforeTree, 'navigation never changes topology/metadata');
      const restoredForSave = createRestoredAttachmentRegistry({ attachments: loaded.attachments, datasetToken: 9 });
      const identityMapping = new Map(loaded.attachments.map((attachment) => [attachment.attachmentId, attachment.attachmentId]));
      const resave = buildSaveSnapshot({ tree: loaded.document.tree, registry: restoredForSave.registry, mapping: identityMapping, datasetToken: 1, capturedRevision: 0, mapId: saved.mapId, expectedGeneration: saved.generation, policyContext: context });
      restoredForSave.registry.clear();
      const savedAgain = await repo.save(resave); const reloaded = await repo.load(savedAgain.mapId);
      assert.deepEqual(ids(reloaded.document.tree), beforeIds);
      assert.equal(JSON.stringify(reloaded.document.tree), beforeTree);
      assert.equal(reloaded.map.generation, saved.generation + 1);
      for (const id of bridge.documentIds) {
        bridge.model.revealNode(id);
        if (id === 'root') continue;
        assert.ok(bridge.scene().items.some((item) => item.id === id), 'revealed node present: ' + id);
      }
      if (kind === 'mixed') {
        assert.equal(reloaded.attachments.length, 4);
        for (let i = 0; i < 4; i += 1) assert.equal(await sha(reloaded.attachments[i].blob), await sha(loaded.attachments[i].blob));
        const detail = bridge.model.documentRecord('doc-1'); assert.equal(detail.node.kind, 'file');
        bridge.select('doc-1'); assert.equal(bridge.details().attachmentId, loaded.document.tree.children[1].children[1].data.attachmentId);
        const text1 = bridge.preview('doc-0'); const text2 = bridge.preview('doc-0');
        assert.equal(text1.url, text2.url); assert.equal(await (await fetch(text1.url)).text(), '텍스트 첨부');
        const image1 = bridge.preview('doc-1'); const image2 = bridge.preview('doc-1');
        assert.equal(image1.url, image2.url); assert.equal((await (await fetch(image2.url)).arrayBuffer()).byteLength, 68);
        const pdf = bridge.preview('doc-2'); assert.match(await (await fetch(pdf.url)).text(), /^%PDF-1\.7/);
        const imageAgain = bridge.preview('doc-1'); assert.equal(imageAgain.url, image1.url);
        bridge.dispose();
        await assert.rejects(() => fetch(image1.url), 'preview URL is revoked on dispose');
      }
      bridge.dispose();
      assert.throws(() => bridge.scene(), /disposed/);
    });
  }
}








test('bridge owns preview URLs across repeat and A-B-A; dispose revokes all', async () => {
  const repo = createPersistenceRepository({ indexedDB: new FakeIndexedDB(), dbName: 'stage3d-preview-owner', policyContext: PAID_TEST_CONTEXT });
  const f = fixture('mixed', 300);
  const saved = await repo.save(buildSaveSnapshot({ tree: f.tree, registry: f.registry, datasetToken: 1, capturedRevision: 0, policyContext: PAID_TEST_CONTEXT }));
  const loaded = await repo.load(saved.mapId);
  const bridge = createSavedDocumentLodBridge({ loaded, datasetToken: 3, viewport, policyContext: PAID_TEST_CONTEXT });
  const image1 = bridge.preview('doc-1'); const image2 = bridge.preview('doc-1');
  assert.equal(image1.url, image2.url);
  assert.equal((await (await fetch(image2.url)).arrayBuffer()).byteLength, 68);
  const pdf = bridge.preview('doc-2'); assert.match(await (await fetch(pdf.url)).text(), /^%PDF-1\.7/);
  const again = bridge.preview('doc-1'); assert.equal(again.url, image1.url);
  assert.equal((await (await fetch(again.url)).arrayBuffer()).byteLength, 68);
  bridge.dispose(); bridge.dispose();
  await assert.rejects(() => fetch(image1.url));
  assert.throws(() => bridge.preview('doc-1'), /disposed/);
});
