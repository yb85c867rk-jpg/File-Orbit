import test from 'node:test';
import assert from 'node:assert/strict';
import { findSearchTarget, validateSearchActivation, createSearchNavigationWaiter } from '../../../src/engine/hypertree/exploration/search-activation.js';

const tree = { id: 'r', name: 'Root', kind: 'folder', data: {}, children: [
  { id: 'a', name: 'A', kind: 'folder', data: {}, children: [{ id: 'x', name: 'X', kind: 'file', data: { dataType: 'file' } }] }
] };
test('resolves targets and rejects stale dataset/revision or missing ids', () => {
  const found = findSearchTarget(tree, 'x');
  assert.equal(found.parent.id, 'a');
  assert.equal(found.path, 'Root / A');
  assert.equal(validateSearchActivation({ tree, id: 'x', datasetToken: 2, revision: 5, expectedDatasetToken: 1, expectedRevision: 5 }).reason, 'stale-dataset');
  assert.equal(validateSearchActivation({ tree, id: 'x', datasetToken: 2, revision: 5, expectedDatasetToken: 2, expectedRevision: 4 }).reason, 'stale-revision');
  assert.equal(validateSearchActivation({ tree, id: 'gone', datasetToken: 2, revision: 5 }).reason, 'missing-target');
  assert.equal(validateSearchActivation({ tree, id: 'x', datasetToken: 2, revision: 5, expectedDatasetToken: 2, expectedRevision: 5 }).ok, true);
});
test('navigation waiter resolves only on matching completion and rejects cancellation', async () => {
  const waiter = createSearchNavigationWaiter();
  const first = waiter.begin({ folderId: 'a', targetId: 'x', parentId: 'a', datasetToken: 1, revision: 2 });
  assert.equal(first.ok, true);
  assert.equal(waiter.begin({ folderId: 'a', targetId: 'x', parentId: 'a', datasetToken: 1, revision: 2 }).reason, 'busy');
  assert.equal(waiter.settle('other', { ok: true }), false);
  assert.equal(waiter.settle('a', { ok: true }), true);
  const settled = await first.promise;
  assert.equal(settled.targetId, 'x');
  const second = waiter.begin({ folderId: 'a', targetId: 'x', parentId: 'a', datasetToken: 1, revision: 2 });
  assert.equal(waiter.settle('a', { ok: false, error: new Error('failed') }), true);
  await assert.rejects(second.promise, /failed/);
  const third = waiter.begin({ folderId: 'a', targetId: 'x', parentId: 'a', datasetToken: 1, revision: 2 });
  waiter.cancel('cancelled');
  await assert.rejects(third.promise, /cancelled/);
});
