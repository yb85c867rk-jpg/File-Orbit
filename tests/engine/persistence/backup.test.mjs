import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBackup, decodeBackup, safeBackupFilename, safeDocumentFilename, BACKUP_HEADER_BYTES } from '../../../src/engine/hypertree/persistence/backup.js';
import { buildSaveSnapshot } from '../../../src/engine/hypertree/persistence/codec.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';

const classification = { format: 'pdf', badge: 'PDF', needsReview: false };
function fixture() {
  const bytes = new TextEncoder().encode('%PDF-test');
  const file = new Blob([bytes], { type: 'application/pdf' });
  const tree = {
    id: 'root', kind: 'folder', name: 'Backup Ünïcode <b>', children: [{
      id: 'file-1', kind: 'file', name: 'doc.pdf',
      data: { description: '<script>not html</script>', link: null, dataType: 'file', attachmentId: 'att_runtime', custom: { nested: ['keep', 7] }, originalName: 'doc.pdf', sizeBytes: bytes.length, mime: 'application/pdf', classification }
    }]
  };
  const record = { name: 'doc.pdf', sizeBytes: bytes.length, mime: 'application/pdf', classification, metadata: { originalName: 'doc.pdf', sizeBytes: bytes.length, mime: 'application/pdf', classification }, file };
  const registry = { get: (id) => id === 'att_runtime' ? record : null, size: 1, totalBytes: bytes.length };
  return { tree, registry, file, bytes };
}

test('backup round trip preserves tree metadata and attachments with fresh ids', async () => {
  const { tree, registry, bytes } = fixture();
  const encoded = await encodeBackup({ tree, registry, mapName: 'Backup Ünïcode <b>', sourceMapId: 'map_source', now: new Date('2026-01-02T03:04:05Z') });
  assert.equal(encoded.blob.size, encoded.packageSize);
  const header = new Uint8Array(await encoded.blob.slice(0, BACKUP_HEADER_BYTES).arrayBuffer());
  assert.equal(new TextDecoder().decode(header.slice(0, 9)), 'FILEORBIT');
  const decoded = await decodeBackup(encoded.blob, { allocateAttachmentId: (() => { let n = 0; return () => `att_new${++n}`; })() });
  assert.equal(decoded.manifest.mapName, 'Backup Ünïcode <b>');
  assert.equal(decoded.manifest.sourceMapId, 'map_source');
  assert.equal(decoded.manifest.nodeCount, 2);
  assert.equal(decoded.attachments.length, 1);
  assert.equal(decoded.attachments[0].attachmentId, 'att_new1');
  assert.equal(decoded.tree.children[0].data.attachmentId, 'att_new1');
  assert.equal(decoded.tree.children[0].data.description, '<script>not html</script>');
  assert.equal(JSON.stringify(decoded.tree.children[0].data.custom), JSON.stringify({ nested: ['keep', 7] }));
  assert.equal(decoded.tree.children[0].data.originalName, 'doc.pdf');
  assert.equal(decoded.tree.children[0].data.sizeBytes, bytes.length);
  assert.equal(decoded.tree.children[0].data.mime, 'application/pdf');
  const restoredRegistry = createAttachmentRegistry({ datasetToken: 99 });
  for (const attachment of decoded.attachments) {
    const adopted = restoredRegistry.adopt({ attachmentId: attachment.attachmentId, file: attachment.blob, metadata: { attachmentId: attachment.attachmentId, ...attachment.metadata } });
    assert.equal(adopted.ok, true);
  }
  const snapshot = buildSaveSnapshot({ tree: decoded.tree, registry: restoredRegistry, datasetToken: 99, capturedRevision: 1 });
  assert.equal(snapshot.attachments[0].mime, 'application/pdf');
  assert.equal(snapshot.attachments[0].originalName, 'doc.pdf');
  assert.deepEqual(new Uint8Array(await decoded.attachments[0].blob.arrayBuffer()), bytes);
  assert.equal(safeBackupFilename('a/b:c*.orbit'), 'a b c.orbit');
});

