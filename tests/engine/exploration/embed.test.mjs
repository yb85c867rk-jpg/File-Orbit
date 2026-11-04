import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeEmbedSnapshot, buildEmbedSnapshotMessage, parseEmbedSnapshotMessage, EMBED_MAX_NODES, EMBED_MAX_BYTES, utf8ByteLength, EmbedSnapshotError } from '../../harness/m5-exploration/embed-snapshot.js';
import { normalizeParentOrigin, isAllowedParentEvent, parseViewerReady, parseViewerLoaded, parseViewerError } from '../../harness/m5-exploration/embed-message-security.js';
import { createEmbedHandshake } from '../../harness/m5-exploration/embed-handshake.js';

const sample = JSON.parse(readFileSync(new URL('../../harness/m5-exploration/embed-sample.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../../harness/m5-exploration/index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../../harness/m5-exploration/main.mjs', import.meta.url), 'utf8');
const viewer = readFileSync(new URL('../../harness/m5-exploration/embed-viewer.mjs', import.meta.url), 'utf8');
const host = readFileSync(new URL('../../harness/m5-exploration/embed-host.mjs', import.meta.url), 'utf8');
const hostHtml = readFileSync(new URL('../../harness/m5-exploration/embed-host.html', import.meta.url), 'utf8');
const dialog = readFileSync(new URL('../../harness/m5-exploration/embed-dialog.js', import.meta.url), 'utf8');

test('versioned embed snapshot sanitizes to explicit read-only fields and excludes private metadata', () => {
  const snapshot = sanitizeEmbedSnapshot(sample);
  assert.equal(snapshot.schema, 'fileorbit.embed.snapshot');
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.nodeCount, 10);
  assert.equal(snapshot.tree.data.description.length > 0, true);
  assert.equal(JSON.stringify(snapshot).includes('handle'), false);
  assert.equal(JSON.stringify(snapshot).includes('attachments'), false);
  const message = buildEmbedSnapshotMessage(sample);
  assert.equal(parseEmbedSnapshotMessage(message).nodeCount, 10);
  assert.throws(() => sanitizeEmbedSnapshot({ ...sample, extra: true }), (error) => error.code === 'invalid-snapshot');
  assert.throws(() => sanitizeEmbedSnapshot({ ...sample, version: 2 }), (error) => error.code === 'unsupported-version');
  const bad = JSON.parse(JSON.stringify(sample)); bad.tree.data = { description: 'ok', path: 'C:/secret' };
  assert.throws(() => sanitizeEmbedSnapshot(bad), (error) => error.code === 'invalid-data');
});

test('hostile labels remain inert strings and malformed messages are rejected', () => {
  const hostile = JSON.parse(JSON.stringify(sample));
  hostile.tree.name = '<img src=x onerror=alert(1)>';
  hostile.tree.data.description = '<script>alert(2)<\/script>';
  const safe = sanitizeEmbedSnapshot(hostile);
  assert.equal(safe.tree.name, '<img src=x onerror=alert(1)>');
  assert.equal(safe.tree.data.description, '<script>alert(2)<\/script>');
  assert.match(viewer, /name\.textContent = result\.name/);
  assert.match(viewer, /path\.textContent = result\.parentPath/);
  assert.doesNotMatch(viewer, /innerHTML\s*=\s*.*result\./);
  assert.throws(() => parseEmbedSnapshotMessage({ type: 'fileorbit:embed:snapshot', schema: 'fileorbit.embed.snapshot', version: 9, snapshot: sample }), (error) => error.code === 'unsupported-schema');
  assert.throws(() => parseEmbedSnapshotMessage({ type: 'fileorbit:embed:snapshot', schema: 'fileorbit.embed.snapshot', version: 1 }), (error) => error.code === 'invalid-snapshot');
});

