import test from 'node:test';
import assert from 'node:assert/strict';

import { createSelectionIntent, validateSelectionIntent } from '../../../src/engine/hypertree/editor/index.js';

const graph = { nodes: new Map([
  ['r', { id: 'r', kind: 'folder' }],
  ['a', { id: 'a', kind: 'file' }]
]) };
const visibleSet = new Set(['r', 'a']);
test('selection intent stores semantic identity only', () => {
  const intent = createSelectionIntent({ kind: 'folder-enter', targetId: 'r', hitKind: 'folder', datasetToken: 2, baseRevision: 5 });
  assert.deepEqual(intent, { kind: 'folder-enter', targetId: 'r', hitKind: 'folder', openAttachment: false, datasetToken: 2, baseRevision: 5, source: 'canvas-click' });
  assert.equal('clientX' in intent, false);
  assert.equal('clientY' in intent, false);
});
test('selection revalidates dataset, revision, kind, and visibility', () => {
  const intent = createSelectionIntent({ kind: 'folder-enter', targetId: 'r', hitKind: 'folder', datasetToken: 2, baseRevision: 5 });
  assert.equal(validateSelectionIntent({ intent, datasetToken: 2, baseRevision: 5, graph, visibleSet }).ok, true);
  assert.equal(validateSelectionIntent({ intent, datasetToken: 3, baseRevision: 5, graph, visibleSet }).reason, 'stale-intent');
  assert.equal(validateSelectionIntent({ intent, datasetToken: 2, baseRevision: 6, graph, visibleSet }).reason, 'stale-intent');
  assert.equal(validateSelectionIntent({ intent: { ...intent, targetId: 'x' }, datasetToken: 2, baseRevision: 5, graph, visibleSet }).reason, 'stale-intent');
  assert.equal(validateSelectionIntent({ intent: { ...intent, hitKind: 'file' }, datasetToken: 2, baseRevision: 5, graph, visibleSet }).reason, 'stale-intent');
  assert.equal(validateSelectionIntent({ intent: { ...intent, targetId: 'a', hitKind: 'file' }, datasetToken: 2, baseRevision: 5, graph, visibleSet: new Set() }).reason, 'stale-intent');
});
test('background intent remains valid without a target', () => {
  const intent = createSelectionIntent({ kind: 'background-clear', datasetToken: 2, baseRevision: 5 });
  assert.equal(validateSelectionIntent({ intent, datasetToken: 2, baseRevision: 5, graph, visibleSet }).ok, true);
});
