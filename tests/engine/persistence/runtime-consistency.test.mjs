import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconstructSavedMapRuntime,
  loadSavedMapRuntime,
  PersistenceError
} from '../../../src/engine/hypertree/persistence/index.js';

function tree(count) {
  return {
    id: 'root', name: 'Runtime Boundary', kind: 'folder', data: {},
    children: Array.from({ length: count - 1 }, (_, index) => ({
      id: `n${index}`, name: `node-${index}.txt`, kind: 'file', data: { dataType: 'legacy' }, children: []
    }))
  };
}
function loaded(documentTree, declaredCount, attachments = []) {
  return {
    map: { mapId: 'map_runtime_test', generation: 1, nodeCount: declaredCount, attachmentBytes: 0 },
    document: { tree: documentTree },
    attachments
  };
}
const viewport = { width: 1600, height: 1000 };
const code = (expected) => (error) => error instanceof PersistenceError && error.code === expected;

test('runtime rejects actual 1 with declared 2 before attachment adoption', () => {
  const badAttachments = [{ attachmentId: 'att_bad', blob: null, metadata: {} }];
  assert.throws(
    () => reconstructSavedMapRuntime({ loaded: loaded(tree(1), 2, badAttachments), datasetToken: 1, viewport, maxNodes: 1000 }),
    code('node-count-inconsistent')
  );
});

test('runtime rejects actual 2 with declared 1', () => {
  assert.throws(
    () => reconstructSavedMapRuntime({ loaded: loaded(tree(2), 1), datasetToken: 1, viewport }),
    code('node-count-inconsistent')
  );
});

test('runtime accepts matching counts at 2 and 300', () => {
  const two = reconstructSavedMapRuntime({ loaded: loaded(tree(2), 2), datasetToken: 1, viewport });
  assert.equal(two.nodeCount, 2);
  assert.equal(two.graph.nodes.size, 2);
  const threeHundred = reconstructSavedMapRuntime({ loaded: loaded(tree(300), 300), datasetToken: 1, viewport, maxNodes: 1000 });
  assert.equal(threeHundred.nodeCount, 300);
  assert.equal(threeHundred.graph.nodes.size, 300);
  assert.equal(threeHundred.tree.children.length, 299);
});

test('runtime rejects actual 301 even when a lower count is declared', () => {
  assert.throws(
    () => reconstructSavedMapRuntime({ loaded: loaded(tree(301), 1), datasetToken: 1, viewport, maxNodes: 1000 }),
    (error) => error instanceof PersistenceError && (error.code === 'runtime-reconstruction-failed' || error.code === 'node-limit' || error.code === 'node-count-inconsistent')
  );
});

test('loadSavedMapRuntime rejects a stub repository with inconsistent data', async () => {
  const repository = { async load() { return loaded(tree(1), 2); } };
  await assert.rejects(
    () => loadSavedMapRuntime({ repository, mapId: 'map_runtime_test', datasetToken: 1, viewport }),
    code('node-count-inconsistent')
  );
});

test('runtime count rejection preserves caller-owned input and live state', () => {
  const input = loaded(tree(1), 2);
  const before = JSON.stringify(input);
  const live = { tree: { id: 'live' }, selection: null, history: ['sentinel'] };
  const liveBefore = JSON.stringify(live);
  assert.throws(
    () => reconstructSavedMapRuntime({ loaded: input, datasetToken: 1, viewport }),
    code('node-count-inconsistent')
  );
  assert.equal(JSON.stringify(input), before);
  assert.equal(JSON.stringify(live), liveBefore);
  assert.equal(live.history[0], 'sentinel');
});
