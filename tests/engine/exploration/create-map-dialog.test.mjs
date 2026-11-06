import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreateMapDialog } from '../../harness/m5-exploration/create-map-dialog.js';

class FakeElement {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = new Map(); this.dataset = {}; this.style = {}; this.listeners = new Map(); this._textContent = ''; this.className = ''; this.hidden = false; this.disabled = false; this.files = []; this.parent = null; this.id = ''; this.offsetParent = null; this.isConnected = true; this.focusCount = 0; }
  get textContent() { return this._textContent; }
  set textContent(value) { this._textContent = String(value); this.children = []; }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  appendChild(node) { node.parent = this; this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== fn)); }
  async dispatch(type, event = {}) { for (const fn of [...(this.listeners.get(type) || [])]) await fn({ type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...event }); }
  async click() { await this.dispatch('click'); }
  focus() { this.focusCount += 1; this.ownerDocument.activeElement = this; }
}
class FakeDocument {
  constructor() { this.documentElement = new FakeElement('html'); this.activeElement = null; this.listeners = new Map(); }
  createElement(tag) { const el = new FakeElement(tag); el.ownerDocument = this; return el; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== fn)); }
  async keydown(event) { for (const fn of [...(this.listeners.get('keydown') || [])]) await fn({ preventDefault() {}, ...event }); }
}
const preview = { ok: true, tree: { name: 'Map', kind: 'folder', children: [{ name: 'A', kind: 'folder', children: [] }, { name: 'x.txt', kind: 'file', children: [] }] }, stats: { folderCount: 2, fileCount: 1, totalBytes: 4 } };
function setup({ fallback = null } = {}) {
  const document = new FakeDocument(); const host = document.createElement('div');
  const calls = { selections: [], names: [], creates: [], cancels: 0 };
  const makePreview = (mapName, selection) => ({ ...preview, tree: { ...preview.tree, name: mapName }, selection });
  const dialog = createCreateMapDialog({ document, host,
    onSelection: async (selection) => { calls.selections.push(selection); return makePreview(selection.mapName, { files: selection.files, folders: selection.folders }); },
    onNameChange: async ({ mapName, selection }) => { calls.names.push(mapName); return makePreview(mapName, selection); },
    onCreate: async (candidate) => { calls.creates.push(candidate.tree.name); return { ok: true }; },
    onCancel: () => { calls.cancels += 1; }, getFallbackFocus: () => fallback });
  dialog.setDropEntryHandler(async () => preview);
  return { document, host, dialog, calls };
}
function input(host, tag) { return host.children[0].children[0].children.find((child) => child.tagName === tag); }
test('dialog opens, previews picks, confirms replacement, and creates once', async () => {
  const { document, host, dialog, calls } = setup();
  const trigger = new FakeElement('button'); trigger.ownerDocument = document; document.activeElement = trigger;
  dialog.show();
  assert.equal(host.children[0].hidden, false);
  const fileInputs = [];
  const walk = (node) => { if (node.tagName === 'INPUT' && node.type === 'file') fileInputs.push(node); for (const child of node.children) walk(child); };
  walk(host.children[0]);
  const filesInput = fileInputs.find((el) => el.multiple === true && el.attributes.has('webkitdirectory'));
  filesInput.files = [{ name: 'x.txt', size: 4 }];
  await filesInput.dispatch('change');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.selections.length, 1);
  const create = findButton(host, 'Create Map');
  assert.equal(create.disabled, false);
  await create.click();
  const replace = findButton(host, 'Replace map');
  assert.equal(replace.disabled, false);
  await replace.click();
  await replace.click();
  assert.equal(calls.creates.length, 1);
  const cancel = findButton(host, 'Cancel');
  await cancel.click();
  assert.equal(calls.cancels, 1);
  assert.equal(host.children[0].hidden, true);
  dialog.destroy();
});
test('mixed file/drop controls are absent and escape closes', async () => {
  const { document, host, dialog, calls } = setup();
  dialog.show();
  assert.equal(findClass(host.children[0], 'create-map-drop'), null);
  const fileInputs = [];
  const walk = (node) => { if (node.tagName === 'INPUT' && node.type === 'file') fileInputs.push(node); for (const child of node.children) walk(child); };
  walk(host.children[0]);
  assert.equal(fileInputs.some((el) => el.multiple && !el.attributes.has('webkitdirectory')), false);
  assert.equal(findAll(host, (node) => node.tagName === 'BUTTON' && node.textContent === 'Select files (optional)').length, 0);
  await document.keydown({ key: 'Escape' });
  assert.equal(host.children[0].hidden, true);
  assert.equal(calls.cancels, 1);
});
function findButton(node, text) { if (node.tagName === 'BUTTON' && node.textContent === text) return node; for (const child of node.children) { const found = findButton(child, text); if (found) return found; } return null; }
function findClass(node, cls) { if (node.className === cls) return node; for (const child of node.children) { const found = findClass(child, cls); if (found) return found; } return null; }test('map-name changes rebuild from retained selection and never install stale names', async () => {
  const { host, dialog, calls } = setup();
  dialog.show();
  const filesInput = findAll(host, (node) => node.tagName === 'INPUT' && node.type === 'file' && node.multiple && node.attributes.has('webkitdirectory'))[0];
  filesInput.files = [{ name: 'x.txt', size: 4 }];
  await filesInput.dispatch('change');
  await flush();
  const name = findAll(host, (node) => node.tagName === 'INPUT' && node.type === 'text')[0];
  name.value = 'B'; await name.dispatch('input');
  await flush();
  assert.deepEqual(calls.names, ['B']);
  assert.equal(findButton(host, 'Create Map').disabled, false);
  await findButton(host, 'Create Map').click();
  await findButton(host, 'Replace map').click();
  assert.deepEqual(calls.creates, ['B']);
});
test('invalid name blocks creation and rapid changes keep only the latest preview', async () => {
  const { host, dialog } = setup();
  dialog.show();
  const filesInput = findAll(host, (node) => node.tagName === 'INPUT' && node.type === 'file' && node.multiple && node.attributes.has('webkitdirectory'))[0];
  filesInput.files = [{ name: 'x.txt', size: 4 }];
  await filesInput.dispatch('change'); await flush();
  const name = findAll(host, (node) => node.tagName === 'INPUT' && node.type === 'text')[0];
  name.value = ''; await name.dispatch('input'); await flush();
  assert.equal(findButton(host, 'Create Map').disabled, true);
  name.value = 'C'; await name.dispatch('input'); await flush();
  assert.equal(findButton(host, 'Create Map').disabled, false);
  dialog.close();
});
test('focus trap follows the active stage and back restores creation focus', async () => {
  const { document, host, dialog } = setup();
  document.activeElement = host; dialog.show();
  const cancel = findButton(host, 'Cancel'); const create = findButton(host, 'Create Map');
  cancel.focus(); await document.keydown({ key: 'Tab' });
  assert.equal(document.activeElement, findAll(host, (node) => node.tagName === 'INPUT' && node.type === 'text')[0]);
  await document.keydown({ key: 'Tab', shiftKey: true });
  assert.equal(document.activeElement, cancel);
  const filesInput = findAll(host, (node) => node.tagName === 'INPUT' && node.type === 'file' && node.multiple && node.attributes.has('webkitdirectory'))[0];
  filesInput.files = [{ name: 'x.txt', size: 4 }]; await filesInput.dispatch('change'); await flush();
  await create.click();
  const replace = findButton(host, 'Replace map'); replace.focus();
  await document.keydown({ key: 'Tab' });
  assert.equal(document.activeElement, findAll(host, (node) => node.tagName === 'BUTTON' && node.textContent === 'Cancel').at(-1));
  await document.keydown({ key: 'Tab', shiftKey: true });
  assert.equal(document.activeElement, replace);
  await findButton(host, 'Back').click();
  assert.equal(document.activeElement, create);
  dialog.close();
});
function findAll(node, predicate, out = []) { if (predicate(node)) out.push(node); for (const child of node.children) findAll(child, predicate, out); return out; }
function flush() { return new Promise((resolve) => setTimeout(resolve, 0)); }test('visibility ignores null offsetParent, includes document ancestors, and recovers outside focus', async () => {
  const { document, host, dialog } = setup();
  const body = new FakeElement('body'); body.ownerDocument = document;
  const html = new FakeElement('html'); html.ownerDocument = document;
  body.parent = html; host.parent = body;
  document.activeElement = host; dialog.show();
  const name = findAll(host, (node) => node.tagName === 'INPUT' && node.type === 'text')[0];
  const cancel = findButton(host, 'Cancel');
  name.focus(); await document.keydown({ key: 'Tab', shiftKey: true });
  assert.equal(document.activeElement, cancel);
  const outside = new FakeElement('button'); outside.ownerDocument = document; document.activeElement = outside;
  await document.keydown({ key: 'Tab' });
  assert.equal(document.activeElement, name);
  dialog.close();
});
test('close falls back from hidden/responsive/removed invokers and restores once', async () => {
  const fallback = new FakeElement('button'); fallback.ownerDocument = null;
  const { document, host, dialog } = setup({ fallback });
  fallback.ownerDocument = document;
  const desktop = new FakeElement('button'); desktop.ownerDocument = document;
  document.activeElement = desktop; dialog.show();
  dialog.close();
  assert.equal(document.activeElement, desktop);
  assert.equal(desktop.focusCount, 1);
  await dialog.close();
  assert.equal(desktop.focusCount, 1);

  const hiddenDesktop = new FakeElement('button'); hiddenDesktop.ownerDocument = document; hiddenDesktop.hidden = null;
  const narrow = setup({ fallback }); fallback.ownerDocument = narrow.document; narrow.document.activeElement = hiddenDesktop;
  hiddenDesktop.hidden = true;
  narrow.dialog.show();
  hiddenDesktop.hidden = true;
  narrow.dialog.close();
  assert.equal(narrow.document.activeElement, fallback, narrow.document.activeElement === hiddenDesktop ? 'hiddenDesktop' : narrow.document.activeElement === fallback ? 'fallback' : 'other');

  fallback.ownerDocument = document;
  const removed = new FakeElement('button'); removed.ownerDocument = document; removed.isConnected = false;
  document.activeElement = removed; dialog.show(); dialog.close();
  assert.equal(document.activeElement, fallback);

  document.activeElement = fallback; dialog.show();
  const before = fallback.focusCount;
  dialog.destroy();
  assert.equal(fallback.focusCount, before);
});






