import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRenameCommand, EDITOR_MAX_NODES, nameKey, validateEditorAdmission, validateName, validateRename } from '../../../src/engine/hypertree/editor/index.js';

function node(id, kind, name, children) {
  return { id, name, kind, data: Object.create(null), children: children || [] };
}
function tree() {
  return node('r', 'folder', 'Root', [
    node('a', 'folder', 'Alpha'),
    node('b', 'file', 'Beta')
  ]);
}
test('names trim, preserve text, and enforce code points/control characters', () => {
  assert.equal(validateName('  Hello  ').name, 'Hello');
  assert.equal(validateName('가'.repeat(200)).ok, true);
  assert.equal(validateName('가'.repeat(201)).reason, 'name-too-long');
  assert.equal(validateName('Hello\nWorld').reason, 'name-control');
  assert.equal(validateName('   ').reason, 'name-required');
  assert.equal(validateName(12).reason, 'name-required');
  assert.equal(validateName('<b>bold</b>').name, '<b>bold</b>');
});
test('duplicate comparison is NFC + Unicode lowercase across kinds', () => {
  const t = tree();
  t.children[1].name = 'ALPHA';
  const upper = validateRename({ tree: t, targetId: 'a', draftName: 'alpha' });
  assert.equal(upper.ok, false);
  assert.equal(upper.reason, 'duplicate-name');
  t.children[1].name = 'A\u0301lpha';
  const composed = validateRename({ tree: t, targetId: 'a', draftName: 'Álpha' });
  assert.equal(composed.reason, 'duplicate-name');
  assert.equal(nameKey('  A\u0301LPHA '), 'álpha');
});
test('rename preserves stable IDs/kinds and treats trimmed same name as no-op', () => {
  const t = tree();
  const same = buildRenameCommand({ tree: t, targetId: 'a', draftName: ' Alpha ', datasetToken: 1, baseRevision: 2, expectedDatasetToken: 1, expectedRevision: 2 });
  assert.equal(same.ok, true);
  assert.equal(same.noop, true);
  assert.equal(same.candidateTree, undefined);
  const moved = buildRenameCommand({ tree: t, targetId: 'a', draftName: 'Gamma', datasetToken: 1, baseRevision: 2, expectedDatasetToken: 1, expectedRevision: 2 });
  assert.equal(moved.ok, true);
  assert.equal(moved.candidateTree.children[0].id, 'a');
  assert.equal(moved.candidateTree.children[0].kind, 'folder');
  assert.equal(moved.candidateTree.children[0].name, 'Gamma');
  assert.equal(t.children[0].name, 'Alpha');
});
test('dataset/revision staleness rejects before candidate', () => {
  const t = tree();
  const stale = buildRenameCommand({ tree: t, targetId: 'a', draftName: 'Gamma', datasetToken: 2, baseRevision: 2, expectedDatasetToken: 1, expectedRevision: 2 });
  assert.equal(stale.reason, 'stale-dataset');
  const revision = buildRenameCommand({ tree: t, targetId: 'a', draftName: 'Gamma', datasetToken: 1, baseRevision: 3, expectedDatasetToken: 1, expectedRevision: 2 });
  assert.equal(revision.reason, 'stale-revision');
});
test('editor admission is capped at 300 nodes', () => {
  const within = node('r', 'folder', 'Root', Array.from({ length: EDITOR_MAX_NODES - 1 }, (_, index) => node(`n${index}`, 'file', `N${index}`)));
  assert.equal(validateEditorAdmission(within).ok, true);
  within.children.push(node('overflow', 'file', 'Overflow'));
  assert.equal(validateEditorAdmission(within).reason, 'editor-node-limit');
  const rename = buildRenameCommand({ tree: within, targetId: 'r', draftName: 'Other', datasetToken: 1, baseRevision: 0, expectedDatasetToken: 1, expectedRevision: 0 });
  assert.equal(rename.reason, 'editor-node-limit');
});


