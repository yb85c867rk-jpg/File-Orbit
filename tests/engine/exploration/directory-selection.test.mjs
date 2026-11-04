import test from 'node:test';
import assert from 'node:assert/strict';
import { collectDirectorySelection, captureDataTransferItems } from '../../../src/engine/hypertree/exploration/directory-selection.js';

function fileEntry(name, size = 4) { return { isFile: true, isDirectory: false, name, file: (ok) => ok({ name, size, type: 'text/plain' }) }; }
function dirEntry(name, batches, fail = false) {
  return { isFile: false, isDirectory: true, name, createReader: () => { let i = 0; return { readEntries: (ok, err) => { if (fail) { err(new Error('unreadable')); return; } ok(batches[i++] || []); } }; } };
}
test('captures entries during the drop event and reads every directory batch', async () => {
  const child = dirEntry('Sub', [[fileEntry('b.txt')]]);
  const root = dirEntry('Root', [[fileEntry('a.txt'), child], [fileEntry('c.txt')], []]);
  const dataTransfer = { items: [{ kind: 'file', webkitGetAsEntry: () => root }], files: [] };
  const captured = captureDataTransferItems(dataTransfer);
  const result = await collectDirectorySelection(captured);
  assert.equal(result.ok, true);
  assert.deepEqual(result.files.map((item) => item.relativePath), ['Root/a.txt', 'Root/c.txt', 'Root/Sub/b.txt']);
  assert.deepEqual(result.folders, ['Root', 'Root/Sub']);
  assert.equal(result.folderCount, 2);
  assert.equal(result.fileCount, 3);
});
test('unreadable directories and entry limits reject rather than appearing empty', async () => {
  const failed = await collectDirectorySelection({ entries: [dirEntry('Bad', [[]], true)] });
  assert.equal(failed.ok, false);
  assert.match(failed.message, /unreadable/);
  const tooMany = await collectDirectorySelection({ entries: [dirEntry('Big', [[fileEntry('a'), fileEntry('b')]])], maxEntries: 1 });
  assert.equal(tooMany.ok, false);
  assert.match(tooMany.reason, /entry-limit/);
});
test('text/url drops are ignored and stale traversal does not complete', async () => {
  const text = captureDataTransferItems({ items: [{ kind: 'string' }], files: [] });
  assert.deepEqual(text, { entries: [], files: [] });
  let current = false;
  const stale = await collectDirectorySelection({ entries: [dirEntry('R', [[fileEntry('a')]])], isCurrent: () => current });
  assert.equal(stale.reason, 'stale-selection');
});

