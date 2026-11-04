import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorController } from '../../../src/engine/hypertree/editor/index.js';
import { createEditorPanel } from '../../harness/m5-exploration/editor-panel.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';

class FakeElement extends EventTarget {
  constructor(tag, document) {
    super();
    this.tagName = tag;
    this.ownerDocument = document;
    this.children = [];
    this.attributes = new Map();
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.readOnly = false;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.selectionDirection = 'none';
    this.parentNode = null;
  }
  append(...values) { for (const value of values) { this.children.push(value); if (value && typeof value === 'object') value.parentNode = this; } }
  appendChild(value) { this.append(value); return value; }
  removeChild(value) { this.children = this.children.filter((item) => item !== value); }
  replaceChildren(...values) { this.children = []; this.append(...values); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  focus() { this.ownerDocument.activeElement = this; }
  select() { this.selected = true; }
}
class FakeDocument {
  constructor() { this.activeElement = null; }
  createElement(tag) { return new FakeElement(tag, this); }
}
function details(id = 'a', name = 'Alpha') {
  return { id, name, kind: 'file', directChildCount: 0, descendantCount: 0, displayPath: `Root / ${name}` };
}
function setup(onSave = () => ({ ok: true }), identity = { datasetToken: 1, baseRevision: 3 }, registryOptions = {}) {
  const document = new FakeDocument();
  const summaryHost = document.createElement('div');
  const editorHost = document.createElement('div');
  const controller = createEditorController();
  const attachments = createAttachmentRegistry({ datasetToken: 1, ...registryOptions });
  const discarded = [];
  const panel = createEditorPanel({
    document, summaryHost, editorHost, controller,
    onSave,
    attachments,
    getIdentity: () => identity,
    onDiscardIntent: (intent) => discarded.push(intent)
  });
  return { document, summaryHost, editorHost, controller, panel, discarded, identity, attachments };
}
function keydown(key) {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'key', { value: key });
  Object.defineProperty(event, 'isComposing', { value: false });
  return event;
}
test('rename form retains input identity, focus, selection, and IME composition', () => {
  let saves = 0;
  const s = setup(() => { saves += 1; return { ok: true }; });
  s.panel.setDetails(details());
  s.panel.openEditor(s.panel.getDetails());
  const input = s.panel.input;
  assert.equal(s.document.activeElement, input);
  input.selectionStart = 2;
  input.selectionEnd = 5;
  s.panel.setDetails(details());
  assert.equal(s.panel.input, input);
  assert.equal(s.document.activeElement, input);
  assert.equal(input.selectionStart, 2);
  assert.equal(input.selectionEnd, 5);

  s.panel.input.dispatchEvent(new Event('compositionstart'));
  input.value = '김';
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(keydown('Enter'));
  assert.equal(saves, 0);
  assert.equal(input.value, '김');
  s.panel.input.dispatchEvent(new Event('compositionend'));
  input.value = '김철수';
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(keydown('Enter'));
  assert.equal(saves, 1);
  assert.equal(s.panel.form.hidden, true);
  assert.equal(s.document.activeElement, s.panel.summary);
});

test('validation/installation failure retains draft and shows inline error', () => {
  const s = setup(() => ({ ok: false, message: 'duplicate name' }));
  s.panel.setDetails(details());
  s.panel.openEditor(s.panel.getDetails());
  s.panel.input.value = 'Beta';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.input.dispatchEvent(keydown('Enter'));
  assert.equal(s.panel.form.hidden, false);
  assert.equal(s.panel.input.value, 'Beta');
  assert.equal(s.controller.draftName, 'Beta');
  assert.equal(s.controller.error, 'duplicate name');
  assert.equal(s.document.activeElement, s.panel.input);
});

