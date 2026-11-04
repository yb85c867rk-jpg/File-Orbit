import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorHistory, serializedHistoryBytes } from '../../../src/engine/hypertree/editor/history.js';
import { makeMetadataHistoryEntry, buildMetadataReplayCommand } from '../../../src/engine/hypertree/editor/history-commands.js';

function tree(name = 'Alpha', description = 'old') {
  return { id: 'r', name: 'Root', kind: 'folder', data: {}, children: [
    { id: 'a', name, kind: 'folder', data: { description, custom: 'keep' }, children: [
      { id: 'x', name: 'File', kind: 'file', data: { dataType: 'file', description: 'd', attachmentId: 'att', classification: { format: 'markdown' } } }
    ] }
  ] };
}
function entry() {
  const before = tree();
  const after = tree('Beta', 'new');
  return makeMetadataHistoryEntry({ action: 'Edit Folder', tree: before, candidateTree: after, targetId: 'a', datasetToken: 1, viewBefore: { selectedId: 'x', camera: { zoom: 1 } }, viewAfter: { selectedId: 'a', camera: { zoom: 2 } } });
}
test('history bounds use UTF-8 bytes and non-mutating reservation', () => {
  const history = createEditorHistory();
  const item = entry();
  const bytes = serializedHistoryBytes(item);
  assert.ok(bytes > 0);
  const plan = history.planAdd(item);
  assert.equal(plan.ok, true);
  assert.equal(history.undoCount, 0);
  history.commitAdd(plan);
  assert.equal(history.undoCount, 1);
  assert.equal(history.totalBytes, bytes);
  const over = { ...item, before: { name: '가'.repeat(800000), data: {} } };
  assert.equal(history.planAdd(over).reason, 'history-entry-limit');
  assert.equal(history.undoCount, 1);
});
test('metadata replay validates expected state and restores exact before/after', () => {
  const item = entry();
  const current = tree('Beta', 'new');
  const undo = buildMetadataReplayCommand({ tree: current, entry: item, direction: 'undo', datasetToken: 1 });
  assert.equal(undo.ok, true);
  assert.equal(undo.layoutMode, 'preserve');
  assert.equal(undo.candidateTree.children[0].name, 'Alpha');
  assert.equal(undo.candidateTree.children[0].data.description, 'old');
  assert.equal(undo.candidateTree.children[0].data.custom, 'keep');
  assert.deepEqual(undo.view, item.viewBefore);
  const redo = buildMetadataReplayCommand({ tree: undo.candidateTree, entry: item, direction: 'redo', datasetToken: 1 });
  assert.equal(redo.ok, true);
  assert.equal(redo.candidateTree.children[0].name, 'Beta');
  assert.equal(redo.candidateTree.children[0].data.description, 'new');
  assert.deepEqual(redo.view, item.viewAfter);
  assert.equal(buildMetadataReplayCommand({ tree: tree(), entry: item, direction: 'undo', datasetToken: 2 }).reason, 'stale-dataset');
  assert.equal(buildMetadataReplayCommand({ tree: tree(), entry: item, direction: 'undo', datasetToken: 1 }).reason, 'expected-state-mismatch');
});
test('history keeps attachments as JSON metadata only and preserves classification', () => {
  const item = entry();
  const serialized = JSON.stringify(item);
  assert.equal(serialized.includes('Blob'), false);
  const command = buildMetadataReplayCommand({ tree: tree('Beta', 'new'), entry: item, direction: 'undo', datasetToken: 1 });
  assert.equal(command.candidateTree.children[0].children[0].data.attachmentId, 'att');
  assert.equal(command.candidateTree.children[0].children[0].data.classification.format, 'markdown');
});
test('redo clears only on successful add and entries remain independently owned', () => {
  const history = createEditorHistory();
  const first = entry();
  history.commitAdd(history.planAdd(first));
  const undo = history.planUndo();
  history.commitMove(undo);
  assert.equal(history.redoCount, 1);
  const second = entry();
  const add = history.planAdd(second);
  assert.equal(history.redoCount, 1);
  history.commitAdd(add);
  assert.equal(history.redoCount, 0);
  assert.notEqual(first.before, second.before);
  assert.equal(history.undo.at(-1).action, 'Edit Folder');
});test('E3-A replay rejects 301 nodes before candidate preparation', () => {
  const item = entry();
  const large = tree('Beta', 'new');
  for (let i = 0; i < 300; i += 1) large.children.push({ id: `n${i}`, name: `N${i}`, kind: 'file', data: {} });
  const result = buildMetadataReplayCommand({ tree: large, entry: item, direction: 'undo', datasetToken: 1 });
  assert.equal(result.reason, 'editor-node-limit');
  assert.equal(result.candidateTree, undefined);
});

