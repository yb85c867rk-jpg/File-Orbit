import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttachmentViewer, resolveAttachmentViewerTarget, PREVIEW_TEXT_LIMIT_BYTES } from '../../../src/engine/hypertree/editor/attachment-viewer.js';
import { viewerBlocksInteraction, canApplyViewerGuardedCamera } from '../../../src/engine/hypertree/editor/viewer-guards.js';

class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.attributes = new Map(); this.hidden = false; this._text = ''; this.listeners = new Map(); this.parentNode = null; }
  set textContent(value) { this._text = String(value); }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...children) { for (const child of children) this.appendChild(child); }
  removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; return child; }
  replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(handler); }
  focus() { this.focused = true; if (this.ownerDocument) this.ownerDocument.activeElement = this; }
}
function fakeDocument() {
  const document = { activeElement: null, body: new El('body'), listeners: [], createElement(tag) { const el = new El(tag); el.ownerDocument = document; return el; }, addEventListener(type, handler) { document.listeners.push({ type, handler }); } };
  return document;
}
function registryFor(file, classification, mime = file.type) {
  const id = 'att-1';
  return { id, registry: { get: (key) => key === id ? { id, file, name: file.name, metadata: { attachmentId: id, mime, classification } } : null } };
}
function detailsFor(id, file, classification) {
  return { id: 'n', name: 'File', attachment: { attachmentId: id, originalName: file.name, sizeBytes: file.size, mime: file.type, classification } };
}
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
function mockUrls() {
  const created = []; const revoked = [];
  URL.createObjectURL = (blob) => { const url = `blob:test-${created.length + 1}`; created.push({ url, blob }); return url; };
  URL.revokeObjectURL = (url) => revoked.push(url);
  return { created, revoked, restore() { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; } };
}
test('eligibility resolves PDF, text, Markdown, images, missing and conflicting formats', async () => {
  const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
  const pdfReg = registryFor(pdf, { format: 'pdf' });
  assert.equal((await resolveAttachmentViewerTarget({ details: detailsFor(pdfReg.id, pdf, { format: 'pdf' }), registry: pdfReg.registry })).kind, 'pdf');
  const txt = new Blob(['hello'], { type: 'text/plain' });
  const txtReg = registryFor(txt, { format: 'text' });
  assert.equal((await resolveAttachmentViewerTarget({ details: detailsFor(txtReg.id, txt, { format: 'text' }), registry: txtReg.registry })).kind, 'text');
  const md = new Blob(['# hi'], { type: 'text/markdown' });
  const mdReg = registryFor(md, { format: 'markdown' });
  assert.equal((await resolveAttachmentViewerTarget({ details: detailsFor(mdReg.id, md, { format: 'markdown' }), registry: mdReg.registry })).kind, 'markdown');
  const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' });
  const pngReg = registryFor(png, { format: 'generic' });
  assert.equal((await resolveAttachmentViewerTarget({ details: detailsFor(pngReg.id, png, { format: 'generic' }), registry: pngReg.registry })).kind, 'image');
  const unknown = new Blob(['<svg/>'], { type: 'image/svg+xml' });
  const unknownReg = registryFor(unknown, { format: 'generic' });
  assert.equal((await resolveAttachmentViewerTarget({ details: detailsFor(unknownReg.id, unknown, { format: 'generic' }), registry: unknownReg.registry })).state, 'unsupported');
  assert.equal((await resolveAttachmentViewerTarget({ details: detailsFor('missing', txt, { format: 'text' }), registry: { get: () => null } })).state, 'unavailable');
  const conflictReg = registryFor(txt, { format: 'pdf' });
  assert.equal((await resolveAttachmentViewerTarget({ details: detailsFor(conflictReg.id, txt, { format: 'text' }), registry: conflictReg.registry })).state, 'review');
});
test('viewer renders PDF frame/fallback and revokes URLs on destroy', async () => {
  const urls = mockUrls();
  const doc = fakeDocument(); const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
  const { id, registry } = registryFor(pdf, { format: 'pdf' });
  const viewer = createAttachmentViewer({ document: doc, host: doc.body });
  await viewer.open({ details: detailsFor(id, pdf, { format: 'pdf' }), registry });
  assert.equal(viewer.urls.length, 1);
  const body = viewer.element.children[0].children[3];
  assert.equal(body.children[0].tagName, 'iframe');
  assert.equal(body.children[0].src, viewer.urls[0].url);
  assert.equal(body.children[1].textContent, 'Open PDF in new tab');
  viewer.destroy();
  assert.equal(urls.revoked.length, 1);
  urls.restore();
});
test('text/Markdown are literal text; BOM handled; large preview truncated', async () => {
  const urls = mockUrls(); const doc = fakeDocument();
  const text = new Blob(['\uFEFF<script>alert(1)</script>'], { type: 'text/plain' });
  const { id, registry } = registryFor(text, { format: 'text' });
  const viewer = createAttachmentViewer({ document: doc, host: doc.body });
  await viewer.open({ details: detailsFor(id, text, { format: 'text' }), registry });
  const body = viewer.element.children[0].children[3];
  assert.match(body.textContent, /<script>alert\(1\)<\/script>/);
  assert.equal(body.children[0].tagName, 'pre');
  viewer.close();
  const large = new Blob(['a'.repeat(PREVIEW_TEXT_LIMIT_BYTES + 10)], { type: 'text/markdown' });
  const largeReg = registryFor(large, { format: 'markdown' });
  await viewer.open({ details: detailsFor(largeReg.id, large, { format: 'markdown' }), registry: largeReg.registry });
  assert.match(viewer.element.textContent, /Markdown source/);
  assert.match(viewer.element.textContent, /Preview truncated at 1 MiB/);
  viewer.close(); viewer.destroy(); urls.restore();
});
test('image load/error, async A→B race, close during read, and cleanup', async () => {
  const urls = mockUrls(); const doc = fakeDocument();
  const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' });
  const { id, registry } = registryFor(png, { format: 'generic' });
  const viewer = createAttachmentViewer({ document: doc, host: doc.body });
  await viewer.open({ details: detailsFor(id, png, { format: 'generic' }), registry });
  const img = viewer.element.children[0].children[3].children[0];
  assert.equal(img.tagName, 'img');
  img.onload();
  viewer.close();
  assert.equal(urls.revoked.length, 1);
  let releaseA;
  const slowA = { name: 'a.txt', size: 1, type: 'text/plain', slice: () => ({ arrayBuffer: () => new Promise((resolve) => { releaseA = () => resolve(new TextEncoder().encode('A').buffer); }) }) };
  const textB = new Blob(['B'], { type: 'text/plain' });
  const regA = registryFor(slowA, { format: 'text' });
  const regB = registryFor(textB, { format: 'text' });
  const openingA = viewer.open({ details: detailsFor(regA.id, slowA, { format: 'text' }), registry: regA.registry });
  await Promise.resolve();
  await viewer.open({ details: detailsFor(regB.id, textB, { format: 'text' }), registry: regB.registry });
  if (releaseA) releaseA();
  await openingA;
  assert.match(viewer.element.textContent, /B/);
  assert.doesNotMatch(viewer.element.textContent, /A/);
  viewer.close(); viewer.destroy(); urls.restore();
});test('invalid UTF-8 reports error and close during read invalidates stale completion', async () => {
  const urls = mockUrls(); const doc = fakeDocument();
  const bad = new Blob([new Uint8Array([0xff])], { type: 'text/plain' });
  const badReg = registryFor(bad, { format: 'text' });
  const viewer = createAttachmentViewer({ document: doc, host: doc.body });
  await viewer.open({ details: detailsFor(badReg.id, bad, { format: 'text' }), registry: badReg.registry });
  assert.match(viewer.element.textContent, /could not be decoded as UTF-8/);
  viewer.close();
  let release;
  const slow = { name: 'slow.txt', size: 1, type: 'text/plain', slice: () => ({ arrayBuffer: () => new Promise((resolve) => { release = () => resolve(new TextEncoder().encode('late').buffer); }) }) };
  const slowReg = registryFor(slow, { format: 'text' });
  const opening = viewer.open({ details: detailsFor(slowReg.id, slow, { format: 'text' }), registry: slowReg.registry });
  await Promise.resolve();
  viewer.close();
  release();
  await opening;
  assert.equal(viewer.isOpen, false);
  assert.equal(viewer.element.hidden, true);
  viewer.destroy(); urls.restore();
});test('PDF close then destroy before grace timer revokes each URL exactly once', async () => {
  const urls = mockUrls(); const doc = fakeDocument();
  const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
  const { id, registry } = registryFor(pdf, { format: 'pdf' });
  const viewer = createAttachmentViewer({ document: doc, host: doc.body });
  await viewer.open({ details: detailsFor(id, pdf, { format: 'pdf' }), registry });
  const created = viewer.urls[0].url;
  viewer.close();
  viewer.destroy();
  assert.deepEqual(urls.revoked, [created]);
  urls.restore();
});
test('multibyte character crossing the 1 MiB boundary is omitted without failing the preview', async () => {
  const urls = mockUrls(); const doc = fakeDocument();
  const viewer = createAttachmentViewer({ document: doc, host: doc.body });
  for (const text of ['가', '😀']) {
    const encoded = new TextEncoder().encode(text);
    const prefix = new Uint8Array(PREVIEW_TEXT_LIMIT_BYTES - (encoded.length - 1)).fill(0x61);
    const bytes = new Uint8Array(prefix.length + encoded.length);
    bytes.set(prefix); bytes.set(encoded, prefix.length);
    const blob = new Blob([bytes], { type: 'text/plain' });
    const { id, registry } = registryFor(blob, { format: 'text' });
    await viewer.open({ details: detailsFor(id, blob, { format: 'text' }), registry });
    assert.match(viewer.element.textContent, /Preview truncated at 1 MiB/);
    assert.doesNotMatch(viewer.element.textContent, /could not be decoded/);
    viewer.close();
  }
  viewer.destroy(); urls.restore();
});test('PDF modal Tab focus reaches Close and the new-tab fallback link', async () => {
  const urls = mockUrls(); const doc = fakeDocument();
  const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
  const { id, registry } = registryFor(pdf, { format: 'pdf' });
  const viewer = createAttachmentViewer({ document: doc, host: doc.body });
  await viewer.open({ details: detailsFor(id, pdf, { format: 'pdf' }), registry });
  const dialog = viewer.element.children[0];
  const close = dialog.children[0].children[1];
  const link = dialog.children[3].children[1];
  assert.equal(doc.activeElement, close);
  const keydown = doc.listeners.filter((entry) => entry.type === 'keydown').at(-1).handler;
  keydown({ key: 'Tab', shiftKey: false, preventDefault() {} });
  assert.equal(doc.activeElement, link);
  keydown({ key: 'Tab', shiftKey: false, preventDefault() {} });
  assert.equal(doc.activeElement, close);
  viewer.close(); viewer.destroy(); urls.restore();
});test('viewer guards block history/fit/camera while open and restore after close', () => {
  const viewer = { isOpen: true };
  const history = { undoCount: 2, redoCount: 1 };
  const camera = { zoom: 1, panX: 0, panY: 0 };
  assert.equal(viewerBlocksInteraction(viewer), true);
  assert.equal(canApplyViewerGuardedCamera({ viewer }), false);
  assert.deepEqual(history, { undoCount: 2, redoCount: 1 });
  assert.deepEqual(camera, { zoom: 1, panX: 0, panY: 0 });
  viewer.isOpen = false;
  assert.equal(viewerBlocksInteraction(viewer), false);
  assert.equal(canApplyViewerGuardedCamera({ viewer }), true);
});