test('dirty prompt Continue keeps draft and Discard emits semantic intent once', () => {
  const s = setup();
  s.panel.setDetails(details());
  s.panel.openEditor(s.panel.getDetails());
  s.panel.input.value = 'Beta';
  s.panel.input.dispatchEvent(new Event('input'));
  const intent = { kind: 'folder-enter', targetId: 'b', datasetToken: 2, baseRevision: 4, hitKind: 'folder' };
  s.panel.requestSelection(intent);
  assert.equal(s.panel.prompt.hidden, false);
  assert.equal(s.panel.form.hidden, false);
  const continueButton = s.panel.prompt.children[1].children[0];
  continueButton.dispatchEvent(new Event('click'));
  assert.equal(s.panel.prompt.hidden, true);
  assert.equal(s.controller.draftName, 'Beta');
  assert.equal(s.discarded.length, 0);

  s.panel.requestSelection(intent);
  const discardButton = s.panel.prompt.children[1].children[1];
  discardButton.dispatchEvent(new Event('click'));
  assert.deepEqual(s.discarded, [intent]);
  assert.equal(s.panel.form.hidden, true);
  assert.equal(s.panel.prompt.hidden, true);
});

test('selection publication does not replace an explicit editor target', () => {
  const s = setup();
  s.panel.setDetails(details('a'));
  s.panel.openEditor(s.panel.getDetails());
  s.panel.setDetails(details('b', 'Beta'));
  assert.equal(s.panel.form.hidden, false);
  assert.equal(s.controller.targetId, 'a');
  s.panel.input.value = 'Changed';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.setDetails(details('c', 'Gamma'));
  assert.equal(s.panel.form.hidden, false);
  assert.equal(s.controller.targetId, 'a');
  assert.equal(s.controller.draftName, 'Changed');
});

test('Escape cancels without submitting', () => {
  let saves = 0;
  const s = setup(() => { saves += 1; return { ok: true }; });
  s.panel.setDetails(details());
  s.panel.openEditor(s.panel.getDetails());
  s.panel.input.dispatchEvent(keydown('Escape'));
  assert.equal(saves, 0);
  assert.equal(s.panel.form.hidden, true);
  assert.equal(s.document.activeElement, s.panel.summary);
});
test('destroy clears form, prompt, controller, and owned listeners', () => {
  const s = setup();
  s.panel.setDetails(details());
  s.panel.openEditor(s.panel.getDetails());
  s.panel.input.value = 'Beta';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.destroy();
  assert.equal(s.controller.mode, 'closed');
  assert.equal(s.summaryHost.children.length, 0);
  assert.equal(s.editorHost.children.length, 0);
});
test('reopening Rename while dirty or confirming does not reset draft or intent', () => {
  const s = setup();
  s.panel.setDetails(details());
  s.panel.openEditor(s.panel.getDetails());
  s.panel.input.value = 'Beta';
  s.panel.input.dispatchEvent(new Event('input'));
  assert.equal(s.controller.isOpen(), true);
  s.panel.openEditor(s.panel.getDetails());
  assert.equal(s.controller.draftName, 'Beta');
  assert.equal(s.controller.targetId, 'a');
  const intent = { kind: 'folder-enter', targetId: 'b', datasetToken: 1, baseRevision: 3, hitKind: 'folder' };
  s.panel.requestSelection(intent);
  s.panel.openEditor(s.panel.getDetails());
  assert.equal(s.controller.mode, 'confirm-replace');
  assert.deepEqual(s.controller.pendingIntent, intent);
  assert.equal(s.controller.draftName, 'Beta');
  assert.equal(s.panel.prompt.hidden, false);
  assert.equal(s.panel.form.hidden, false);
});

test('Save receives identity captured at open, not the later current identity', () => {
  const payloads = [];
  const s = setup((value) => { payloads.push(value); return { ok: false, message: 'stale' }; });
  s.panel.setDetails(details());
  s.panel.openEditor(s.panel.getDetails());
  s.identity.datasetToken = 2;
  s.identity.baseRevision = 8;
  s.panel.input.value = 'Beta';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.input.dispatchEvent(keydown('Enter'));
  assert.deepEqual(payloads, [{ action: 'rename', name: 'Beta', targetId: 'a', description: null, dataType: null, link: null, linkProvided: false, file: null, classification: null, attachmentId: null, originalName: null, sizeBytes: null, mime: null, datasetToken: 1, baseRevision: 3, formToken: 1 }]);
  assert.equal(s.controller.draftName, 'Beta');
  assert.equal(s.controller.error, 'stale');
});
test('explicit editor target is independent of selected details and saves that target', () => {
  const payloads = [];
  const s = setup((value) => { payloads.push(value); return { ok: true }; });
  s.panel.setDetails(details('a', 'Alpha'));
  const opened = s.panel.openEditor(details('b', 'Beta'), { datasetToken: 1, baseRevision: 3 });
  assert.equal(opened.ok, true);
  assert.equal(s.controller.targetId, 'b');
  assert.equal(s.panel.getEditorTarget().id, 'b');
  assert.match(s.panel.getTargetLabel(), /Beta/);
  s.panel.input.value = 'Beta renamed';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.input.dispatchEvent(keydown('Enter'));
  assert.deepEqual(payloads, [{ action: 'rename', name: 'Beta renamed', targetId: 'b', description: null, dataType: null, link: null, linkProvided: false, file: null, classification: null, attachmentId: null, originalName: null, sizeBytes: null, mime: null, datasetToken: 1, baseRevision: 3, formToken: 1 }]);
});

