import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneTree, findTreeNode } from '../../../src/engine/hypertree/exploration/reparent.js';
import { makeAddHistoryEntry, makeReparentHistoryEntry, buildStructuralReplayCommand, buildMetadataReplayCommand } from '../../../src/engine/hypertree/editor/history-commands.js';
import { createEditorHistory } from '../../../src/engine/hypertree/editor/history.js';
import { createAttachmentRegistry, sweepAttachmentOwnership } from '../../../src/engine/hypertree/editor/attachments.js';

function source() {
  return { id: 'r', name: 'Root', kind: 'folder', data: {}, children: [
    { id: 'a', name: 'A', kind: 'folder', data: {}, children: [{ id: 'x', name: 'X', kind: 'file', data: { dataType: 'file', attachmentId: 'att' } }] },
    { id: 'b', name: 'B', kind: 'folder', data: {}, children: [] }
  ] };
}
test('add entry undoes exact node and redoes same stable ID/index', () => {
  const before = source();
  const after = cloneTree(before);
  after.children[1].children.push({ id: 'n1', name: 'New', kind: 'file', data: { dataType: 'web-link', link: 'https://n' } });
  const entry = makeAddHistoryEntry({ action: 'Add Data', tree: before, candidateTree: after, parentId: 'b', nodeId: 'n1', datasetToken: 1, viewBefore: { selectedId: null }, viewAfter: { selectedId: 'n1' } });
  const undo = buildStructuralReplayCommand({ tree: after, entry, direction: 'undo', datasetToken: 1, structuralRootId: 'r' });
  assert.equal(undo.ok, true);
  assert.equal(undo.layoutMode, 'recompute');
  assert.equal(findTreeNode(undo.candidateTree, 'n1'), null);
  const redo = buildStructuralReplayCommand({ tree: undo.candidateTree, entry, direction: 'redo', datasetToken: 1, structuralRootId: 'r' });
  assert.equal(redo.ok, true);
  assert.equal(findTreeNode(redo.candidateTree, 'n1').id, 'n1');
  assert.equal(redo.candidateTree.children[1].children[0].id, 'n1');
});
test('reparent entry restores exact parent and sibling index both directions', () => {
  const before = source();
  const after = cloneTree(before);
  const moved = findTreeNode(after, 'x');
  after.children[0].children.splice(0, 1);
  after.children[1].children.unshift(moved);
  const entry = makeReparentHistoryEntry({ tree: before, candidateTree: after, sourceId: 'x', structuralRootId: 'r', datasetToken: 1, viewBefore: { selectedId: 'x' }, viewAfter: { selectedId: 'x' } });
  const undo = buildStructuralReplayCommand({ tree: after, entry, direction: 'undo', datasetToken: 1, structuralRootId: 'r' });
  assert.equal(undo.ok, true);
  assert.equal(undo.candidateTree.children[0].children[0].id, 'x');
  assert.equal(undo.candidateTree.children[1].children.length, 0);
  const redo = buildStructuralReplayCommand({ tree: undo.candidateTree, entry, direction: 'redo', datasetToken: 1, structuralRootId: 'r' });
  assert.equal(redo.ok, true);
  assert.equal(redo.candidateTree.children[1].children[0].id, 'x');
});
test('add replay rejects ID collision and expected-state mismatch', () => {
  const before = source();
  const after = cloneTree(before);
  after.children[1].children.push({ id: 'n1', name: 'New', kind: 'file', data: {} });
  const entry = makeAddHistoryEntry({ action: 'Add Data', tree: before, candidateTree: after, parentId: 'b', nodeId: 'n1', datasetToken: 1 });
  assert.equal(buildStructuralReplayCommand({ tree: after, entry, direction: 'undo', datasetToken: 1, structuralRootId: 'r' }).ok, true);
  const mismatch = cloneTree(after); findTreeNode(mismatch, 'n1').name = 'Changed';
  assert.equal(buildStructuralReplayCommand({ tree: mismatch, entry, direction: 'undo', datasetToken: 1, structuralRootId: 'r' }).reason, 'expected-state-mismatch');
  const collision = cloneTree(before); collision.children[1].children.push({ id: 'n1', name: 'Other', kind: 'file', data: {} });
  assert.equal(buildStructuralReplayCommand({ tree: collision, entry, direction: 'redo', datasetToken: 1, structuralRootId: 'r' }).reason, 'id-collision');
  assert.equal(buildStructuralReplayCommand({ tree: after, entry, direction: 'undo', datasetToken: 2, structuralRootId: 'r' }).reason, 'stale-dataset');
});
test('history evicts oldest and keeps redo cleared only on commit', () => {
  const history = createEditorHistory({ maxEntries: 2 });
  const base = source();
  const addEntry = { kind: 'structural-add', action: 'Add', datasetToken: 1, parentId: 'b', nodeId: 'n', index: 0, node: { id: 'n' }, viewBefore: null, viewAfter: null, attachmentRefs: [] };
  for (let i = 0; i < 3; i += 1) {
    const plan = history.planAdd({ ...addEntry, nodeId: `n${i}`, node: { id: `n${i}` } });
    assert.equal(plan.ok, true);
    history.commitAdd(plan);
  }
  assert.equal(history.undoCount, 2);
  assert.equal(history.undo[0].nodeId, 'n1');
  const undo = history.planUndo(); history.commitMove(undo);
  assert.equal(history.redoCount, 1);
  const add = history.planAdd({ ...addEntry, nodeId: 'z' });
  assert.equal(history.redoCount, 1);
  history.commitAdd(add);
  assert.equal(history.redoCount, 0);
});test('attachment ownership is retained by live or history refs and released once', () => {
  const registry = createAttachmentRegistry({ datasetToken: 1 });
  const staged = registry.stage({ name: 'a.md', size: 5, type: 'text/markdown' }, { format: 'markdown' });
  assert.equal(staged.ok, true);
  registry.commit(staged.id);
  const live = { id: 'r', kind: 'folder', children: [{ id: 'x', kind: 'file', data: { attachmentId: staged.id } }] };
  const entry = { attachmentRefs: [staged.id] };
  let result = sweepAttachmentOwnership(registry, { tree: live, entries: [entry] });
  assert.deepEqual(result.released, []);
  assert.equal(registry.has(staged.id), true);
  result = sweepAttachmentOwnership(registry, { tree: { id: 'r', kind: 'folder', children: [] }, entries: [entry] });
  assert.deepEqual(result.released, []);
  assert.equal(registry.has(staged.id), true);
  result = sweepAttachmentOwnership(registry, { tree: { id: 'r', kind: 'folder', children: [] }, entries: [] });
  assert.deepEqual(result.released, [staged.id]);
  assert.equal(registry.has(staged.id), false);
  assert.equal(registry.totalBytes, 0);
});test('300-node input plus redo add rejects the 301-node candidate', () => {
  const tree = { id: 'r', name: 'Root', kind: 'folder', data: {}, children: [] };
  for (let i = 0; i < 299; i += 1) tree.children.push({ id: `n${i}`, name: `N${i}`, kind: 'file', data: {} });
  const entry = { kind: 'structural-add', action: 'Add Data', datasetToken: 1, parentId: 'r', nodeId: 'new', index: 0, node: { id: 'new', name: 'New', kind: 'file', data: {} }, viewBefore: null, viewAfter: null, attachmentRefs: [] };
  const result = buildStructuralReplayCommand({ tree, entry, direction: 'redo', datasetToken: 1, structuralRootId: 'r' });
  assert.equal(result.reason, 'editor-node-limit');
  assert.equal(result.candidateTree, undefined);
});
test('changed moved subtree metadata rejects undo; invalid index and subtree collision reject', () => {
  const before = source();
  const after = cloneTree(before);
  const moved = findTreeNode(after, 'x');
  after.children[0].children.splice(0, 1);
  after.children[1].children.unshift(moved);
  const entry = makeReparentHistoryEntry({ tree: before, candidateTree: after, sourceId: 'x', structuralRootId: 'r', datasetToken: 1 });
  const changed = cloneTree(after); findTreeNode(changed, 'x').name = 'Changed';
  assert.equal(buildStructuralReplayCommand({ tree: changed, entry, direction: 'undo', datasetToken: 1, structuralRootId: 'r' }).reason, 'expected-state-mismatch');
  const badIndex = { ...entry, fromIndex: 99 };
  assert.equal(buildStructuralReplayCommand({ tree: after, entry: badIndex, direction: 'undo', datasetToken: 1, structuralRootId: 'r' }).reason, 'invalid-index');
  const addEntry = { kind: 'structural-add', action: 'Add Data', datasetToken: 1, parentId: 'b', nodeId: 'n2', index: 0, node: { id: 'n2', name: 'N2', kind: 'file', data: {}, children: [{ id: 'x', name: 'Child', kind: 'file', data: {} }] }, viewBefore: null, viewAfter: null, attachmentRefs: [] };
  assert.equal(buildStructuralReplayCommand({ tree: before, entry: addEntry, direction: 'redo', datasetToken: 1, structuralRootId: 'r' }).reason, 'id-collision');
});test('metadata and structural replay validate root identity without ReferenceError', () => {
  const tree = source();
  const metadataEntry = { kind: 'metadata-edit', action: 'Edit Folder', targetId: 'a', hitKind: 'folder', datasetToken: 1, structuralRootId: 'r', before: { name: 'A', data: {} }, after: { name: 'A', data: {} }, viewBefore: null, viewAfter: null, attachmentRefs: [] };
  assert.equal(buildMetadataReplayCommand({ tree, entry: metadataEntry, direction: 'undo', datasetToken: 1, structuralRootId: 'r' }).ok, true, JSON.stringify(buildMetadataReplayCommand({ tree, entry: metadataEntry, direction: 'undo', datasetToken: 1, structuralRootId: 'r' })));
  assert.equal(buildMetadataReplayCommand({ tree, entry: metadataEntry, direction: 'undo', datasetToken: 1, structuralRootId: 'other' }).reason, 'stale-structural-root');
  const addEntry = { kind: 'structural-add', action: 'Add', datasetToken: 1, structuralRootId: 'r', parentId: 'b', nodeId: 'n', index: 0, node: { id: 'n', name: 'N', kind: 'file', data: {} }, viewBefore: null, viewAfter: null, attachmentRefs: [] };
  assert.equal(buildStructuralReplayCommand({ tree, entry: addEntry, direction: 'redo', datasetToken: 1, structuralRootId: 'other' }).reason, 'stale-structural-root');
});
test('counted retention survives sweeps, is idempotent, and final release reclaims bytes', () => {
  const registry = createAttachmentRegistry({ datasetToken: 1 });
  const staged = registry.stage({ name: 'retain.txt', size: 5, type: 'text/plain' }, { format: 'text' });
  registry.commit(staged.id);
  const leaseA = registry.retain(staged.id);
  const leaseB = registry.retain(staged.id);
  assert.ok(leaseA); assert.ok(leaseB); assert.notEqual(leaseA, leaseB);
  assert.equal(registry.isRetained(staged.id), true);
  let swept = sweepAttachmentOwnership(registry, { tree: { id: 'r', kind: 'folder', children: [] }, entries: [] });
  assert.deepEqual(swept.released, []);
  assert.equal(registry.has(staged.id), true);
  assert.equal(registry.releaseRetention(leaseA), true);
  assert.equal(registry.releaseRetention(leaseA), false);
  assert.equal(registry.isRetained(staged.id), true);
  swept = sweepAttachmentOwnership(registry, { tree: { id: 'r', kind: 'folder', children: [] }, entries: [] });
  assert.deepEqual(swept.released, []);
  assert.equal(registry.releaseRetention(leaseB), true);
  assert.equal(registry.isRetained(staged.id), false);
  swept = sweepAttachmentOwnership(registry, { tree: { id: 'r', kind: 'folder', children: [] }, entries: [] });
  assert.deepEqual(swept.released, [staged.id]);
  assert.equal(registry.has(staged.id), false);
  assert.equal(registry.totalBytes, 0);
});
