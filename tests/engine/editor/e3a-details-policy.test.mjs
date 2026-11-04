import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePostOperationDetails } from '../../../src/engine/hypertree/editor/details-policy.js';

function model(visibleIds, selectedId = null, focusedFolderId = 'r') {
  return { selectedId, focusedFolderId, view: () => ({ visibleSet: new Set(visibleIds) }) };
}
const graph = { nodes: new Map([['r', {}], ['a', {}], ['b', {}], ['new', {}]]) };
test('Add falls back to visible parent when new child is outside scope', () => {
  assert.equal(resolvePostOperationDetails({ operation: 'add-folder', parentId: 'a', model: model(['a'], 'new'), graph }), 'a');
  assert.equal(resolvePostOperationDetails({ operation: 'add-data', parentId: 'a', model: model(['a', 'new'], 'new'), graph }), 'new');
});
test('reparent preserves valid current details, otherwise uses visible source fallback', () => {
  assert.equal(resolvePostOperationDetails({ operation: 'reparent', currentDetailsTargetId: 'a', sourceId: 'b', model: model(['a', 'b']), graph }), 'a');
  assert.equal(resolvePostOperationDetails({ operation: 'reparent', currentDetailsTargetId: 'missing', sourceId: 'b', model: model(['b']), graph }), 'b');
  assert.equal(resolvePostOperationDetails({ operation: 'reparent', currentDetailsTargetId: null, sourceId: 'b', model: model(['b']), graph }), null);
});
test('policy returns explicit null when no valid visible target exists', () => {
  assert.equal(resolvePostOperationDetails({ operation: 'add-folder', parentId: 'a', model: model([], null), graph }), null);
  assert.equal(resolvePostOperationDetails({ operation: 'reparent', currentDetailsTargetId: null, sourceId: 'b', model: model([], null, null), graph }), null);
});