test('embed messages enforce UTF-8 bytes for ASCII, Korean, and emoji payloads', () => {
  const ascii = JSON.parse(JSON.stringify(sample)); ascii.tree.data.description = 'a'.repeat(1000);
  const korean = JSON.parse(JSON.stringify(sample)); korean.tree.data.description = '가'.repeat(1000);
  const emoji = JSON.parse(JSON.stringify(sample)); emoji.tree.data.description = '🙂'.repeat(500);
  for (const candidate of [ascii, korean, emoji]) {
    const message = buildEmbedSnapshotMessage(candidate);
    assert.equal(parseEmbedSnapshotMessage(message).nodeCount, 10);
    assert.ok(utf8ByteLength(JSON.stringify(message)) <= EMBED_MAX_BYTES);
  }
  assert.ok(utf8ByteLength(JSON.stringify(buildEmbedSnapshotMessage(korean))) > JSON.stringify(buildEmbedSnapshotMessage(korean)).length);

  const small = buildEmbedSnapshotMessage(sample);
  const bytes = utf8ByteLength(JSON.stringify(small));
  assert.equal(parseEmbedSnapshotMessage(small, { maxBytes: bytes }).nodeCount, 10);
  assert.throws(() => parseEmbedSnapshotMessage(small, { maxBytes: bytes - 1 }), (error) => error.code === 'payload-limit');
  assert.equal(parseEmbedSnapshotMessage(small, { maxBytes: bytes + 1 }).nodeCount, 10);
  assert.throws(() => buildEmbedSnapshotMessage(sample, { maxBytes: bytes - 1 }), (error) => error.code === 'payload-limit');
  assert.equal(buildEmbedSnapshotMessage(sample, { maxBytes: bytes }).nodeCount, undefined);

  const huge = { id: 'r', name: 'Root', kind: 'folder', data: {}, children: Array.from({ length: 200 }, (_, i) => ({ id: `f${i}`, name: `File ${i}`, kind: 'file', data: { description: '가'.repeat(1000) } })) };
  const raw = { type: 'fileorbit:embed:snapshot', schema: 'fileorbit.embed.snapshot', version: 1, snapshot: { schema: 'fileorbit.embed.snapshot', version: 1, title: 'Huge', tree: huge } };
  assert.ok(utf8ByteLength(JSON.stringify(raw)) > EMBED_MAX_BYTES);
  assert.throws(() => buildEmbedSnapshotMessage({ schema: 'fileorbit.embed.snapshot', version: 1, title: 'Huge', tree: huge }), (error) => error.code === 'payload-limit');
  assert.throws(() => parseEmbedSnapshotMessage(raw), (error) => error.code === 'payload-limit');
});

test('embed snapshot enforces the free 300-node limit and bounded tree', () => {
  const root = { id: 'r', name: 'Root', kind: 'folder', data: {}, children: [] };
  for (let i = 0; i < EMBED_MAX_NODES - 1; i += 1) root.children.push({ id: `n${i}`, name: `Node ${i}`, kind: 'file', data: {} });
  assert.equal(sanitizeEmbedSnapshot({ schema: 'fileorbit.embed.snapshot', version: 1, title: 'Limit', tree: root }).nodeCount, EMBED_MAX_NODES);
  root.children.push({ id: 'extra', name: 'Extra', kind: 'file', data: {} });
  assert.throws(() => sanitizeEmbedSnapshot({ schema: 'fileorbit.embed.snapshot', version: 1, title: 'Limit', tree: root }), (error) => error.code === 'node-limit');
});

