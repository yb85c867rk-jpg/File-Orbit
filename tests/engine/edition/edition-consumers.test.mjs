import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCreateMapCandidate } from '../../../src/engine/hypertree/exploration/create-map.js';
import { collectDirectorySelection } from '../../../src/engine/hypertree/exploration/directory-selection.js';
import {
  EDITOR_MAX_NODES,
  countTreeNodes,
  validateAddChild,
  validateEditorAdmission
} from '../../../src/engine/hypertree/editor/validation.js';
import { EDITION_NODE_LIMITS } from '../../../src/engine/hypertree/edition/index.js';

const classify = async (file) => ({ format: 'generic', badge: 'FILE', needsReview: false, reason: 'synthetic', mime: file.type });
const fakeFile = (name, size = 1) => ({ name, size, type: 'text/plain' });
const files = (count) => Array.from({ length: count }, (_, index) => ({ file: fakeFile(`${index}.txt`), relativePath: `${index}.txt` }));
const folders = (count) => Array.from({ length: count }, (_, index) => `Folder-${index}`);
const fileEntries = (count) => Array.from({ length: count }, (_, index) => ({
  isFile: true,
  isDirectory: false,
  name: `${index}.txt`,
  file: (ok) => ok(fakeFile(`${index}.txt`))
}));
function node(id, kind, name, children = []) { return { id, kind, name, data: {}, children }; }
function tree(count) { return node('r', 'folder', 'Root', Array.from({ length: count - 1 }, (_, index) => node(`n${index}`, 'file', `N${index}`))); }
function addDraft(parentId, name) {
  return { tree: null, parentId, kind: 'file', draftName: name, draftDataType: 'web-link', draftDescription: 'description', draftLink: 'https://example.com/item' };
}

test('creation preview/final boundary is 300 including root for flat files', async () => {
  const at300 = await prepareCreateMapCandidate({ mapName: 'At 300', datasetToken: 1, classify, files: files(299) });
  assert.equal(at300.ok, true);
  assert.equal(at300.stats.nodeCount, 300);
  assert.equal(countTreeNodes(at300.tree), 300);

  const at301 = await prepareCreateMapCandidate({ mapName: 'At 301', datasetToken: 2, classify, files: files(300) });
  assert.equal(at301.ok, false);
  assert.equal(at301.reason, 'node-limit');
  assert.match(at301.message, /300 nodes/);
});

test('creation folder-containing boundary is 300 including root and folder nodes', async () => {
  const at300 = await prepareCreateMapCandidate({ mapName: 'Folders 300', datasetToken: 3, classify, folders: folders(150), files: files(149) });
  assert.equal(at300.ok, true);
  assert.equal(at300.stats.nodeCount, 300);
  assert.equal(at300.stats.folderCount, 151);
  assert.equal(at300.stats.fileCount, 149);

  const at301 = await prepareCreateMapCandidate({ mapName: 'Folders 301', datasetToken: 4, classify, folders: folders(150), files: files(150) });
  assert.equal(at301.ok, false);
  assert.equal(at301.reason, 'node-limit');
});

test('creation caller budgets tighten but cannot elevate the free limit', async () => {
  const lowerOk = await prepareCreateMapCandidate({ mapName: 'Lower', datasetToken: 5, classify, files: files(9), maxNodes: 10 });
  assert.equal(lowerOk.ok, true);
  assert.equal(lowerOk.stats.nodeCount, 10);
  const lowerReject = await prepareCreateMapCandidate({ mapName: 'Lower+', datasetToken: 6, classify, files: files(10), maxNodes: 10 });
  assert.equal(lowerReject.reason, 'node-limit');
  assert.match(lowerReject.message, /10 nodes/);

  const elevatedOk = await prepareCreateMapCandidate({ mapName: 'Elevated', datasetToken: 7, classify, files: files(299), maxNodes: 1000 });
  assert.equal(elevatedOk.ok, true);
  assert.equal(elevatedOk.stats.nodeCount, 300);
  const elevatedReject = await prepareCreateMapCandidate({ mapName: 'Elevated+', datasetToken: 8, classify, files: files(300), maxNodes: 1000 });
  assert.equal(elevatedReject.reason, 'node-limit');
  assert.match(elevatedReject.message, /300 nodes/);

  const invalid = await prepareCreateMapCandidate({ mapName: 'Bad budget', datasetToken: 9, classify, files: files(1), maxNodes: 0 });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, 'invalid-node-budget');
});

test('directory collection uses the same free boundary and caller caps', async () => {
  const at300 = await collectDirectorySelection({ entries: fileEntries(299) });
  assert.equal(at300.ok, true);
  assert.equal(1 + at300.folderCount + at300.fileCount, 300);
  assert.equal(at300.fileCount, 299);

  const at301 = await collectDirectorySelection({ entries: fileEntries(300) });
  assert.equal(at301.ok, false);
  assert.equal(at301.reason, 'node-limit');
  assert.match(at301.message, /300 nodes/);

  const lowerOk = await collectDirectorySelection({ entries: fileEntries(1), maxNodes: 2 });
  assert.equal(lowerOk.ok, true);
  const lowerReject = await collectDirectorySelection({ entries: fileEntries(2), maxNodes: 2 });
  assert.equal(lowerReject.reason, 'node-limit');
  assert.match(lowerReject.message, /2 nodes/);

  const elevated = await collectDirectorySelection({ entries: fileEntries(300), maxNodes: 1000 });
  assert.equal(elevated.reason, 'node-limit');
  assert.match(elevated.message, /300 nodes/);

  const invalid = await collectDirectorySelection({ entries: fileEntries(1), maxNodes: 0 });
  assert.equal(invalid.reason, 'invalid-node-budget');
});

test('editor admission and add-child use the free policy at 300/301', () => {
  assert.equal(EDITOR_MAX_NODES, EDITION_NODE_LIMITS.free);
  assert.equal(EDITOR_MAX_NODES, 300);

  const at300 = tree(300);
  assert.equal(validateEditorAdmission(at300).ok, true);
  const at301 = tree(301);
  const admission = validateEditorAdmission(at301);
  assert.equal(admission.ok, false);
  assert.equal(admission.reason, 'editor-node-limit');
  assert.match(admission.message, /300/);

  const at299 = tree(299);
  const before = JSON.stringify(at299);
  const addAt300 = validateAddChild({ ...addDraft('r', 'At 300'), tree: at299 });
  assert.equal(addAt300.ok, true);
  assert.equal(JSON.stringify(at299), before, 'validation does not mutate the tree');

  const at300Add = validateAddChild({ ...addDraft('r', 'At 301'), tree: at300 });
  assert.equal(at300Add.ok, false);
  assert.equal(at300Add.reason, 'editor-node-limit');
  assert.match(at300Add.message, /300/);
  assert.equal(JSON.stringify(at300), JSON.stringify(tree(300)), 'rejection does not mutate the 300-node tree');
});

test('existing attachment limits remain unchanged at the consumer boundary', async () => {
  assert.equal((await import('../../../src/engine/hypertree/editor/validation.js')).MAX_ATTACHMENT_BYTES, 20 * 1024 * 1024);
  assert.equal((await import('../../../src/engine/hypertree/editor/validation.js')).MAX_ATTACHMENT_TOTAL_BYTES, 100 * 1024 * 1024);
});
