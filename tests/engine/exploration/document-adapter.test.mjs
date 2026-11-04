import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentAdapter } from '../../harness/m5-exploration/document-adapter.js';

function fakeDocument() {
  const body = { children: [], append(node) { this.children.push(node); } };
  return {
    body,
    createElement() { return { href: '', download: '', hidden: false, clicked: false, removed: false, click() { this.clicked = true; }, remove() { this.removed = true; } }; }
  };
}

test('writable adapter picks, reads, writes, and confirms close', async () => {
  let closed = 0; const chunks = [];
  const handle = { name: 'doc.orbit', async getFile() { return { name: 'doc.orbit', size: 3, type: 'application/x-orbit' }; }, async createWritable() { return { async write(blob) { chunks.push(blob); }, async close() { closed += 1; } }; } };
  const window = { async showOpenFilePicker() { return [handle]; }, async showSaveFilePicker() { return { ...handle, name: 'new.orbit' }; } };
  const adapter = createDocumentAdapter({ window, document: fakeDocument(), BrowserURL: {} });
  assert.equal(adapter.writableSupported, true);
  const opened = await adapter.pickOpen();
  assert.equal(opened.ok, true); assert.equal(opened.file.name, 'doc.orbit');
  const saved = await adapter.pickSave('suggested.orbit');
  assert.equal(saved.ok, true); assert.equal(saved.handle.name, 'new.orbit');
  const written = await adapter.write(handle, new Blob(['abc']));
  assert.equal(written.ok, true); assert.equal(closed, 1); assert.equal(chunks.length, 1);
});

test('writable adapter distinguishes cancellation, permission denial, and close failure', async () => {
  const abortWindow = { async showOpenFilePicker() { const e = new Error('cancel'); e.name = 'AbortError'; throw e; }, async showSaveFilePicker() { return null; } };
  const deniedWindow = { async showOpenFilePicker() { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; }, async showSaveFilePicker() { return null; } };
  const doc = fakeDocument();
  assert.equal((await createDocumentAdapter({ window: abortWindow, document: doc }).pickOpen()).reason, 'cancelled');
  assert.equal((await createDocumentAdapter({ window: deniedWindow, document: doc }).pickOpen()).reason, 'permission-denied');
  let aborted = 0;
  const handle = { async createWritable() { return { async write() {}, async close() { throw new Error('close failed'); }, async abort() { aborted += 1; } }; } };
  const written = await createDocumentAdapter({ window: deniedWindow, document: doc }).write(handle, new Blob(['x']));
  assert.equal(written.ok, false); assert.equal(written.reason, 'write-failed'); assert.equal(aborted, 1);
});

test('download fallback reports handoff and cleans resources idempotently', () => {
  const doc = fakeDocument(); const revoked = []; let timer = null; let cleared = 0;
  const BrowserURL = { createObjectURL() { return 'blob:doc'; }, revokeObjectURL(url) { revoked.push(url); } };
  const adapter = createDocumentAdapter({ window: {}, document: doc, BrowserURL, setTimeoutFn(fn) { timer = fn; return 1; }, clearTimeoutFn() { cleared += 1; } });
  const handed = adapter.download(new Blob(['x']), 'doc.orbit');
  assert.equal(handed.ok, true); assert.equal(handed.handoff, true);
  assert.equal(doc.body.children.length, 1); assert.equal(doc.body.children[0].clicked, true);
  handed.cleanup(); handed.cleanup();
  assert.equal(cleared, 1); assert.deepEqual(revoked, ['blob:doc']); assert.equal(doc.body.children[0].removed, true);
  timer();
  assert.deepEqual(revoked, ['blob:doc']);
});
test('Save As awaits asynchronous permission and never re-requests granted permission', async () => {
  let requestCalls = 0;
  const handle = { name: 'chosen.orbit', async queryPermission() { return 'granted'; }, async requestPermission() { requestCalls += 1; return 'granted'; } };
  const window = { async showOpenFilePicker() { return [handle]; }, async showSaveFilePicker() { return handle; } };
  const adapter = createDocumentAdapter({ window, document: fakeDocument(), BrowserURL: {} });
  const saved = await adapter.pickSave('test-r80.orbit');
  assert.equal(saved.ok, true); assert.equal(saved.handle, handle); assert.equal(saved.stage, 'ready');
  assert.equal(requestCalls, 0);
});