test('YAML/YML render literally through the plain-text viewer with BOM, Korean, indentation and generic MIME', async () => {
  const urls = mockUrls(); const doc = fakeDocument();
  const yaml = '\uFEFF한글:\n  - "들여쓰기"\n  - "<script>alert(1)</script>"\nmalformed: [unclosed\n';
  for (const [name, mime, classification] of [
    ['name.yaml', '', { format: 'text', badge: 'YAML', reason: 'yaml-extension' }],
    ['NAME.YML', 'application/octet-stream', { format: 'text', badge: 'YAML', reason: 'yaml-extension' }],
    ['LEGACY.YAML', '', { format: 'generic', badge: 'YAML', reason: 'unknown-extension-inconclusive-mime' }]
  ]) {
    const file = new Blob([yaml], { type: mime });
    Object.defineProperty(file, 'name', { value: name });
    const { id, registry } = registryFor(file, classification, mime);
    const viewer = createAttachmentViewer({ document: doc, host: doc.body });
    await viewer.open({ details: detailsFor(id, file, classification), registry });
    assert.equal(viewer.state, 'ready', name);
    const body = viewer.element.children[0].children[3];
    const pre = body.children.find((child) => child.tagName === 'pre');
    assert.ok(pre, name);
    assert.equal(pre.textContent, yaml.replace(/^\uFEFF/, ''), name);
    assert.match(pre.textContent, /한글:/);
    assert.match(pre.textContent, /^  - "들여쓰기"/m);
    assert.match(pre.textContent, /<script>alert\(1\)<\/script>/);
    assert.equal(body.children.some((child) => String(child.tagName).toLowerCase() === 'script'), false);
    assert.equal(pre.children.length, 0);
    viewer.close(); viewer.destroy();
  }
  urls.restore();
});



test('bounded repeated image preview open/close revokes every URL and retains one host root', async () => {
  const urls = mockUrls(); const doc = fakeDocument();
  const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' });
  const { id, registry } = registryFor(png, { format: 'generic' });
  const viewer = createAttachmentViewer({ document: doc, host: doc.body });
  for (let i = 0; i < 50; i += 1) {
    await viewer.open({ details: detailsFor(id, png, { format: 'generic' }), registry });
    viewer.close();
  }
  assert.equal(urls.created.length, 50);
  assert.equal(urls.revoked.length, 50);
  assert.equal(new Set(urls.revoked).size, 50);
  assert.equal(viewer.urls.length, 0);
  assert.equal(doc.body.children.filter((child) => child === viewer.element).length, 1);
  viewer.destroy();
  urls.restore();
});