test('right-click target replacement is blocked while dirty and usable via pending intent', () => {
  const s = setup();
  s.panel.setDetails(details('a', 'Alpha'));
  s.panel.openEditor(details('a', 'Alpha'));
  s.panel.input.value = 'Changed';
  s.panel.input.dispatchEvent(new Event('input'));
  assert.equal(s.panel.openEditor(details('b', 'Beta')).blocked, true);
  assert.equal(s.controller.targetId, 'a');
  assert.equal(s.controller.draftName, 'Changed');
  const intent = { kind: 'editor-target', targetId: 'b', datasetToken: 1, baseRevision: 3, hitKind: 'file' };
  s.panel.requestSelection(intent);
  assert.equal(s.panel.prompt.hidden, false);
  const discard = s.panel.prompt.children[1].children[1];
  discard.dispatchEvent(new Event('click'));
  assert.deepEqual(s.discarded, [intent]);
  assert.equal(s.panel.form.hidden, true);
});
test('add folder form sends parent and name only', () => {
  let payload = null;
  const s = setup((value) => { payload = value; return { ok: true }; });
  const parent = { ...details('r', 'Root'), kind: 'folder' };
  s.panel.setDetails(parent);
  assert.equal(s.panel.openAdd(parent, 'folder').ok, true);
  assert.equal(s.panel.form.hidden, false);
  assert.equal(s.panel.getFieldValue('name'), '');
  s.panel.input.value = 'New folder';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(payload.action, 'add-folder');
  assert.equal(payload.targetId, 'r');
  assert.equal(payload.name, 'New folder');
  assert.equal(payload.description, null);
  assert.equal(payload.link, null);
});
test('add data form preserves multiline description and uses Ctrl+Enter', () => {
  let payload = null;
  const s = setup((value) => { payload = value; return { ok: true }; });
  const parent = { ...details('r', 'Root'), kind: 'folder' };
  s.panel.openAdd(parent, 'file');
  s.panel.input.value = 'New data';
  s.panel.input.dispatchEvent(new Event('input'));
  const description = s.panel.getFieldValue('description');
  assert.equal(description, '');
  const textarea = s.panel.descriptionInput;
  assert.ok(textarea);
  textarea.value = 'line one\nline two';
  textarea.dispatchEvent(new Event('input'));
  textarea.dispatchEvent(keydown('Enter'));
  assert.equal(payload, null);
  const ctrl = keydown('Enter');
  Object.defineProperty(ctrl, 'ctrlKey', { value: true });
  textarea.dispatchEvent(ctrl);
  assert.equal(payload.action, 'add-data');
  assert.equal(payload.description, 'line one\nline two');
});
test('edit details hides name and edits only description/link', () => {
  let payload = null;
  const s = setup((value) => { payload = value; return { ok: true }; });
  const data = { ...details('x', 'Data'), kind: 'file', description: 'old text', link: 'https://example.com/old' };
  s.panel.setDetails(data);
  assert.equal(s.panel.openDetails(data).ok, true);
  assert.equal(s.panel.isFieldVisible('name'), false);
  assert.equal(s.panel.isFieldVisible('description'), true);
  assert.equal(s.panel.isFieldVisible('link'), true);
  assert.equal(s.panel.getFieldValue('description'), 'old text');
  assert.equal(s.panel.getFieldValue('link'), 'https://example.com/old');
  const description = s.panel.getFieldValue('description');
  s.panel.getFieldValue('link');
  const descInput = s.panel.descriptionInput;
  descInput.value = 'new text';
  descInput.dispatchEvent(new Event('input'));
  const linkInput = s.panel.linkInput;
  linkInput.value = 'https://example.com/new';
  linkInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(payload.action, 'edit-details');
  assert.equal(payload.name, 'Data');
  assert.equal(payload.description, 'new text');
});
test('unchanged metadata no-op closes without reporting a revision', () => {
  let payload = null;
  const s = setup((value) => { payload = value; return { ok: true, noop: true, reason: 'noop' }; });
  const data = { ...details('x', 'Data'), kind: 'file', description: 'same', link: null };
  s.panel.openDetails(data);
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(payload.action, 'edit-details');
  assert.equal(payload.description, 'same');
  assert.equal(s.controller.mode, 'closed');
  assert.equal(s.panel.form.hidden, true);
});
test('folder creation exposes name only and submits no data fields', () => {
  let payload = null;
  const s = setup((value) => { payload = value; return { ok: true }; });
  const parent = { ...details('r', 'Root'), kind: 'folder' };
  s.panel.openAdd(parent, 'folder');
  assert.equal(s.panel.isFieldVisible('name'), true);
  assert.equal(s.panel.isFieldVisible('description'), true);
  assert.equal(s.panel.isFieldVisible('dataType'), false);
  assert.equal(s.panel.isFieldVisible('file'), false);
  assert.equal(s.panel.isFieldVisible('link'), false);
  s.panel.input.value = 'Folder';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(payload.action, 'add-folder');
  assert.equal(payload.dataType, null);
  assert.equal(payload.file, null);
  assert.equal(payload.link, null);
});
test('data creation requires a type and excludes inactive fields', () => {
  let payload = null;
  const s = setup((value) => { payload = value; return { ok: true }; });
  const parent = { ...details('r', 'Root'), kind: 'folder' };
  s.panel.openAdd(parent, 'file');
  assert.equal(s.panel.isFieldVisible('dataType'), true);
  assert.equal(s.panel.isFieldVisible('file'), false);
  assert.equal(s.panel.isFieldVisible('link'), false);
  s.panel.input.value = 'Link';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.descriptionInput.value = 'Body';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  s.panel.dataTypeInput.value = 'web-link';
  s.panel.dataTypeInput.dispatchEvent(new Event('change'));
  assert.equal(s.panel.isFieldVisible('file'), false);
  assert.equal(s.panel.isFieldVisible('link'), true);
  s.panel.linkInput.value = 'https://example.com/a';
  s.panel.linkInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(payload.dataType, 'web-link');
  assert.equal(payload.link, 'https://example.com/a');
  assert.equal(payload.file, null);
  assert.equal(payload.classification, null);
});
test('file creation classifies asynchronously and submits the latest file', async () => {
  let payload = null;
  const s = setup((value) => { payload = value; return { ok: true }; });
  const parent = { ...details('r', 'Root'), kind: 'folder' };
  s.panel.openAdd(parent, 'file');
  s.panel.dataTypeInput.value = 'file';
  s.panel.dataTypeInput.dispatchEvent(new Event('change'));
  s.panel.input.value = 'File item';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.descriptionInput.value = 'Body';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  const file = {
    name: 'A.md', size: 20, type: 'text/markdown',
    slice: () => ({ arrayBuffer: async () => new TextEncoder().encode('# A').buffer })
  };
  s.panel.fileInput.files = [file];
  s.panel.fileInput.dispatchEvent(new Event('change'));
  assert.equal(s.panel.saveButton.disabled, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(s.panel.saveButton.disabled, false);
  assert.match(s.panel.getAttachmentText(), /A\.md/);
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(payload.action, 'add-data');
  assert.equal(payload.dataType, 'file');
  assert.equal(payload.file, file);
  assert.equal(payload.classification.format, 'markdown');
});
test('stale file classification cannot replace the latest selection', async () => {
  const s = setup(() => ({ ok: true }));
  const parent = { ...details('r', 'Root'), kind: 'folder' };
  s.panel.openAdd(parent, 'file');
  s.panel.dataTypeInput.value = 'file';
  s.panel.dataTypeInput.dispatchEvent(new Event('change'));
  const slow = { name: 'slow.md', size: 10, type: 'text/markdown', slice: () => ({ arrayBuffer: () => new Promise((resolve) => setTimeout(() => resolve(new TextEncoder().encode('# slow').buffer), 25)) }) };
  const fast = { name: 'fast.txt', size: 10, type: 'text/plain', slice: () => ({ arrayBuffer: async () => new TextEncoder().encode('fast').buffer }) };
  s.panel.fileInput.files = [slow];
  s.panel.fileInput.dispatchEvent(new Event('change'));
  s.panel.fileInput.files = [fast];
  s.panel.fileInput.dispatchEvent(new Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.match(s.panel.getAttachmentText(), /fast\.txt/);
  assert.doesNotMatch(s.panel.getAttachmentText(), /slow/);
});
test('file read failure keeps save disabled with a reviewable error', async () => {
  const s = setup(() => ({ ok: true }));
  const parent = { ...details('r', 'Root'), kind: 'folder' };
  s.panel.openAdd(parent, 'file');
  s.panel.dataTypeInput.value = 'file';
  s.panel.dataTypeInput.dispatchEvent(new Event('change'));
  const bad = { name: 'bad.pdf', size: 10, type: 'application/pdf', slice: () => ({ arrayBuffer: async () => { throw new Error('read'); } }) };
  s.panel.fileInput.files = [bad];
  s.panel.fileInput.dispatchEvent(new Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(s.panel.getAttachmentText(), /could not be read/);
  assert.equal(s.attachments.size, 0);
  assert.equal(s.attachments.totalBytes, 0);
  assert.equal(s.panel.saveButton.disabled, true);
});
test('type switch and cancel invalidate pending file classification', async () => {
  const s = setup(() => ({ ok: true }));
  const parent = { ...details('r', 'Root'), kind: 'folder' };
  s.panel.openAdd(parent, 'file');
  s.panel.dataTypeInput.value = 'file';
  s.panel.dataTypeInput.dispatchEvent(new Event('change'));
  const slow = { name: 'slow.md', size: 10, type: 'text/markdown', slice: () => ({ arrayBuffer: () => new Promise((resolve) => setTimeout(() => resolve(new TextEncoder().encode('# slow').buffer), 20)) }) };
  s.panel.fileInput.files = [slow];
  s.panel.fileInput.dispatchEvent(new Event('change'));
  s.panel.dataTypeInput.value = 'web-link';
  s.panel.dataTypeInput.dispatchEvent(new Event('change'));
  assert.equal(s.panel.isFieldVisible('file'), false);
  assert.equal(s.panel.isFieldVisible('link'), true);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.doesNotMatch(s.panel.getAttachmentText(), /slow/);
  s.panel.input.value = 'Cancelled';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.input.dispatchEvent(keydown('Escape'));
  assert.equal(s.panel.form.hidden, true);
  assert.equal(s.controller.mode, 'closed');
});
test('file edit details shows read-only attachment and submits description only', () => {
  let payload = null;
  const s = setup((value) => { payload = value; return { ok: true }; });
  const data = {
    ...details('x', 'File item'), kind: 'file', dataType: 'file', description: 'old',
    attachment: { attachmentId: 'att-1', originalName: 'A.md', sizeBytes: 5, mime: 'text/markdown', classification: { format: 'markdown', badge: 'MD', needsReview: false } }
  };
  s.panel.openEditData(data);
  assert.equal(s.panel.isFieldVisible('name'), true);
  assert.equal(s.panel.isFieldVisible('file'), false);
  assert.equal(s.panel.isFieldVisible('link'), false);
  assert.equal(s.panel.isFieldVisible('dataType'), false);
  assert.match(s.panel.getAttachmentText(), /A\.md/);
  s.panel.descriptionInput.value = 'new';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(payload.action, 'edit-data');
  assert.equal(payload.linkProvided, false);
  assert.equal(payload.file, null);
  assert.equal(payload.description, 'new');
});
test('pending reservation honors committed total and rejects without retaining file', async () => {
  const s = setup(() => ({ ok: true }), undefined, { maxTotalBytes: 100 });
  const committed = s.attachments.reserve({ name: 'committed.bin', size: 60, type: '' });
  assert.equal(committed.ok, true);
  s.attachments.setClassification(committed.id, { format: 'generic', badge: 'BIN', needsReview: false });
  s.attachments.commit(committed.id);
  const parent = { ...details('r', 'Root'), kind: 'folder' };
  s.panel.openAdd(parent, 'file');
  s.panel.dataTypeInput.value = 'file';
  s.panel.dataTypeInput.dispatchEvent(new Event('change'));
  const file = { name: 'too-big-for-total.txt', size: 50, type: 'text/plain', slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }) };
  s.panel.fileInput.files = [file];
  s.panel.fileInput.dispatchEvent(new Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(s.attachments.totalBytes, 60);
  assert.equal(s.attachments.size, 1);
  assert.equal(s.panel.fileInput.value, '');
  assert.match(s.panel.getAttachmentText(), /limited to 100 bytes/);
  assert.equal(s.panel.saveButton.disabled, true);
});
test('replacing and cancelling pending files releases the previous reservation', () => {
  const s = setup(() => ({ ok: true }), undefined, { maxTotalBytes: 100 });
  const parent = { ...details('r', 'Root'), kind: 'folder' };
  s.panel.openAdd(parent, 'file');
  s.panel.dataTypeInput.value = 'file';
  s.panel.dataTypeInput.dispatchEvent(new Event('change'));
  const first = { name: 'a.txt', size: 30, type: 'text/plain' };
  s.panel.fileInput.files = [first];
  s.panel.fileInput.dispatchEvent(new Event('change'));
  assert.equal(s.attachments.totalBytes, 30);
  const second = { name: 'b.txt', size: 40, type: 'text/plain' };
  s.panel.fileInput.files = [second];
  s.panel.fileInput.dispatchEvent(new Event('change'));
  assert.equal(s.attachments.size, 1);
  assert.equal(s.attachments.totalBytes, 40);
  s.panel.dataTypeInput.value = 'web-link';
  s.panel.dataTypeInput.dispatchEvent(new Event('change'));
  assert.equal(s.attachments.size, 0);
  assert.equal(s.attachments.totalBytes, 0);
  s.panel.dataTypeInput.value = 'file';
  s.panel.dataTypeInput.dispatchEvent(new Event('change'));
  s.panel.fileInput.files = [{ name: 'c.txt', size: 20, type: 'text/plain' }];
  s.panel.fileInput.dispatchEvent(new Event('change'));
  assert.equal(s.attachments.totalBytes, 20);
  s.panel.input.dispatchEvent(keydown('Escape'));
  assert.equal(s.attachments.size, 0);
  assert.equal(s.attachments.totalBytes, 0);
});
test('Edit Folder shows only name/description with existing values', () => {
  const s = setup(() => ({ ok: true }));
  const folder = { ...details('a', 'Alpha'), kind: 'folder', description: 'Existing description' };
  s.panel.openEditFolder(folder);
  assert.equal(s.panel.getFieldValue('name'), 'Alpha');
  assert.equal(s.panel.getFieldValue('description'), 'Existing description');
  assert.equal(s.panel.isFieldVisible('dataType'), false);
  assert.equal(s.panel.isFieldVisible('file'), false);
  assert.equal(s.panel.isFieldVisible('link'), false);
});
test('Add Folder starts blank and exposes description', () => {
  const s = setup(() => ({ ok: true }));
  const parent = { ...details('r', 'Root'), kind: 'folder' };
  s.panel.openAdd(parent, 'folder');
  assert.equal(s.panel.getFieldValue('name'), '');
  assert.equal(s.panel.getFieldValue('description'), '');
  assert.equal(s.panel.isFieldVisible('description'), true);
  assert.equal(s.panel.isFieldVisible('file'), false);
});
test('Edit Data hides file picker and supports web and legacy forms', () => {
  const s = setup(() => ({ ok: true }));
  const file = { ...details('x', 'File'), kind: 'file', dataType: 'file', description: 'desc', attachment: { attachmentId: 'att', originalName: 'A.md', sizeBytes: 3, classification: { format: 'markdown', badge: 'MD' } } };
  s.panel.openEditData(file);
  assert.equal(s.panel.isFieldVisible('name'), true);
  assert.equal(s.panel.isFieldVisible('description'), true);
  assert.equal(s.panel.isFieldVisible('file'), false);
  assert.equal(s.panel.isFieldVisible('link'), false);
  assert.equal(s.panel.getFieldValue('name'), 'File');
  s.panel.input.dispatchEvent(keydown('Escape'));
  const web = { ...details('w', 'Web'), kind: 'file', dataType: 'web-link', description: 'web', link: 'https://example.com' };
  s.panel.openEditData(web);
  assert.equal(s.panel.isFieldVisible('link'), true);
  assert.equal(s.panel.isFieldVisible('file'), false);
  assert.equal(s.panel.getFieldValue('link'), 'https://example.com');
  s.panel.input.dispatchEvent(keydown('Escape'));
  const legacy = { ...details('l', 'Legacy'), kind: 'file', dataType: 'legacy', description: 'legacy', link: '' };
  s.panel.openEditData(legacy);
  assert.equal(s.panel.isFieldVisible('link'), false);
  assert.equal(s.panel.isFieldVisible('file'), false);
});test('legacy Edit Data omits hidden link from editable submission', () => {
  let payload = null;
  const s = setup((value) => { payload = value; return { ok: true }; });
  const legacy = { ...details('l', 'Legacy'), kind: 'file', dataType: 'legacy', description: 'legacy', link: 'https://keep.example/a' };
  s.panel.openEditData(legacy);
  s.panel.linkInput.value = 'https://changed.example';
  s.panel.linkInput.dispatchEvent(new Event('input'));
  s.panel.descriptionInput.value = 'changed description';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(payload.action, 'edit-data');
  assert.equal(payload.link, null);
  assert.equal(payload.linkProvided, false);
  assert.equal(payload.description, 'changed description');
});test('read-only details show only human-facing fields and hide empty rows', () => {
  const s = setup(() => ({ ok: true }));
  const folder = { ...details('a', 'Alpha'), kind: 'folder', description: 'Body', directChildCount: 4, descendantCount: 9, displayPath: 'Root / Alpha', dataType: 'legacy' };
  s.panel.setDetails(folder);
  const text = s.summaryHost.textContent;
  assert.equal(s.panel.getSummaryValue('Name'), 'Alpha');
  assert.equal(s.panel.getSummaryValue('Description'), 'Body');
  for (const removed of ['Kind', 'Stable ID', 'Direct children', 'Descendants', 'Display path', 'Data type']) {
    assert.equal(s.panel.getSummaryValue(removed), null, removed);
  }
  const attachment = { ...details('x', 'File'), kind: 'file', dataType: 'file', attachment: { originalName: 'A.md', sizeBytes: 5, classification: { format: 'markdown', badge: 'MD' } } };
  s.panel.setDetails(attachment);
  assert.match(s.panel.getSummaryValue('Attachment'), /A\.md/);
  assert.equal(s.panel.getSummaryValue('Kind'), null);
});


test('Delete intent uses Continue/Discard and is emitted once with captured identity', () => {
  const s = setup();
  s.panel.setDetails(details());
  s.panel.openEditor(s.panel.getDetails());
  s.panel.input.value = 'Beta';
  s.panel.input.dispatchEvent(new Event('input'));
  const intent = { kind: 'delete-request', target: { id: 'a', name: 'Alpha', kind: 'folder' }, action: 'delete-folder', datasetToken: 2, baseRevision: 4 };
  const first = s.panel.requestSelection(intent);
  assert.equal(first.blocked, true);
  const continueButton = s.panel.prompt.children[1].children[0];
  continueButton.dispatchEvent(new Event('click'));
  assert.equal(s.controller.draftName, 'Beta');
  assert.equal(s.discarded.length, 0);
  s.panel.requestSelection(intent);
  const discardButton = s.panel.prompt.children[1].children[1];
  discardButton.dispatchEvent(new Event('click'));
  assert.equal(s.discarded.length, 1);
  assert.equal(s.discarded[0], intent);
  assert.equal(s.discarded[0].datasetToken, 2);
  assert.equal(s.discarded[0].baseRevision, 4);
});