test('Save As requests permission only when query is not granted and reports permission stages', async () => {
  let requestCalls = 0; let modeSeen = null;
  const grantedHandle = { async queryPermission() { return 'prompt'; }, async requestPermission({ mode }) { requestCalls += 1; modeSeen = mode; return 'granted'; } };
  const deniedHandle = { async queryPermission() { return 'prompt'; }, async requestPermission() { return 'denied'; } };
  const adapters = (handle) => createDocumentAdapter({ window: { async showOpenFilePicker() { return [handle]; }, async showSaveFilePicker() { return handle; } }, document: fakeDocument(), BrowserURL: {} });
  assert.equal((await adapters(grantedHandle).pickSave('a.orbit')).ok, true);
  assert.equal(requestCalls, 1); assert.equal(modeSeen, 'readwrite');
  const denied = await adapters(deniedHandle).pickSave('a.orbit');
  assert.equal(denied.ok, false); assert.equal(denied.reason, 'permission-denied'); assert.equal(denied.stage, 'permission-request');
});

test('picker AbortError and permission-stage AbortError retain distinct stages', async () => {
  const pickerAbort = { async showOpenFilePicker() { const e = new Error('picker aborted'); e.name = 'AbortError'; throw e; }, async showSaveFilePicker() { const e = new Error('picker aborted'); e.name = 'AbortError'; throw e; } };
  const permissionAbort = { async showOpenFilePicker() { return [{ async queryPermission() { const e = new Error('permission aborted'); e.name = 'AbortError'; throw e; }, async requestPermission() { return 'granted'; } }]; }, async showSaveFilePicker() { return { async queryPermission() { const e = new Error('permission aborted'); e.name = 'AbortError'; throw e; }, async requestPermission() { return 'granted'; } }; } };
  const picker = await createDocumentAdapter({ window: pickerAbort, document: fakeDocument(), BrowserURL: {} }).pickSave('a.orbit');
  const permission = await createDocumentAdapter({ window: permissionAbort, document: fakeDocument(), BrowserURL: {} }).pickSave('a.orbit');
  assert.equal(picker.reason, 'cancelled'); assert.equal(picker.stage, 'picker');
  assert.equal(permission.reason, 'cancelled'); assert.equal(permission.stage, 'permission-query');
  assert.equal(picker.errorName, 'AbortError'); assert.equal(permission.errorName, 'AbortError');
});

test('write failure reports the create/write/close stage that failed', async () => {
  const adapter = createDocumentAdapter({ window: { async showOpenFilePicker() { return []; }, async showSaveFilePicker() { return null; } }, document: fakeDocument(), BrowserURL: {} });
  const createFail = await adapter.write({ async createWritable() { throw new Error('create failed'); } }, new Blob(['x']));
  assert.equal(createFail.reason, 'write-failed'); assert.equal(createFail.stage, 'createWritable');
  const writeFail = await adapter.write({ async createWritable() { return { async write() { throw new Error('write failed'); }, async close() {}, async abort() {} }; } }, new Blob(['x']));
  assert.equal(writeFail.stage, 'write');
  const closeFail = await adapter.write({ async createWritable() { return { async write() {}, async close() { throw new Error('close failed'); }, async abort() {} }; } }, new Blob(['x']));
  assert.equal(closeFail.stage, 'close');
});


test('picker types expose .orbit only and never legacy extensions', async () => {
  let openOptions = null; let saveOptions = null;
  const handle = { async getFile() { return { name: 'a.orbit', size: 1, type: 'application/x-orbit' }; }, async createWritable() { return { async write() {}, async close() {}, async abort() {} }; } };
  const adapter = createDocumentAdapter({ window: {
    async showOpenFilePicker(options) { openOptions = options; return [handle]; },
    async showSaveFilePicker(options) { saveOptions = options; return handle; }
  }, document: fakeDocument(), BrowserURL: {} });
  await adapter.pickOpen(); await adapter.pickSave('a.orbit');
  assert.equal(openOptions.types[0].description, 'Orbit files (*.orbit)');
  assert.equal(saveOptions.types[0].description, 'Orbit files (*.orbit)');
  assert.deepEqual(openOptions.types[0].accept['application/x-orbit'], ['.orbit']);
  assert.deepEqual(saveOptions.types[0].accept['application/x-orbit'], ['.orbit']);
  assert.equal(openOptions.multiple, false);
  assert.equal(JSON.stringify({ openOptions, saveOptions }).includes('.map'), false);
  assert.equal(JSON.stringify({ openOptions, saveOptions }).includes('.fileorbit'), false);
});
