import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorTarget, normalizeEditorTarget } from '../../../src/engine/hypertree/editor/target.js';

test('canonical editor target preserves id, hitKind, token, revision', () => {
  const target = createEditorTarget({ id: 'a', hitKind: 'folder', name: 'Alpha', datasetToken: 2, baseRevision: 5 });
  assert.deepEqual(target, {
    kind: 'editor-target', id: 'a', hitKind: 'folder', name: 'Alpha', datasetToken: 2, baseRevision: 5
  });
  assert.equal(Object.isFrozen(target), true);
  assert.equal(createEditorTarget({ id: 'b', hitKind: 'file', datasetToken: 0, baseRevision: 0 }).name, null);
});
test('legacy pending targetId form normalizes to the same canonical schema', () => {
  const target = normalizeEditorTarget({ kind: 'editor-target', targetId: 'b', hitKind: 'file', datasetToken: 3, baseRevision: 4 });
  assert.equal(target.id, 'b');
  assert.equal(target.hitKind, 'file');
  assert.equal(target.datasetToken, 3);
  assert.equal(target.baseRevision, 4);
  assert.equal(normalizeEditorTarget({ id: 'a', hitKind: 'bad', datasetToken: 1, baseRevision: 1 }), null);
  assert.equal(normalizeEditorTarget({ id: '', hitKind: 'file', datasetToken: 1, baseRevision: 1 }), null);
});
