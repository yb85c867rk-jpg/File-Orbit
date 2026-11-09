import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMetadataReplayCommand } from '../../../src/engine/hypertree/editor/history-commands.js';
import { performMetadataHistoryReplay } from '../../../src/engine/hypertree/editor/history-replay.js';

const root = (name, description) => ({ id: 'root', kind: 'folder', name, data: { description }, children: [{ id: 'a', kind: 'folder', name: 'A', data: {}, children: [] }] });
const entry = (before, after) => ({ kind: 'metadata-edit', action: 'Edit Folder', targetId: 'root', hitKind: 'folder', datasetToken: 1, structuralRootId: 'root', before, after, viewBefore: { detailsTargetId: 'root' }, viewAfter: { detailsTargetId: 'root' }, attachmentRefs: [] });

test('an older title-only root entry is skipped without a revision', () => {
  const tree = root('New Name', 'same');
  const history = { moved: false, planUndo: () => ({ ok: true, entry: entry({ name: 'Old Name', data: { description: 'same' } }, { name: 'New Name', data: { description: 'same' } }), undo: [], redo: [] }), commitMove() { this.moved = true; } };
  const result = performMetadataHistoryReplay({ direction: 'undo', history, tree, datasetToken: 1, structuralRootId: 'root' });
  assert.equal(result.ok, true);
  assert.equal(result.noop, true);
  assert.equal(history.moved, true);
  assert.equal(result.message, 'This history entry only changes the superseded root title.');
});

test('an older root description entry applies description but preserves the committed title', () => {
  const tree = root('New Name', 'new description');
  const command = buildMetadataReplayCommand({
    tree,
    entry: entry({ name: 'Old Name', data: { description: 'old description' } }, { name: 'Old Name', data: { description: 'new description' } }),
    direction: 'undo',
    datasetToken: 1,
    structuralRootId: 'root'
  });
  assert.equal(command.ok, true);
  assert.equal(command.noop, false);
  assert.equal(command.candidateTree.name, 'New Name');
  assert.equal(command.candidateTree.data.description, 'old description');
});
