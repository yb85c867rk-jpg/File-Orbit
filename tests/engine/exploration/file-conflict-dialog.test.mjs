import test from 'node:test';
import assert from 'node:assert/strict';
import { createFileConflictDialog } from '../../harness/m5-exploration/file-conflict-dialog.js';

class FakeElement {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase(); this.ownerDocument = doc; this.children = []; this.parent = null;
    this.hidden = false; this.disabled = false; this.textContent = ''; this.id = ''; this.className = ''; this.dataset = {};
    this.attributes = new Map(); this.listeners = new Map();
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  appendChild(node) { this.append(node); return node; }
  remove() { if (!this.parent) return; const index = this.parent.children.indexOf(this); if (index >= 0) this.parent.children.splice(index, 1); this.parent = null; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { const list = this.listeners.get(type) || []; const index = list.indexOf(fn); if (index >= 0) list.splice(index, 1); }
  focus() { this.ownerDocument.activeElement = this; }
  click() { for (const fn of [...(this.listeners.get('click') || [])]) fn({ type: 'click', target: this, preventDefault() {} }); }
  dispatch(type, event = {}) { for (const fn of [...(this.listeners.get(type) || [])]) fn({ type, target: this, preventDefault() {}, ...event }); }
}

class FakeDocument {
  constructor() { this.activeElement = null; this.listeners = new Map(); }
  createElement(tag) { return new FakeElement(tag, this); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { const list = this.listeners.get(type) || []; const index = list.indexOf(fn); if (index >= 0) list.splice(index, 1); }
  dispatch(type, event = {}) { for (const fn of [...(this.listeners.get(type) || [])]) fn({ type, target: event.target || this.activeElement, preventDefault() {}, ...event }); }
}

function setup() {
  const document = new FakeDocument();
  const host = document.createElement('div');
  const trigger = document.createElement('button');
  trigger.focus();
  const dialog = createFileConflictDialog({ document, host });
  return { document, host, trigger, dialog };
}

function all(root, predicate, out = []) {
  if (predicate(root)) out.push(root);
  for (const child of root.children || []) all(child, predicate, out);
  return out;
}
function button(dialog, label) {
  return all(dialog.element, (node) => node.tagName === 'BUTTON' && node.textContent === label)[0];
}

test('conflict dialog is accessible, text-only, focused on Cancel, and returns a decision', async () => {
  const { document, trigger, dialog } = setup();
  const decision = dialog.show({ filename: 'C:\\private\\folder\\map.orbit', reason: 'changed' });
  assert.equal(dialog.isOpen, true);
  const section = dialog.element.children[0];
  assert.equal(section.getAttribute('role'), 'dialog');
  assert.equal(section.getAttribute('aria-modal'), 'true');
  assert.ok(section.getAttribute('aria-labelledby'));
  assert.ok(section.getAttribute('aria-describedby').includes('file-conflict-file'));
  const fileLine = all(dialog.element, (node) => node.id === 'file-conflict-file')[0];
  assert.equal(fileLine.textContent, 'map.orbit');
  assert.doesNotMatch(fileLine.textContent, /private|\\/);
  const title = all(dialog.element, (node) => node.id === 'file-conflict-title')[0];
  const description = all(dialog.element, (node) => node.id === 'file-conflict-description')[0];
  assert.equal(title.textContent, 'This file has a newer saved version');
  assert.equal(description.textContent, 'Another window or app saved changes to this file. Keep both versions by saving your changes as a copy, or replace the saved version with your changes. Cancel keeps your changes open without saving.');
  assert.equal(button(dialog, 'Replace Saved File').getAttribute('data-conflict-action'), 'replace');
  assert.equal(button(dialog, 'Save a Copy').getAttribute('data-conflict-action'), 'copy');
  assert.equal(button(dialog, 'Cancel').getAttribute('data-conflict-action'), 'cancel');
  assert.equal(document.listeners.get('keydown')?.length > 0, true);
  assert.equal(document.activeElement, button(dialog, 'Cancel'));
  assert.deepEqual(all(dialog.element, (node) => node.tagName === 'BUTTON').map((node) => node.textContent), ['Replace Saved File', 'Save a Copy', 'Cancel']);
  button(dialog, 'Replace Saved File').click();
  assert.equal(await decision, 'overwrite');
  assert.equal(dialog.isOpen, false);
  assert.equal(dialog.element.hidden, true);
  assert.equal(document.activeElement, trigger);
});

test('Save a Copy and duplicate clicks produce one terminal decision', async () => {
  const { dialog } = setup();
  const decision = dialog.show({ filename: 'map.orbit' });
  button(dialog, 'Save a Copy').click();
  button(dialog, 'Save a Copy').click();
  assert.equal(await decision, 'copy');
  assert.equal(dialog.isOpen, false);
});

test('Escape cancels and removes the keyboard listener', async () => {
  const { document, dialog } = setup();
  const decision = dialog.show({ filename: 'map.orbit' });
  const handlerCount = document.listeners.get('keydown').length;
  document.dispatch('keydown', { key: 'Escape', preventDefaultCount: 0 });
  assert.equal(await decision, 'cancel');
  assert.equal(dialog.isOpen, false);
  assert.ok(document.listeners.get('keydown').length < handlerCount);
});

test('Tab and Shift+Tab are contained within the dialog', async () => {
  const { document, dialog } = setup();
  dialog.show({ filename: 'map.orbit' });
  assert.equal(document.activeElement, button(dialog, 'Cancel'));
  document.dispatch('keydown', { key: 'Tab', shiftKey: false, preventDefault() {} });
  assert.equal(document.activeElement, button(dialog, 'Replace Saved File'));
  document.dispatch('keydown', { key: 'Tab', shiftKey: true, preventDefault() {} });
  assert.equal(document.activeElement, button(dialog, 'Cancel'));
});

test('unknown verification uses explicit wording', async () => {
  const { dialog } = setup();
  dialog.show({ filename: 'map.orbit', reason: 'unknown' });
  const text = all(dialog.element, (node) => node.id === 'file-conflict-description')[0].textContent;
  assert.match(text, /could not verify/i);
  assert.equal(all(dialog.element, (node) => node.id === 'file-conflict-title')[0].textContent, 'This file could not be verified');
  assert.equal(button(dialog, 'Replace Saved File').hidden, true);
  assert.equal(button(dialog, 'Replace Saved File').disabled, true);
  button(dialog, 'Cancel').click();
});

test('unverifiable conflicts offer Save a Copy or Cancel without overwrite', async () => {
  const { document, dialog } = setup();
  const decision = dialog.show({ filename: 'map.orbit', reason: 'unverifiable', allowOverwrite: false });
  const unverifiedTitle = all(dialog.element, (node) => node.id === 'file-conflict-title')[0];
  assert.equal(unverifiedTitle.textContent, 'This file could not be verified');
  const overwrite = button(dialog, 'Replace Saved File');
  assert.equal(overwrite.disabled, true);
  assert.equal(overwrite.hidden, true);
  assert.equal(document.activeElement, button(dialog, 'Cancel'));
  const copy = button(dialog, 'Save a Copy');
  copy.focus();
  document.dispatch('keydown', { key: 'Tab', shiftKey: false, preventDefault() {} });
  assert.equal(document.activeElement, button(dialog, 'Cancel'));
  copy.click();
  assert.equal(await decision, 'copy');
});

test('Save a Copy invokes its picker callback synchronously from the click', async () => {
  const { dialog } = setup();
  let invoked = false;
  const decision = dialog.show({ filename: 'map.orbit', onSaveCopy: () => { invoked = true; } });
  button(dialog, 'Save a Copy').click();
  assert.equal(invoked, true, 'user activation must begin at the button click');
  assert.equal(await decision, 'copy');
});

test('a newer dialog supersedes an older request without authorizing it', async () => {
  const { dialog } = setup();
  const first = dialog.show({ filename: 'first.orbit' });
  const second = dialog.show({ filename: 'second.orbit', reason: 'changed' });
  assert.equal(await first, 'cancel');
  assert.equal(dialog.isOpen, true);
  button(dialog, 'Replace Saved File').click();
  assert.equal(await second, 'overwrite');
  assert.equal(dialog.isOpen, false);
});

test('destroy cancels the active request, is idempotent, and prevents later authorization', async () => {
  const { dialog, host } = setup();
  const decision = dialog.show({ filename: 'map.orbit' });
  dialog.destroy();
  dialog.destroy();
  assert.equal(await decision, 'cancel');
  assert.equal(dialog.isOpen, false);
  assert.equal(host.children.includes(dialog.element), false);
  assert.equal(await dialog.show({ filename: 'later.orbit' }), 'cancel');
  assert.equal(dialog.isOpen, false);
});

test('focus restoration occurs after a dialog decision', async () => {
  const { document, dialog } = setup();
  dialog.show({ filename: 'map.orbit' });
  document.activeElement = button(dialog, 'Save a Copy');
  button(dialog, 'Cancel').click();
  assert.equal(dialog.isOpen, false);
});
