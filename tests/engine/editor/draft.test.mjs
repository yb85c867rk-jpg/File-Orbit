import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorController } from '../../../src/engine/hypertree/editor/index.js';

test('controller tracks dirty draft and no-op save state', () => {
  const c = createEditorController();
  assert.equal(c.open({ id: 'a', name: 'Alpha' }), true);
  assert.equal(c.dirty, false);
  c.updateDraft('Alpha');
  assert.equal(c.dirty, false);
  c.updateDraft('Beta');
  assert.equal(c.dirty, true);
  assert.equal(c.beginSave(), true);
  assert.equal(c.isSaving(), true);
  c.saveFailed('duplicate');
  assert.equal(c.mode, 'editing');
  assert.equal(c.dirty, true);
  assert.equal(c.draftName, 'Beta');
  assert.equal(c.beginSave(), true);
  c.saveSucceeded();
  assert.equal(c.mode, 'closed');
  assert.equal(c.dirty, false);
});

test('dirty selection intent is held until continue or discard', () => {
  const c = createEditorController();
  c.open({ id: 'a', name: 'Alpha' });
  c.updateDraft('Beta');
  const intent = { kind: 'folder-enter', targetId: 'b', datasetToken: 2, baseRevision: 4, hitKind: 'folder' };
  const first = c.requestSelection(intent);
  assert.equal(first.blocked, true);
  assert.equal(c.pendingIntent, intent);
  assert.equal(c.requestSelection({ ...intent, targetId: 'c' }).reason, 'prompt-open');
  assert.equal(c.continueEditing(), true);
  assert.equal(c.pendingIntent, null);
  assert.equal(c.mode, 'editing');
  assert.equal(c.draftName, 'Beta');
  c.requestSelection(intent);
  assert.deepEqual(c.discardChanges(), intent);
  assert.equal(c.mode, 'closed');
  assert.equal(c.pendingIntent, null);
});

test('saving refuses replacement and cancel does not clear a saving draft', () => {
  const c = createEditorController();
  c.open({ id: 'a', name: 'Alpha' });
  c.updateDraft('Beta');
  c.beginSave();
  assert.equal(c.requestSelection({ targetId: 'b' }).reason, 'saving');
  assert.equal(c.cancel(), false);
  assert.equal(c.draftName, 'Beta');
});
test('open is idempotent and captures immutable dataset/revision identity', () => {
  const c = createEditorController();
  assert.equal(c.open({ id: 'a', name: 'Alpha', datasetToken: 2, baseRevision: 7 }), true);
  assert.equal(c.datasetToken, 2);
  assert.equal(c.baseRevision, 7);
  c.updateDraft('Beta');
  c.requestSelection({ targetId: 'b' });
  assert.equal(c.open({ id: 'c', name: 'Gamma', datasetToken: 9, baseRevision: 99 }), false);
  assert.equal(c.targetId, 'a');
  assert.equal(c.draftName, 'Beta');
  assert.equal(c.pendingIntent.targetId, 'b');
  assert.equal(c.datasetToken, 2);
  assert.equal(c.baseRevision, 7);
  c.discardChanges();
  assert.equal(c.open({ id: 'c', name: 'Gamma', datasetToken: 9, baseRevision: 99 }), true);
  assert.equal(c.datasetToken, 9);
});

