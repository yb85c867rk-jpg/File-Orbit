import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCreateMapCandidate, normalizeRelativePath } from '../../../src/engine/hypertree/exploration/create-map.js';
import { validateDataEdit } from '../../../src/engine/hypertree/editor/validation.js';

function fakeFile(name, size = 4, type = 'text/plain') { return { name, size, type }; }
const classify = async (file) => ({ format: file.name.endsWith('.pdf') ? 'pdf' : 'generic', badge: file.name.endsWith('.pdf') ? 'PDF' : 'FILE', needsReview: false, reason: 'synthetic', mime: file.type });
function flatten(tree, out = []) { out.push(tree); for (const child of tree.children || []) flatten(child, out); return out; }
test('normalizes relative paths and rejects absolute/traversal/ambiguous forms', () => {
  assert.equal(normalizeRelativePath('A/B.txt').path, 'A/B.txt');
  for (const value of ['/A', '../A', 'A/../B', 'A//B', 'A\\B', 'C:/A']) {
    assert.equal(normalizeRelativePath(value).ok, false, value);
  }
});
test('multiple files, nested/empty folders, unicode names, deterministic order', async () => {
  const result = await prepareCreateMapCandidate({ mapName: 'My Map', datasetToken: 7, classify,
    files: [{ file: fakeFile('z.txt'), relativePath: 'Zeta/z.txt' }, { file: fakeFile('a.md'), relativePath: 'Alpha/a.md' }, { file: fakeFile('é.txt'), relativePath: 'é.txt' }],
    folders: ['Empty', 'Empty/Inner'] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.tree.children.map((node) => node.name), ['Alpha', 'Empty', 'Zeta', 'é.txt']);
  const nodes = flatten(result.tree);
  assert.equal(nodes.length, 8);
  assert.equal(nodes.filter((node) => node.kind === 'folder').length, 5);
  assert.equal(nodes.filter((node) => node.kind === 'file').length, 3);
  assert.equal(nodes.find((node) => node.name === 'a.md').data.description, null);
  assert.equal(nodes.find((node) => node.name === 'a.md').data.dataType, 'file');
  assert.equal(result.registry.totalBytes, 12);
  assert.equal(result.stats.folderCount, 5);
  assert.equal(result.stats.fileCount, 3);
});
test('duplicate and conflicting sibling paths reject; same name in different folders allowed', async () => {
  const duplicate = await prepareCreateMapCandidate({ mapName: 'M', datasetToken: 1, classify, files: [{ file: fakeFile('a.txt'), relativePath: 'A/a.txt' }, { file: fakeFile('a.txt'), relativePath: 'A/a.txt' }] });
  assert.equal(duplicate.reason, 'duplicate-path');
  const conflict = await prepareCreateMapCandidate({ mapName: 'M', datasetToken: 1, classify, files: [{ file: fakeFile('A'), relativePath: 'A' }], folders: ['A'] });
  assert.equal(conflict.ok, false);
  const allowed = await prepareCreateMapCandidate({ mapName: 'M', datasetToken: 1, classify, files: [{ file: fakeFile('same.txt'), relativePath: 'A/same.txt' }, { file: fakeFile('same.txt'), relativePath: 'B/same.txt' }] });
  assert.equal(allowed.ok, true);
});
test('title-only selection creates exactly one structural root; a selected empty folder remains valid', async () => {
  const titleOnly = await prepareCreateMapCandidate({ mapName: 'Solo', datasetToken: 1 });
  assert.equal(titleOnly.ok, true); assert.equal(titleOnly.tree.name, 'Solo'); assert.equal(titleOnly.tree.kind, 'folder'); assert.deepEqual(titleOnly.tree.children, []); assert.deepEqual(titleOnly.stats, { nodeCount: 1, folderCount: 1, fileCount: 0, totalBytes: 0, classificationCount: 0 }); assert.equal(titleOnly.registry.size, 0);
  const empty = await prepareCreateMapCandidate({ mapName: 'M', datasetToken: 1, classify, folders: ['Empty'] });
  assert.equal(empty.ok, true);
  assert.equal(empty.tree.children[0].kind, 'folder');
  assert.deepEqual(empty.tree.children[0].children, []);
});
test('node, per-file, and total-byte limits reject without partial registry retention', async () => {
  const files = Array.from({ length: 300 }, (_, i) => ({ file: fakeFile(i + '.txt', 1), relativePath: i + '.txt' }));
  const nodeLimit = await prepareCreateMapCandidate({ mapName: 'M', datasetToken: 2, classify, files });
  assert.equal(nodeLimit.reason, 'node-limit');
  const perFile = await prepareCreateMapCandidate({ mapName: 'M', datasetToken: 2, classify, files: [{ file: fakeFile('big.bin', 5), relativePath: 'big.bin' }], maxFileBytes: 4 });
  assert.equal(perFile.reason, 'attachment-too-large');
  const total = await prepareCreateMapCandidate({ mapName: 'M', datasetToken: 2, classify, files: [{ file: fakeFile('a', 4), relativePath: 'a' }, { file: fakeFile('b', 4), relativePath: 'b' }], maxTotalBytes: 5 });
  assert.equal(total.reason, 'attachment-total-limit');
});
test('stale selection and classification failure release candidate attachments', async () => {
  let current = true;
  const stale = await prepareCreateMapCandidate({ mapName: 'M', datasetToken: 3, isCurrent: () => current, classify, files: [{ file: fakeFile('a.txt'), relativePath: 'a.txt' }] });
  assert.equal(stale.ok, true);
  current = false;
  const aborted = await prepareCreateMapCandidate({ mapName: 'M', datasetToken: 3, isCurrent: () => current, classify, files: [{ file: fakeFile('a.txt'), relativePath: 'a.txt' }] });
  assert.equal(aborted.reason, 'stale-selection');
  const failed = await prepareCreateMapCandidate({ mapName: 'M', datasetToken: 3, classify: async () => { throw new Error('bad prefix'); }, files: [{ file: fakeFile('a.txt'), relativePath: 'a.txt' }] });
  assert.equal(failed.reason, 'classification-failed');
});test('imported files start with description:null and require one on subsequent Edit Data', async () => {
  const prepared = await prepareCreateMapCandidate({ mapName: 'M', datasetToken: 9, classify, files: [{ file: fakeFile('a.txt'), relativePath: 'a.txt' }] });
  const node = prepared.tree.children[0];
  assert.equal(node.data.description, null);
  const missing = validateDataEdit({ tree: prepared.tree, targetId: node.id, draftName: 'a.txt', description: null });
  assert.equal(missing.reason, 'description-required');
  const saved = validateDataEdit({ tree: prepared.tree, targetId: node.id, draftName: 'a.txt', description: 'Added later' });
  assert.equal(saved.ok, true);
});