test('save location defaults to connected Orbit, changes folder without losing the draft, and supports standalone', async () => {
  const document = new FakeDocument(); const host = document.createElement('div');
  let location = { connected: false, name: '', mode: 'standalone', supported: true };
  const dialog = createCreateMapDialog({ document, host,
    onSelection: async (selection) => ({ ...preview, tree: { ...preview.tree, name: selection.mapName }, selection }),
    onNameChange: async ({ mapName }) => ({ ...preview, tree: { ...preview.tree, name: mapName } }),
    onCreate: async () => ({ ok: true }), onCancel() {},
    getSaveLocation: () => location,
    onChooseFolder: async () => { location = { connected: true, name: 'Orbit A', mode: 'orbit', supported: true }; return { ok: true }; },
    onSaveElsewhere: () => { location = { ...location, mode: 'standalone' }; },
    onUseOrbit: () => { location = { ...location, mode: 'orbit' }; return { ok: true }; }
  });
  dialog.show();
  const name = findAll(host, (node) => node.tagName === 'INPUT' && node.type === 'text')[0];
  name.value = 'Keep this title'; await name.dispatch('input');
  assert.match(findClass(host, 'create-map-location-note').textContent, /Choose the folder where your maps will be saved\. Map files may not appear in the folder selection window\./);
  assert.equal(findButton(host, 'Choose save location').disabled, false);
  assert.equal(findButton(host, 'Save elsewhere…').disabled, false);
  await findButton(host, 'Choose save location').click();
  assert.equal(findClass(host, 'create-map-location-name').textContent, 'Orbit A');
  assert.equal(findButton(host, 'Change save location').disabled, false);
  assert.equal(findClass(host, 'create-map-location-note').textContent, 'New maps will be saved in this folder.');
  assert.match(findClass(host, 'create-map-status').textContent, /Save location selected: Orbit A\./);
  assert.equal(name.value, 'Keep this title', 'folder change preserves the title');
  await findButton(host, 'Save elsewhere…').click();
  assert.match(findClass(host, 'create-map-location-note').textContent, /standalone file/);
  assert.equal(findButton(host, 'Use connected Orbit').hidden, false);
  await findButton(host, 'Use connected Orbit').click();
  assert.equal(findClass(host, 'create-map-location-name').textContent, 'Orbit A');
  dialog.close();

  const unsupportedHost = document.createElement('div');
  const unsupported = createCreateMapDialog({ document, host: unsupportedHost, onSelection: async () => preview, onCreate: async () => ({ ok: true }), onCancel() {}, getSaveLocation: () => ({ connected: false, name: '', mode: 'standalone', supported: false }) });
  unsupported.show();
  assert.equal(findButton(unsupportedHost, 'Choose save location').disabled, true);
  assert.match(findClass(unsupportedHost, 'create-map-location-note').textContent, /Folder-based saving is not available/);
  unsupported.close();
});
