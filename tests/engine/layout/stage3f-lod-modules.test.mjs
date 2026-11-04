import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LodPresentationModel, validateClusterSize } from '../../../src/engine/hypertree/lod/presentation-model.js';
import { presentationStaged, createLodRenderAdapter } from '../../../src/engine/hypertree/lod/render-adapter.js';
import { createSavedDocumentLodBridge } from '../../../src/engine/hypertree/lod/saved-document-bridge.js';
import { LodPresentationModel as WrapperModel } from '../../../analysis/stage2b2/model.mjs';
import { presentationStaged as WrapperStaged } from '../../../analysis/stage2b2/adapter.mjs';
import { createSavedDocumentLodBridge as WrapperBridge } from '../../../analysis/stage3d/bridge.mjs';

test('Stage 3F production LOD modules own implementation; wrappers re-export the same implementation', () => {
  assert.equal(WrapperModel, LodPresentationModel);
  assert.equal(WrapperStaged, presentationStaged);
  assert.equal(WrapperBridge, createSavedDocumentLodBridge);
  for (const path of [
    '../../../src/engine/hypertree/lod/presentation-model.js',
    '../../../src/engine/hypertree/lod/render-adapter.js',
    '../../../src/engine/hypertree/lod/saved-document-bridge.js'
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /analysis\/|tests\/|test\//, `${path} must not depend on analysis or tests`);
  }
  const tree = { id: 'root', name: 'root', kind: 'folder', data: {}, children: Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, name: `n${i}.txt`, kind: 'file', data: {}, children: [] })) };
  const model = new LodPresentationModel(tree, { clusterSize: 40, clusterPageSize: 8 });
  assert.equal(model.buildScene().mode, 'folder');
  assert.equal(model.buildScene().pages, 5);
  assert.equal(model.buildScene().items.length, 8);
  model.setFolderPage(2);
  assert.equal(model.buildScene().page, 2);
  assert.equal(model.buildScene().items.length, 8);
  assert.equal(validateClusterSize(40), 40);
  assert.equal(typeof createLodRenderAdapter, 'function');
  assert.equal(typeof createSavedDocumentLodBridge, 'function');
});
