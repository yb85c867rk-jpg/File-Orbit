import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTACHMENT_PREFIX_BYTES, classifyAttachment, classifyFile, readAttachmentPrefix,
  MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_TOTAL_BYTES
} from '../../../src/engine/hypertree/editor/attachment-classification.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';

const bytes = (text) => new TextEncoder().encode(text);
function fakeFile(name, size, type = '') {
  return { name, size, type, slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }) };
}
function attachment(overrides = {}) {
  return { format: 'text', badge: 'TXT', confidence: 'extension', needsReview: false, reason: 'text-extension', ...overrides };
}

test('classification uses signature, MIME, extension, and conflict precedence', () => {
  assert.equal(classifyAttachment({ name: 'Report.PDF', mime: 'application/pdf; charset=binary', prefix: bytes('%PDF-1.7') }).format, 'pdf');
  assert.equal(classifyAttachment({ name: 'Report.PDF', mime: 'application/pdf', prefix: bytes('%PDF-1.7') }).confidence, 'signature');
  assert.equal(classifyAttachment({ name: 'report.pdf', mime: 'application/pdf', prefix: bytes('not a pdf') }).needsReview, true);
  assert.equal(classifyAttachment({ name: 'report.pdf', mime: '', prefix: null }).badge, '?');
  assert.equal(classifyAttachment({ name: 'notes.txt', mime: 'text/plain', prefix: bytes('%PDF-1.7') }).format, 'unknown');
  assert.equal(classifyAttachment({ name: 'notes.md', mime: '', prefix: null }).format, 'markdown');
  assert.equal(classifyAttachment({ name: 'notes.md', mime: '', prefix: null }).confidence, 'extension');
  assert.equal(classifyAttachment({ name: 'notes.txt', mime: 'image/png', prefix: null }).needsReview, true);
  assert.equal(classifyAttachment({ name: 'archive.final.doc', mime: '', prefix: null }).format, 'generic');
  assert.equal(classifyAttachment({ name: 'README', mime: '', prefix: null }).format, 'generic');
});
test('classifyFile reads only a bounded prefix', async () => {
  const calls = [];
  const file = {
    name: 'large.md', size: 5000, type: 'text/markdown',
    slice(start, end) { calls.push([start, end]); return { arrayBuffer: async () => bytes('# title').buffer }; }
  };
  const result = await classifyFile(file);
  assert.equal(result.format, 'markdown');
  assert.deepEqual(calls, [[0, ATTACHMENT_PREFIX_BYTES]]);
  const prefix = await readAttachmentPrefix({ name: 'small', size: 3, slice: () => ({ arrayBuffer: async () => bytes('abc').buffer }) });
  assert.equal(prefix.length, 3);
});
test('registry enforces per-file and total budgets and owns references', () => {
  const registry = createAttachmentRegistry({ datasetToken: 1, maxFileBytes: 10, maxTotalBytes: 15 });
  const first = registry.stage(fakeFile('a.txt', 10, 'text/plain'), attachment());
  assert.equal(first.ok, true);
  assert.equal(registry.totalBytes, 10);
  assert.equal(registry.stage(fakeFile('b.txt', 6), attachment()).reason, 'attachment-total-limit');
  assert.equal(registry.stage(fakeFile('big.txt', 11), attachment()).reason, 'attachment-too-large');
  assert.equal(registry.commit(first.id), true);
  assert.equal(registry.metadata(first.id).originalName, 'a.txt');
  assert.equal(registry.get(first.id).committed, true);
  assert.equal(registry.release(first.id), true);
  assert.equal(registry.totalBytes, 0);
});
test('registry replacement/cancel accounting releases only staged references', () => {
  const registry = createAttachmentRegistry({ datasetToken: 1 });
  const a = registry.stage(fakeFile('a.txt', 4), attachment());
  const b = registry.stage(fakeFile('b.txt', 6), attachment());
  assert.equal(registry.totalBytes, 10);
  assert.equal(registry.release(a.id), true);
  assert.equal(registry.totalBytes, 6);
  registry.clear();
  assert.equal(registry.size, 0);
  assert.equal(registry.totalBytes, 0);
});
test('declared policy limits and classification are deterministic', () => {
  assert.equal(MAX_ATTACHMENT_BYTES, 20 * 1024 * 1024);
  assert.equal(MAX_ATTACHMENT_TOTAL_BYTES, 100 * 1024 * 1024);
  const a = classifyAttachment({ name: 'x.md', mime: '', prefix: null });
  const b = classifyAttachment({ name: 'X.MD', mime: '', prefix: null });
  assert.deepEqual(a, b);
});

test('YAML/YML extensions are text independent of MIME; common YAML MIME types are text', () => {
  for (const name of ['name.yaml', 'name.yml', 'NAME.YAML', 'NAME.YML']) {
    for (const mime of ['', 'application/octet-stream', 'text/yaml', 'text/x-yaml', 'application/yaml', 'application/x-yaml', 'application/vnd.yaml']) {
      const classified = classifyAttachment({ name, mime, prefix: bytes('key: value') });
      assert.equal(classified.format, 'text', name + ' / ' + mime);
      assert.equal(classified.needsReview, false, name + ' / ' + mime);
      assert.equal(classified.badge, 'YAML');
      assert.match(classified.reason, /yaml-extension/);
    }
  }
  assert.equal(classifyAttachment({ name: 'notes.txt', mime: 'text/plain', prefix: null }).format, 'text');
  assert.equal(classifyAttachment({ name: 'name.yaml', mime: 'image/png', prefix: null }).needsReview, true);
});