test('origin validation rejects wildcard/opaque/malformed and wrong source/window events', () => {
  assert.throws(() => normalizeParentOrigin('*'), /concrete parent origin/);
  assert.throws(() => normalizeParentOrigin('null'), /concrete parent origin/);
  assert.throws(() => normalizeParentOrigin('file:///tmp/x'), /http or https/);
  assert.throws(() => normalizeParentOrigin('not a url'), /malformed/);
  assert.equal(normalizeParentOrigin('https://parent.example/path'), 'https://parent.example');
  const parentWindow = {};
  assert.equal(isAllowedParentEvent({ source: parentWindow, origin: 'https://parent.example' }, { expectedOrigin: 'https://parent.example', parentWindow }), true);
  assert.equal(isAllowedParentEvent({ source: {}, origin: 'https://parent.example' }, { expectedOrigin: 'https://parent.example', parentWindow }), false);
  assert.equal(isAllowedParentEvent({ source: parentWindow, origin: 'https://evil.example' }, { expectedOrigin: 'https://parent.example', parentWindow }), false);
  assert.equal(parseViewerReady({ type: 'fileorbit:embed:ready', schema: 'fileorbit.embed.snapshot', version: 1 }).version, 1);
  assert.equal(parseViewerReady({ type: 'fileorbit:embed:ready', schema: 'fileorbit.embed.snapshot', version: 1, extra: true }), null);
  assert.equal(parseViewerLoaded({ type: 'fileorbit:embed:loaded', nodeCount: 10, title: 'Title' }).nodeCount, 10);
  assert.equal(parseViewerLoaded({ type: 'fileorbit:embed:loaded', nodeCount: 301, title: 'Title' }), null);
  assert.equal(parseViewerError({ type: 'fileorbit:embed:error', message: 'x' }).message, 'x');
  const target = new EventTarget(); let received = null;
  target.addEventListener('message', (event) => { received = isAllowedParentEvent(event, { expectedOrigin: 'https://parent.example', parentWindow }); });
  const dispatch = (origin, source) => { const event = new Event('message'); Object.defineProperties(event, { origin: { value: origin }, source: { value: source } }); target.dispatchEvent(event); return received; };
  assert.equal(dispatch('https://evil.example', parentWindow), false, 'wrong origin dispatch rejected');
  assert.equal(dispatch('https://parent.example', {}), false, 'wrong source window dispatch rejected');
  assert.equal(dispatch('https://parent.example', parentWindow), true, 'exact origin/source dispatch accepted');
});

test('handshake clears obsolete timers and stays successful for both event orders', () => {
  function harness() {
    let id = 0; const timers = new Map(); const statuses = [];
    const fake = { setTimeout(fn, ms) { const next = ++id; timers.set(next, fn); return next; }, clearTimeout(t) { timers.delete(t); } };
    const handshake = createEmbedHandshake({ onStatus: (text, state) => statuses.push([text, state]), timers: fake });
    return { handshake, timers, statuses, fire: () => [...timers.values()].forEach((fn) => fn()) };
  }
  const a = harness(); a.handshake.load(); assert.equal(a.timers.size, 1); assert.equal(a.handshake.state, 'loading-iframe');
  a.handshake.ready(); assert.equal(a.timers.size, 1, 'ready replaces load timer'); assert.equal(a.handshake.state, 'loading-snapshot');
  a.handshake.acknowledged(); assert.equal(a.timers.size, 0); assert.equal(a.handshake.state, 'loaded'); a.fire(); assert.equal(a.handshake.state, 'loaded');
  assert.equal(a.handshake.ready(), false); assert.equal(a.handshake.failed('late'), false); assert.equal(a.handshake.state, 'loaded');
  const b = harness(); b.handshake.ready(); assert.equal(b.timers.size, 1); b.handshake.load(); assert.equal(b.timers.size, 1, 'late iframe load does not arm a second timer'); b.handshake.acknowledged(); b.fire(); assert.equal(b.handshake.state, 'loaded');
  const c = harness(); c.handshake.load(); c.fire(); assert.equal(c.handshake.state, 'timeout'); c.handshake.ready(); c.handshake.acknowledged(); assert.equal(c.handshake.state, 'loaded');
});

test('embed UI is wired to a local-only preview and does not claim hosting', () => {
  assert.match(html, /id="embed-action"[^>]*data-available="true"/);
  assert.match(main, /createEmbedDialog/);
  assert.match(main, /action === 'embed'.*embedDialog\.open/);
  assert.match(dialog, /Local read-only preview/);
  assert.match(dialog, /Externally usable embed URL/);
  assert.match(dialog, /not available/);
  assert.match(dialog, /Copy embed code — unavailable until hosting exists/);
  assert.match(dialog, /embed-host\.html/);
  assert.match(hostHtml, /sandbox="allow-scripts allow-same-origin"/); // local same-origin fixture only; production cross-origin uses allow-scripts
  assert.match(viewer, /isAllowedParentEvent/);
  assert.match(viewer, /normalizeParentOrigin/);
  assert.match(viewer, /parseEmbedSnapshotMessage/);
  assert.doesNotMatch(viewer, /indexedDB|showSaveFilePicker|createWritable|FileSystemFileHandle/);
  assert.doesNotMatch(main, /iframe[^>]*localhost/);
});
