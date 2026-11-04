import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorMenuAdapter } from '../../../src/engine/hypertree/editor/editor-menu-adapter.js';
import { createEditorTarget } from '../../../src/engine/hypertree/editor/target.js';

function setup(identity = { datasetToken: 2, baseRevision: 5 }) {
  const graph = { nodes: new Map([['a', { id: 'a', kind: 'folder' }], ['x', { id: 'x', kind: 'file' }]]) };
  const opened = [];
  const controller = { isOpen: () => false, isSaving: () => false, dirty: false, mode: 'idle' };
  const adapter = createEditorMenuAdapter({
    getIdentity: () => identity,
    getDependencies: () => ({
      editorController: controller, graph, visibleSet: new Set(['a', 'x']),
      getDetails: (id) => id === 'a' ? { id: 'a', kind: 'folder', name: 'Alpha' } : { id: 'x', kind: 'file', name: 'Data' },
      openAction: (details, action) => { opened.push({ id: details.id, action }); return { ok: true }; },
      requestPrompt: () => { opened.push({ prompt: true }); },
      onDiagnostic: () => {}
    })
  });
  return { adapter, opened, identity };
}
const target = (id, hitKind, token = 2, rev = 5, name = null) => createEditorTarget({ id, hitKind, name, datasetToken: token, baseRevision: rev });
test('adapter supplies current identity for Add Data/Add Folder', () => {
  const s = setup();
  assert.equal(s.adapter(target('a', 'folder'), 'add-data').ok, true);
  assert.deepEqual(s.opened.at(-1), { id: 'a', action: 'add-data' });
  assert.equal(s.adapter(target('a', 'folder'), 'add-folder').ok, true);
  assert.deepEqual(s.opened.at(-1), { id: 'a', action: 'add-folder' });
});
test('adapter supplies identity for Edit Folder/Data explicit targets', () => {
  const s = setup();
  assert.equal(s.adapter(target('a', 'folder'), 'edit-folder').ok, true);
  assert.deepEqual(s.opened.at(-1), { id: 'a', action: 'edit-folder' });
  assert.equal(s.adapter(target('x', 'file'), 'edit-data').ok, true);
  assert.deepEqual(s.opened.at(-1), { id: 'x', action: 'edit-data' });
});
test('stale dataset/revision rejects without opening', () => {
  const s = setup({ datasetToken: 3, baseRevision: 6 });
  const before = s.opened.length;
  assert.equal(s.adapter(target('a', 'folder'), 'add-data').ok, false);
  assert.equal(s.opened.length, before);
  assert.equal(s.adapter(target('x', 'file', 2, 6), 'edit-data').ok, false);
  assert.equal(s.opened.length, before);
});