test('empty attachment maps and zero-byte files are accepted', async () => {
  const tree = { id: 'root', kind: 'folder', name: 'Empty', children: [] };
  const encoded = await encodeBackup({ tree, registry: { get: () => null } });
  const decoded = await decodeBackup(encoded.blob);
  assert.equal(decoded.attachments.length, 0);
  assert.equal(decoded.tree.name, 'Empty');
  const zeroBlob = new Blob([]);
  const zeroTree = { id: 'r', kind: 'folder', name: 'Zero', children: [{ id: 'z', kind: 'file', name: 'zero.txt', data: { description: '', link: null, dataType: 'file', attachmentId: 'att_z', originalName: 'zero.txt', sizeBytes: 0, mime: 'text/plain', classification: { format: 'text', badge: 'TXT', needsReview: false } } }] };
  const zero = await encodeBackup({ tree: zeroTree, registry: { get: () => ({ name: 'zero.txt', sizeBytes: 0, mime: 'text/plain', metadata: { originalName: 'zero.txt', mime: 'text/plain', classification: { format: 'text', badge: 'TXT', needsReview: false } }, file: zeroBlob }) } });
  const zeroDecoded = await decodeBackup(zero.blob);
  assert.equal(zeroDecoded.attachments[0].blob.size, 0);
});

test('unsupported version and truncated headers are rejected', async () => {
  const { tree, registry } = fixture();
  const encoded = await encodeBackup({ tree, registry });
  const bytes = new Uint8Array(await encoded.blob.arrayBuffer());
  const badVersion = bytes.slice(); new DataView(badVersion.buffer).setUint16(9, 99, false);
  await assert.rejects(decodeBackup(new Blob([badVersion])), (e) => e.code === 'unsupported-version');
  await assert.rejects(decodeBackup(new Blob([bytes.slice(0, 5)])), (e) => e.code === 'truncated-header');
  await assert.rejects(decodeBackup(new Blob([])), (e) => e.code === 'truncated-header');
});

test('hash mismatch, trailing bytes, and oversized manifest are rejected', async () => {
  const { tree, registry } = fixture();
  const encoded = await encodeBackup({ tree, registry });
  const bytes = new Uint8Array(await encoded.blob.arrayBuffer());
  const corrupted = bytes.slice(); corrupted[corrupted.length - 1] ^= 0xff;
  await assert.rejects(decodeBackup(new Blob([corrupted])), (e) => e.code === 'hash-mismatch');
  const trailing = new Uint8Array(bytes.length + 1); trailing.set(bytes);
  await assert.rejects(decodeBackup(new Blob([trailing])), (e) => ['trailing-bytes','package-size'].includes(e.code));
  const header = new Uint8Array(15); header.set(new TextEncoder().encode('FILEORBIT')); new DataView(header.buffer).setUint16(9, 1, false); new DataView(header.buffer).setUint32(11, 3 * 1024 * 1024, false);
  await assert.rejects(decodeBackup(new Blob([header])), (e) => e.code === 'manifest-size');
  await assert.rejects(decodeBackup(new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])])), (e) => e.code === 'bad-magic');
});
test('export uses an owned snapshot during deferred hashing', async () => {
  const { tree, registry } = fixture();
  let release; const gate = new Promise((resolve) => { release = resolve; });
  let started; const entered = new Promise((resolve) => { started = resolve; });
  const cryptoApi = { subtle: { digest: async (...args) => { started(); await gate; return globalThis.crypto.subtle.digest(...args); } } };
  const pending = encodeBackup({ tree, registry, mapName: 'Captured Name', cryptoApi });
  await entered;
  tree.name = 'MUTATED ROOT'; tree.children[0].data.custom.nested[0] = 'mutated'; tree.children[0].data.classification.badge = 'MUTATED'; tree.children.push({ id: 'late', kind: 'file', name: 'late.txt', data: { description: 'late', link: null, dataType: 'raw' } });
  registry.get = () => ({ name: 'changed', sizeBytes: 5, mime: 'text/plain', metadata: { originalName: 'changed', mime: 'text/plain', classification: null }, file: new Blob(['xxxxx']) });
  release();
  const encoded = await pending;
  const decoded = await decodeBackup(encoded.blob);
  assert.equal(decoded.manifest.nodeCount, 2);
  assert.equal(decoded.tree.name, 'Backup Ünïcode <b>');
  assert.equal(decoded.tree.children.length, 1);
  assert.equal(decoded.attachments[0].metadata.originalName, 'doc.pdf');
  assert.equal(decoded.manifest.attachments[0].classification.badge, 'PDF');
  assert.equal(decoded.tree.children[0].data.classification.badge, 'PDF');
  assert.deepEqual(decoded.tree.children[0].data.custom.nested, ['keep', 7]);
});
test('pre-cancelled encode/decode reject without hashing', async () => {
  const { tree, registry } = fixture();
  let hashes = 0;
  const cryptoApi = { subtle: { digest: async (...args) => { hashes += 1; return globalThis.crypto.subtle.digest(...args); } } };
  await assert.rejects(encodeBackup({ tree, registry, cryptoApi, isCancelled: () => true }), (e) => e.code === 'backup-cancelled');
  assert.equal(hashes, 0);
  const encoded = await encodeBackup({ tree, registry });
  await assert.rejects(decodeBackup(encoded.blob, { isCancelled: () => true }), (e) => e.code === 'backup-cancelled');
});
test('document filenames use .orbit and avoid duplicate suffixes', () => {
  assert.equal(safeDocumentFilename('Plan'), 'Plan.orbit');
  assert.equal(safeDocumentFilename('Plan.orbit'), 'Plan.orbit');
  assert.equal(safeDocumentFilename('Plan.orbit.orbit'), 'Plan.orbit');
  assert.equal(safeDocumentFilename('Plan.map.orbit'), 'Plan.map.orbit');
  assert.equal(safeDocumentFilename('Legacy.fileorbit'), 'Legacy.fileorbit.orbit');
  assert.equal(safeDocumentFilename('a/b:c*.orbit'), 'a b c.orbit');
  assert.equal(safeBackupFilename('Legacy.orbit'), 'Legacy.orbit');
});
test('unrelated .map content is rejected by container magic, not extension', async () => {
  await assert.rejects(() => decodeBackup(new Blob(['not a fileorbit document'], { type: 'application/x-orbit' })), (error) => error.code === 'bad-magic' && /not a FileOrbit/.test(error.message));
});
function invalidatableSource(bytes) {
  let invalid = false;
  return {
    source: {
      size: bytes.byteLength,
      type: 'application/x-orbit',
      slice(start, end) {
        return { size: end - start, async arrayBuffer() { if (invalid) throw new DOMException('The requested file could not be read.', 'NotReadableError'); return bytes.slice(start, end).buffer; } };
      }
    },
    invalidate() { invalid = true; }
  };
}

