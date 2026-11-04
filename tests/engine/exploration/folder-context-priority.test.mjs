import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { folderContextLabelPriorityIds } from '../../../src/engine/hypertree/exploration/label-priority.js';
import { decodeBackup } from '../../../src/engine/hypertree/persistence/backup.js';

function allIds(tree) { const ids = []; const walk = (node) => { ids.push(node.id); for (const child of node.children || []) walk(child); }; walk(tree); return ids; }
function find(tree, id) { const stack = [tree]; while (stack.length) { const node = stack.pop(); if (node.id === id) return node; for (const child of node.children || []) stack.push(child); } return null; }

test('folder context priorities return visible direct children in stable tree order', () => {
  const tree = { id: 'root', children: [
    { id: 'unrelated', children: [{ id: 'u1' }] },
    { id: 'technical', children: [{ id: 't1' }, { id: 't2' }, { id: 'hidden' }] }
  ] };
  const view = { visibleSet: new Set(['root', 'unrelated', 'u1', 'technical', 't1', 't2']) };
  assert.deepEqual(folderContextLabelPriorityIds({ tree, view, folderId: 'technical' }), ['t1', 't2']);
  assert.deepEqual(folderContextLabelPriorityIds({ tree, view, folderId: 'root' }), ['unrelated', 'technical']);
});

test('technical fixture exposes late direct children under the label budget', async () => {
  const bytes = readFileSync(new URL('../../../evidence/native-r121/r156-fixtures/technical-late-300.orbit', import.meta.url));
  const decoded = await decodeBackup(new Blob([bytes], { type: 'application/x-orbit' }));
  const ids = allIds(decoded.tree);
  assert.equal(ids.length, 300);
  const technical = find(decoded.tree, 'technical');
  assert.ok(technical);
  assert.deepEqual(technical.children.map((child) => child.id), Array.from({ length: 8 }, (_, i) => 'technical-' + String(i).padStart(2, '0')));
  const view = { focusedFolderId: 'root', visibleSet: new Set(ids), ancestorIds: ['root'] };
  const children = folderContextLabelPriorityIds({ tree: decoded.tree, view, folderId: 'technical' });
  assert.equal(children.length, 8);
  const priorityIds = ['root', 'technical', ...children];
  const nodes = new Map(ids.map((id, index) => [id, {
    id, kind: id === 'root' || id === 'technical' ? 'folder' : 'file', depth: id === 'root' ? 0 : id === 'technical' ? 1 : 2,
    center: { x: 20 + (index % 20) * 35, y: 20 + Math.floor(index / 20) * 25 }, radius: id === 'root' ? 8 : 3, visible: true, opacity: 1
  }]));
  const presentation = new Map(ids.map((id) => [id, { name: id, kind: id === 'root' || id === 'technical' ? 'folder' : 'file', dataType: 'file' }]));
  const host = { ownerDocument: { createElement(tag) { return createFake(tag); } }, clientWidth: 900, clientHeight: 650, children: [], appendChild(child) { child.parentNode = this; this.children.push(child); }, removeChild(child) { const index = this.children.indexOf(child); if (index >= 0) this.children.splice(index, 1); child.parentNode = null; } };
  function createFake(tag) { return { tagName: tag, ownerDocument: host.ownerDocument, children: [], style: {}, attributes: new Map(), setAttribute(name, value) { this.attributes.set(name, String(value)); }, getAttribute(name) { return this.attributes.get(name); }, removeAttribute(name) { this.attributes.delete(name); }, appendChild(child) { child.parentNode = this; this.children.push(child); }, removeChild(child) { const index = this.children.indexOf(child); if (index >= 0) this.children.splice(index, 1); child.parentNode = null; }, addEventListener() {}, get textContent() { return this._text || ''; }, set textContent(value) { this._text = String(value); this.offsetWidth = Math.min(140, Math.max(20, this._text.length * 7)); this.offsetHeight = 16; }, getBoundingClientRect() { const width = this.children.reduce((sum, child) => sum + (child.offsetWidth || 0), 0) + 3 * Math.max(0, this.children.length - 1); const height = Math.max(...this.children.map((child) => child.offsetHeight || 0), 0); return { left: Number.parseFloat(this.style.left) || 0, top: Number.parseFloat(this.style.top) || 0, width: this.attributes.has('data-vd-label-id') ? width : (this.offsetWidth || width), height: this.attributes.has('data-vd-label-id') ? height : (this.offsetHeight || height) }; } }; }
  const { createLabelOverlay } = await import('../../../src/engine/hypertree/render/index.js');
  const overlay = createLabelOverlay(host, { maxLabels: 40, maxWidth: 140, placement: 'around' });
  const metrics = overlay.update({ scene: { rootId: 'root', nodes, edges: [] }, presentation, priorityIds, rootId: 'root', selectedId: 'technical' });
  assert.ok(metrics.labels.has('technical-00'));
  assert.ok(metrics.labels.has('technical-07'));
  assert.equal(metrics.createdCount, 40);
  overlay.destroy();
});
