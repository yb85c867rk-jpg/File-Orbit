import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorContextMenu } from '../../harness/m5-exploration/editor-context-menu.js';
import { dispatchEditorMenuAction, validateDeleteIntent } from '../../../src/engine/hypertree/editor/menu-dispatch.js';
import { buildDeleteCommand } from '../../../src/engine/hypertree/editor/commands.js';
import { createInternalPolicyContext } from '../../../src/engine/hypertree/edition/context.js';

class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.attributes = new Map(); this.hidden = false; this._text = ''; this.listeners = []; this.parentNode = null; }
  set textContent(value) { this._text = String(value); }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; return child; }
  addEventListener() {}
  focus() { this.focused = true; }
  contains(target) { return target === this || this.children.includes(target); }
  getBoundingClientRect() { return { width: 120, height: 180 }; }
}
function doc() {
  const d = { activeElement: null, listeners: [], body: new El('body'), createElement(tag) { return new El(tag); }, addEventListener() {} };
  return d;
}
function createMenu() {
  const d = doc(); const actions = [];
  const menu = createEditorContextMenu({ document: d, host: d.body, viewport: () => ({ width: 800, height: 600 }), onAction: (target, action) => actions.push({ target, action }) });
  return { d, menu, actions };
}
test('folder menu enables Delete Folder except at root', () => {
  const { menu } = createMenu();
  menu.open({ target: { id: 'a', hitKind: 'folder', name: 'A', isRoot: false }, x: 10, y: 10 });
  assert.equal(menu.actions.get('delete-folder').disabled, false);
  assert.equal(menu.actions.get('delete-data').hidden, true);
  menu.open({ target: { id: 'r', hitKind: 'folder', name: 'Root', isRoot: true }, x: 10, y: 10 });
  assert.equal(menu.actions.get('delete-folder').disabled, true);
});
test('data menu enables Delete Data', () => {
  const { menu } = createMenu();
  menu.open({ target: { id: 'x', hitKind: 'file', name: 'Data', isRoot: false }, x: 10, y: 10 });
  assert.equal(menu.actions.get('delete-data').disabled, false);
  assert.equal(menu.actions.get('delete-folder').hidden, true);
});
test('shared menu dispatcher routes delete without opening editor flow', () => {
  const calls = [];
  const result = dispatchEditorMenuAction({
    action: 'delete-data', target: { id: 'x' },
    requestDelete: (target, action) => { calls.push(['delete', target.id, action]); return { ok: true }; },
    dispatchEditor: () => { calls.push(['editor']); }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['delete', 'x', 'delete-data']]);
});test('delete admission accepts 300 nodes and rejects 301 before candidate', () => {
  const base = { id: 'r', name: 'Root', kind: 'folder', data: {}, children: [] };
  for (let i = 0; i < 299; i += 1) base.children.push({ id: `n${i}`, name: `N${i}`, kind: 'file', data: {} });
  const ok = buildDeleteCommand({ tree: base, targetId: 'n0', structuralRootId: 'r', datasetToken: 1, datasetTokenExpected: 1, baseRevision: 0, expectedRevision: 0 });
  assert.equal(ok.ok, true);
  const large = { ...base, children: [...base.children, { id: 'n299', name: 'N299', kind: 'file', data: {} }] };
  const rejected = buildDeleteCommand({ tree: large, targetId: 'n0', structuralRootId: 'r', datasetToken: 1, datasetTokenExpected: 1, baseRevision: 0, expectedRevision: 0 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'editor-node-limit');
  assert.equal(rejected.candidateTree, undefined);
});test('pending Delete intent validates dataset/revision/id/kind/visibility', () => {
  const graph = { nodes: new Map([['a', { id: 'a', kind: 'folder' }], ['x', { id: 'x', kind: 'file' }]]) };
  const visibleSet = new Set(['a', 'x']);
  const base = { kind: 'delete-request', target: { id: 'a', kind: 'folder' }, action: 'delete-folder', datasetToken: 2, baseRevision: 5 };
  assert.equal(validateDeleteIntent({ intent: base, datasetToken: 2, baseRevision: 5, graph, visibleSet }).ok, true);
  assert.equal(validateDeleteIntent({ intent: base, datasetToken: 3, baseRevision: 5, graph, visibleSet }).reason, 'stale-delete-confirmation');
  assert.equal(validateDeleteIntent({ intent: base, datasetToken: 2, baseRevision: 6, graph, visibleSet }).reason, 'stale-delete-confirmation');
  assert.equal(validateDeleteIntent({ intent: { ...base, target: { id: 'x', kind: 'folder' } }, datasetToken: 2, baseRevision: 5, graph, visibleSet }).reason, 'stale-delete-target');
  assert.equal(validateDeleteIntent({ intent: base, datasetToken: 2, baseRevision: 5, graph, visibleSet: new Set() }).reason, 'delete-target-invisible');
});




test('delete uses paid admission for a 492-node current map', () => {
  const tree = { id: 'r', name: 'Root', kind: 'folder', data: {}, children: [] };
  for (let i = 0; i < 491; i += 1) tree.children.push({ id: 'n' + i, name: 'N' + i, kind: 'file', data: {} });
  const paid = createInternalPolicyContext({ edition: 'paid' });
  const accepted = buildDeleteCommand({ tree, targetId: 'n0', structuralRootId: 'r', datasetToken: 1, datasetTokenExpected: 1, baseRevision: 0, expectedRevision: 0, policyContext: paid });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.candidateTree.children.length, 490);
  const free = buildDeleteCommand({ tree, targetId: 'n0', structuralRootId: 'r', datasetToken: 1, datasetTokenExpected: 1, baseRevision: 0, expectedRevision: 0 });
  assert.equal(free.ok, false);
  assert.equal(free.reason, 'editor-node-limit');
});