test('decoded attachments own readable bytes after the source file is invalidated', async () => {
  const { tree, registry } = fixture();
  const encoded = await encodeBackup({ tree, registry, mapName: 'source-backed' });
  const bytes = new Uint8Array(await encoded.blob.arrayBuffer());
  const fixtureSource = invalidatableSource(bytes);
  const decoded = await decodeBackup(fixtureSource.source);
  fixtureSource.invalidate();
  const attachment = decoded.attachments[0];
  const restored = new Uint8Array(await attachment.blob.arrayBuffer());
  assert.deepEqual(Array.from(restored), Array.from(bytes.slice(bytes.length - restored.length)));
  assert.equal(decoded.tree.name, tree.name);
});

test('attachment read failure during encoding identifies the attachment and preserves its error', async () => {
  const { tree } = fixture();
  const broken = { name: 'doc.pdf', sizeBytes: 9, mime: 'application/pdf', classification, metadata: { originalName: 'doc.pdf', sizeBytes: 9, mime: 'application/pdf', classification }, file: { size: 9, type: 'application/pdf', slice() { return { async arrayBuffer() { throw new DOMException('source vanished', 'NotReadableError'); } }; } } };
  const registry = { get: (id) => id === 'att_runtime' ? broken : null, size: 1, totalBytes: 9 };
  await assert.rejects(() => encodeBackup({ tree, registry, mapName: 'broken' }), (error) => error.code === 'attachment-read-failed' && /doc\.pdf/.test(error.message) && /att_runtime/.test(error.message) && /NotReadableError/.test(error.message));
});

test('decode read failure reports stage, attachment id and filename without exposing bytes', async () => {
  const { tree, registry } = fixture();
  const encoded = await encodeBackup({ tree, registry, mapName: 'decode-error' });
  const bytes = new Uint8Array(await encoded.blob.arrayBuffer());
  let sliceCalls = 0;
  const source = { size: bytes.byteLength, type: 'application/x-orbit', slice(start, end) { const call = ++sliceCalls; return { size: end - start, async arrayBuffer() { if (call >= 3) throw new DOMException('source vanished', 'NotReadableError'); return bytes.slice(start, end).buffer; } }; } };
  await assert.rejects(() => decodeBackup(source), (error) => error.code === 'attachment-read-failed' && /doc\.pdf/.test(error.message) && /att_p1/.test(error.message) && /NotReadableError/.test(error.message));
});



