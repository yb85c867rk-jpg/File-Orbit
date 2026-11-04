import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCreateMapCandidate } from '../../../src/engine/hypertree/exploration/create-map.js';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_TOTAL_BYTES } from '../../../src/engine/hypertree/editor/validation.js';

const classify = (file) => ({ format: 'generic', badge: 'FILE', needsReview: false, reason: 'audit', mime: file.type });
const fakeFile = (name, size = 1) => ({ name, size, type: 'text/plain' });
const files = (count, size = 1) => Array.from({ length: count }, (_, i) => ({ file: fakeFile(`node-${i}.txt`, size), relativePath: `node-${i}.txt` }));

test('free-edition 300-node boundary counts the synthetic root and folders', async () => {
  const at299 = await prepareCreateMapCandidate({ mapName: '경계 299', datasetToken: 30, classify, files: files(298) });
  assert.equal(at299.ok, true); assert.equal(at299.stats.nodeCount, 299);
  const at300 = await prepareCreateMapCandidate({ mapName: '경계 300', datasetToken: 31, classify, files: files(299) });
  assert.equal(at300.ok, true); assert.equal(at300.stats.nodeCount, 300);
  const at301 = await prepareCreateMapCandidate({ mapName: '경계 301', datasetToken: 32, classify, files: files(300) });
  assert.equal(at301.ok, false); assert.equal(at301.reason, 'node-limit');

  const folders299 = Array.from({ length: 298 }, (_, i) => `폴더 ${i}`), oneFile = [{ file: fakeFile('끝.txt'), relativePath: '끝.txt' }];
  const folderAt300 = await prepareCreateMapCandidate({ mapName: '폴더 300', datasetToken: 33, classify, folders: folders299, files: oneFile });
  assert.equal(folderAt300.ok, true, JSON.stringify(folderAt300)); assert.equal(folderAt300.stats.nodeCount, 300);
  const folderAt301 = await prepareCreateMapCandidate({ mapName: '폴더 301', datasetToken: 34, classify, folders: [...folders299, '하나 더'], files: oneFile });
  assert.equal(folderAt301.ok, false); assert.equal(folderAt301.reason, 'node-limit');
});

test('attachment per-file and total limits accept equality and reject one byte above', async () => {
  const exactFile = await prepareCreateMapCandidate({ mapName: '파일 경계', datasetToken: 40, classify, files: [{ file: fakeFile('exact.bin', MAX_ATTACHMENT_BYTES), relativePath: 'exact.bin' }] });
  assert.equal(exactFile.ok, true); assert.equal(exactFile.registry.totalBytes, MAX_ATTACHMENT_BYTES);
  const aboveFile = await prepareCreateMapCandidate({ mapName: '파일 경계+1', datasetToken: 41, classify, files: [{ file: fakeFile('above.bin', MAX_ATTACHMENT_BYTES + 1), relativePath: 'above.bin' }] });
  assert.equal(aboveFile.ok, false); assert.equal(aboveFile.reason, 'attachment-too-large');

  const five = Array.from({ length: 5 }, (_, i) => ({ file: fakeFile(`part-${i}.bin`, MAX_ATTACHMENT_BYTES), relativePath: `part-${i}.bin` }));
  const exactTotal = await prepareCreateMapCandidate({ mapName: '총량 경계', datasetToken: 42, classify, files: five });
  assert.equal(exactTotal.ok, true); assert.equal(exactTotal.registry.totalBytes, MAX_ATTACHMENT_TOTAL_BYTES);
  const aboveTotal = await prepareCreateMapCandidate({ mapName: '총량 경계+1', datasetToken: 43, classify, files: [...five, { file: fakeFile('extra.bin', 1), relativePath: 'extra.bin' }] });
  assert.equal(aboveTotal.ok, false); assert.equal(aboveTotal.reason, 'attachment-total-limit');
});

test('limit rejection returns no installable candidate and does not mutate an existing map sentinel', async () => {
  const live = { tree: { id: 'live-root', name: 'Existing', kind: 'folder', data: {}, children: [] }, model: { focusedFolderId: 'live-root' } };
  const before = JSON.stringify(live);
  const rejected = await prepareCreateMapCandidate({ mapName: 'Too many', datasetToken: 50, classify, files: files(300) });
  assert.equal(rejected.ok, false); assert.equal(rejected.reason, 'node-limit');
  assert.equal(rejected.tree, undefined); assert.equal(rejected.registry, undefined);
  assert.equal(JSON.stringify(live), before);
});
