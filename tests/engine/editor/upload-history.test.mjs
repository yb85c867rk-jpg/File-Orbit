import test from 'node:test';
import assert from 'node:assert/strict';
import { makeUploadHistoryEntry, buildStructuralReplayCommand } from '../../../src/engine/hypertree/editor/history-commands.js';

const folder = (id, name, children = []) => ({ id, name, kind: 'folder', data: { description: null }, children });
const file = (id, name, attachmentId) => ({ id, name, kind: 'file', data: { dataType: 'file', description: null, attachmentId } });

test('one upload history entry undoes and redoes the entire added hierarchy', () => {
  const tree = folder('root', 'Root', [folder('target', 'Target', [file('old', 'old.txt', 'att-old')])]);
  const candidate = folder('root', 'Root', [folder('target', 'Target', [
    file('old', 'old.txt', 'att-old'),
    folder('new-a', 'Reports', [file('new-a-file', 'summary.pdf', 'att-new-a')]),
    file('new-b', 'notes.txt', 'att-new-b')
  ])]);
  const entry = makeUploadHistoryEntry({
    action: 'Upload', tree, candidateTree: candidate, parentId: 'target',
    addedRootIds: ['new-a', 'new-b'], viewBefore: { focusedFolderId: 'root' }, viewAfter: { focusedFolderId: 'target' }, datasetToken: 7
  });
  assert.ok(entry);
  assert.equal(entry.kind, 'structural-add-many');
  assert.deepEqual(entry.attachmentRefs.sort(), ['att-new-a', 'att-new-b']);
  const undo = buildStructuralReplayCommand({ tree: candidate, entry, direction: 'undo', datasetToken: 7, structuralRootId: 'root' });
  assert.equal(undo.ok, true);
  assert.deepEqual(undo.candidateTree.children[0].children.map((node) => node.id), ['old']);
  const redo = buildStructuralReplayCommand({ tree: undo.candidateTree, entry, direction: 'redo', datasetToken: 7, structuralRootId: 'root' });
  assert.equal(redo.ok, true);
  assert.deepEqual(redo.candidateTree.children[0].children.map((node) => node.id), ['old', 'new-a', 'new-b']);
  assert.equal(redo.candidateTree.children[0].children[1].children[0].data.attachmentId, 'att-new-a');
  assert.equal(redo.candidateTree.children[0].children[2].data.attachmentId, 'att-new-b');
});

test('bulk upload replay rejects a changed subtree and stale dataset', () => {
  const tree = folder('root', 'Root', [folder('target', 'Target')]);
  const candidate = folder('root', 'Root', [folder('target', 'Target', [folder('pack', 'Pack', [])])]);
  const entry = makeUploadHistoryEntry({ action: 'Upload', tree, candidateTree: candidate, parentId: 'target', addedRootIds: ['pack'], viewBefore: {}, viewAfter: {}, datasetToken: 1 });
  const changed = folder('root', 'Root', [folder('target', 'Target', [folder('pack', 'Changed', [])])]);
  const mismatch = buildStructuralReplayCommand({ tree: changed, entry, direction: 'undo', datasetToken: 1, structuralRootId: 'root' });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, 'expected-state-mismatch');
  const stale = buildStructuralReplayCommand({ tree: candidate, entry, direction: 'undo', datasetToken: 2, structuralRootId: 'root' });
  assert.equal(stale.reason, 'stale-dataset');
});
