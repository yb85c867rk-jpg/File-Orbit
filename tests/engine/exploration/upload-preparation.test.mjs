import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareUploadAddition } from '../../../src/engine/hypertree/exploration/upload-preparation.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';
import { createInternalPolicyContext } from '../../../src/engine/hypertree/edition/context.js';

class FileLike {
  constructor(name, bytes = [1], type = 'text/plain') {
    this.name = name; this.bytes = new Uint8Array(bytes); this.size = this.bytes.length; this.type = type;
  }
  slice(start = 0, end = this.size) { return { arrayBuffer: async () => this.bytes.slice(start, end).buffer }; }
}
const classify = async () => ({ format: 'text', badge: 'TXT', confidence: 'synthetic', needsReview: false, reason: 'synthetic', extension: 'txt', mime: 'text/plain', classifier: 'test' });
const folder = (id, name, children = []) => ({ id, name, kind: 'folder', data: { description: null }, children });
const fileNode = (id, name) => ({ id, name, kind: 'file', data: { dataType: 'file', description: null } });
function makeTree(extra = []) { return folder('root', 'Root', [folder('target', 'Target'), ...extra]); }
function count(tree) { let n = 0; const stack = [tree]; while (stack.length) { const node = stack.pop(); n += 1; for (const c of node.children || []) stack.push(c); } return n; }
function request(tree, overrides = {}) {
  const destinationId = overrides.destinationId ?? 'target';
  return { tree, datasetToken: 1, revision: 2, expectedDatasetToken: 1, expectedRevision: 2, destinationId, expectedDestinationId: destinationId, classify, ...overrides };
}
function ids(tree) { const out = []; const s = [tree]; while (s.length) { const n = s.pop(); out.push(n.id); for (const c of n.children || []) s.push(c); } return out; }
function dispose(result) { result.dispose(); assert.equal(result.disposed, true); }

test('multiple local files are added directly beneath the destination', async () => {
  const tree = makeTree();
  const result = await prepareUploadAddition(request(tree, { files: [{ file: new FileLike('a.txt', [1]), relativePath: 'a.txt' }, { file: new FileLike('b.md', [2]), relativePath: 'b.md' }] }));
  assert.equal(result.ok, true);
  const target = result.candidateTree.children.find((node) => node.id === 'target');
  assert.deepEqual(target.children.map((node) => node.name), ['a.txt', 'b.md']);
  assert.equal(result.summary.addedFileCount, 2);
  assert.equal(result.summary.addedFolderCount, 0);
  assert.equal(result.candidateTree.children[0].id, 'target');
  assert.equal(JSON.stringify(tree), JSON.stringify(makeTree()));
  dispose(result);
});

test('multiple files under a nested destination preserve full hidden tree', async () => {
  const tree = folder('root', 'Root', [folder('target', 'Target', [folder('inner', 'Inner', [folder('hidden', 'Hidden')])])]);
  const result = await prepareUploadAddition(request(tree, { destinationId: 'inner', files: [{ file: new FileLike('one.txt', [3]), relativePath: 'one.txt' }, { file: new FileLike('two.txt', [4]), relativePath: 'two.txt' }] }));
  assert.equal(result.ok, true);
  const inner = result.candidateTree.children[0].children[0];
  assert.equal(inner.id, 'inner');
  assert.deepEqual(inner.children.slice(1).map((node) => node.name), ['one.txt', 'two.txt']);
  assert.equal(JSON.stringify(result.candidateTree).includes('"id":"hidden"'), true);
  dispose(result);
});

test('a selected source folder remains a child with its hierarchy and empty folders', async () => {
  const tree = makeTree();
  const result = await prepareUploadAddition(request(tree, {
    sourceFolderName: 'Uploads',
    files: [{ file: new FileLike('deep.txt', [5]), relativePath: 'Deep/Nested/deep.txt' }],
    folders: ['Deep/Empty', 'Another/Empty']
  }));
  assert.equal(result.ok, true);
  const uploads = result.candidateTree.children.find((node) => node.id === 'target').children.find((node) => node.name === 'Uploads');
  assert.ok(uploads);
  assert.equal(uploads.children.map((node) => node.name).includes('Deep'), true);
  assert.equal(result.summary.sourceFolderIncluded, true);
  assert.equal(result.summary.emptyFoldersIncluded, 2);
  assert.equal(result.summary.addedFolderCount, 6);
  assert.equal(result.summary.addedFileCount, 1);
  dispose(result);
});

test('an explicitly empty source folder is retained', async () => {
  const result = await prepareUploadAddition(request(makeTree(), { sourceFolderName: 'Empty Upload' }));
  assert.equal(result.ok, true);
  assert.equal(result.summary.addedFolderCount, 1);
  assert.equal(result.summary.addedFileCount, 0);
  assert.equal(result.summary.emptyFoldersIncluded, 1);
  const target = result.candidateTree.children.find((node) => node.id === 'target');
  assert.equal(target.children[0].name, 'Empty Upload');
  dispose(result);
});

test('same-named files in different folders keep distinct bytes and attachment IDs', async () => {
  const result = await prepareUploadAddition(request(makeTree(), {
    sourceFolderName: 'Source',
    files: [
      { file: new FileLike('same.txt', [10, 11]), relativePath: 'A/same.txt' },
      { file: new FileLike('same.txt', [20, 21]), relativePath: 'B/same.txt' }
    ]
  }));
  assert.equal(result.ok, true);
  const files = result.addition.nodes.filter((node) => node.kind === 'file');
  assert.equal(files.length, 2);
  assert.notEqual(files[0].attachmentId, files[1].attachmentId);
  const first = result.attachmentRegistry.get(files[0].attachmentId);
  const second = result.attachmentRegistry.get(files[1].attachmentId);
  assert.deepEqual([...first.file.bytes], [10, 11]);
  assert.deepEqual([...second.file.bytes], [20, 21]);
  assert.equal(result.addition.nodes.filter((node) => node.name === 'same.txt').length, 2);
  dispose(result);
});

test('Korean and zero-byte attachments preserve metadata', async () => {
  const result = await prepareUploadAddition(request(makeTree(), {
    sourceFolderName: '한글 폴더',
    files: [{ file: new FileLike('빈 파일.txt', [], 'text/plain'), relativePath: '빈 파일.txt' }]
  }));
  assert.equal(result.ok, true);
  const node = result.addition.nodes.find((entry) => entry.kind === 'file');
  assert.equal(node.name, '빈 파일.txt');
  assert.equal(node.attachmentId.startsWith('att-1-'), true);
  const record = result.attachmentRegistry.get(node.attachmentId);
  assert.equal(record.sizeBytes, 0);
  assert.equal(record.metadata.originalName, '빈 파일.txt');
  assert.equal(record.metadata.mime, 'text/plain');
  assert.equal(result.candidateTree.children[0].children[0].name, '한글 폴더');
  dispose(result);
});

test('sibling and case-normalized collisions reject the whole request with paths', async () => {
  const tree = folder('root', 'Root', [folder('target', 'Target', [fileNode('old', 'Alpha.txt')])]);
  const result = await prepareUploadAddition(request(tree, { files: [{ file: new FileLike('alpha.TXT'), relativePath: 'alpha.TXT' }] }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'name-collision');
  assert.equal(result.path, 'alpha.TXT');
  const duplicate = await prepareUploadAddition(request(makeTree(), { files: [{ file: new FileLike('x.txt'), relativePath: 'A/x.txt' }, { file: new FileLike('X.TXT'), relativePath: 'a/X.TXT' }] }));
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, 'name-collision');
});

test('node IDs and attachment bindings are unique and exact', async () => {
  const tree = makeTree([fileNode('existing', 'existing.txt')]);
  const result = await prepareUploadAddition(request(tree, { sourceFolderName: 'New', files: [{ file: new FileLike('x.txt'), relativePath: 'x.txt' }, { file: new FileLike('y.txt'), relativePath: 'y.txt' }] }));
  assert.equal(result.ok, true);
  const all = ids(result.candidateTree);
  assert.equal(new Set(all).size, all.length);
  const added = result.addition.nodes;
  assert.equal(added.length, 3);
  for (const node of added) {
    assert.equal(all.includes(node.id), true);
    assert.equal(all.filter((id) => id === node.id).length, 1);
  }
  const files = added.filter((node) => node.kind === 'file');
  assert.equal(files.length, 2);
  for (const node of files) {
    const staged = result.addition.attachments.find((entry) => entry.attachmentId === node.attachmentId);
    assert.ok(staged);
    assert.equal(staged.originalName, node.attachmentId === files[0].attachmentId ? 'x.txt' : 'y.txt');
  }
  dispose(result);
});

test('free 300-node boundary accepts one file at exactly 300 and rejects a folder that would make 301', async () => {
  const existing = [];
  for (let i = 0; i < 297; i += 1) existing.push(fileNode('f' + i, 'existing-' + i + '.txt'));
  const tree = folder('root', 'Root', [folder('target', 'Target'), ...existing]);
  assert.equal(count(tree), 299);
  const accepted = await prepareUploadAddition(request(tree, { files: [{ file: new FileLike('last.txt'), relativePath: 'last.txt' }] }));
  assert.equal(accepted.ok, true);
  assert.equal(accepted.summary.resultingNodeCount, 300);
  dispose(accepted);
  const rejected = await prepareUploadAddition(request(tree, { sourceFolderName: 'Pack', files: [{ file: new FileLike('one.txt'), relativePath: 'one.txt' }] }));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'node-limit');
  assert.equal(rejected.existingNodeCount, 299);
  assert.equal(rejected.addedNodeCount, 2);
  assert.equal(rejected.resultingNodeCount, 301);
});

test('internal paid policy admits 1000 nodes and rejects 1001', async () => {
  const paid = createInternalPolicyContext({ edition: 'paid' });
  const under = []; for (let i = 0; i < 997; i += 1) under.push(fileNode('p' + i, 'p' + i + '.txt'));
  const underTree = folder('root', 'Root', [folder('target', 'Target'), ...under]);
  assert.equal(count(underTree), 999);
  const accepted = await prepareUploadAddition(request(underTree, { policyContext: paid, files: [{ file: new FileLike('last.txt'), relativePath: 'last.txt' }] }));
  assert.equal(accepted.ok, true);
  assert.equal(accepted.summary.resultingNodeCount, 1000);
  dispose(accepted);
  const over = []; for (let i = 0; i < 998; i += 1) over.push(fileNode('q' + i, 'q' + i + '.txt'));
  const overTree = folder('root', 'Root', [folder('target', 'Target'), ...over]);
  assert.equal(count(overTree), 1000);
  const rejected = await prepareUploadAddition(request(overTree, { policyContext: paid, files: [{ file: new FileLike('last.txt'), relativePath: 'last.txt' }] }));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'node-limit');
  assert.equal(rejected.limit, 1000);
});

test('oversized files and combined attachment usage reject atomically', async () => {
  const tooLarge = await prepareUploadAddition(request(makeTree(), { files: [{ file: new FileLike('big.bin', [1, 2, 3]), relativePath: 'big.bin' }], maxFileBytes: 2 }));
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.reason, 'attachment-too-large');
  const live = createAttachmentRegistry({ datasetToken: 1 });
  live.stage(new FileLike('live.bin', [1, 2, 3, 4, 5]), { format: 'generic' });
  const total = await prepareUploadAddition(request(makeTree(), { registry: live, files: [{ file: new FileLike('two.bin', [6, 7]), relativePath: 'two.bin' }], maxTotalBytes: 6 }));
  assert.equal(total.ok, false);
  assert.equal(total.reason, 'attachment-total-limit');
  assert.equal(live.totalBytes, 5);
});

test('missing, file, and stale destinations are rejected', async () => {
  const missing = await prepareUploadAddition(request(makeTree(), { destinationId: 'nope' }));
  assert.equal(missing.reason, 'destination-not-found');
  const tree = folder('root', 'Root', [fileNode('file', 'single.txt')]);
  const notFolder = await prepareUploadAddition(request(tree, { destinationId: 'file' }));
  assert.equal(notFolder.reason, 'destination-not-folder');
  const staleDataset = await prepareUploadAddition(request(makeTree(), { expectedDatasetToken: 9 }));
  assert.equal(staleDataset.reason, 'stale-dataset');
  const staleRevision = await prepareUploadAddition(request(makeTree(), { expectedRevision: 9 }));
  assert.equal(staleRevision.reason, 'stale-revision');
  const staleDestination = await prepareUploadAddition(request(makeTree(), { expectedDestinationId: 'other' }));
  assert.equal(staleDestination.reason, 'stale-destination');
});

test('cancellation during classification releases staging and preserves inputs', async () => {
  let cancelled = false;
  const tree = makeTree();
  const before = JSON.stringify(tree);
  const result = await prepareUploadAddition(request(tree, {
    files: [{ file: new FileLike('a.txt'), relativePath: 'a.txt' }, { file: new FileLike('b.txt'), relativePath: 'b.txt' }],
    isCurrent: () => !cancelled,
    classify: async () => { cancelled = true; return classify(); }
  }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale-operation');
  assert.equal(result.stale, true);
  assert.equal(JSON.stringify(tree), before);
});

test('source tree and live registry are unchanged on success and failure', async () => {
  const live = createAttachmentRegistry({ datasetToken: 1 });
  const existing = live.stage(new FileLike('live.txt', [9]), { format: 'text' });
  live.commit(existing.id);
  const tree = makeTree([fileNode('existing-file', 'live.txt')]);
  tree.children[1].data.attachmentId = existing.id;
  const treeBefore = JSON.stringify(tree); const registryBefore = JSON.stringify(live.snapshot());
  const ok = await prepareUploadAddition(request(tree, { registry: live, files: [{ file: new FileLike('new.txt', [1]), relativePath: 'new.txt' }] }));
  assert.equal(ok.ok, true);
  assert.equal(JSON.stringify(tree), treeBefore);
  assert.equal(JSON.stringify(live.snapshot()), registryBefore);
  dispose(ok);
  assert.equal(live.has(existing.id), true);
  const bad = await prepareUploadAddition(request(tree, { registry: live, files: [{ file: new FileLike('bad.bin', [1, 2, 3]), relativePath: 'bad.bin' }], maxFileBytes: 2 }));
  assert.equal(bad.ok, false);
  assert.equal(JSON.stringify(tree), treeBefore);
  assert.equal(JSON.stringify(live.snapshot()), registryBefore);
});

test('dispose is idempotent and releases only the staging registry', async () => {
  const live = createAttachmentRegistry({ datasetToken: 1 });
  const owned = live.stage(new FileLike('owned.txt', [1]), { format: 'text' });
  live.commit(owned.id);
  const result = await prepareUploadAddition(request(makeTree(), { registry: live, files: [{ file: new FileLike('staged.txt', [2]), relativePath: 'staged.txt' }] }));
  assert.equal(result.ok, true);
  assert.equal(result.attachmentRegistry.size, 1);
  assert.notEqual(result.addition.attachments[0].attachmentId, owned.id);
  assert.equal(result.dispose(), true);
  assert.equal(result.dispose(), false);
  assert.equal(result.attachmentRegistry.size, 0);
  assert.equal(live.has(owned.id), true);
  assert.equal(live.totalBytes, 1);
});

test('empty upload and duplicate paths reject without touching the source', async () => {
  const empty = await prepareUploadAddition(request(makeTree()));
  assert.equal(empty.reason, 'empty-upload');
  const duplicate = await prepareUploadAddition(request(makeTree(), { files: [{ file: new FileLike('x.txt'), relativePath: 'same/x.txt' }, { file: new FileLike('x.txt'), relativePath: 'same/X.TXT' }] }));
  assert.equal(duplicate.reason, 'name-collision');
  assert.match(duplicate.path, /same\//);
});

test('caller-declared incomplete folder listing and classification failures reject atomically', async () => {
  const tree = makeTree();
  const before = JSON.stringify(tree);
  const partial = await prepareUploadAddition(request(tree, { files: [{ file: new FileLike('x.txt'), relativePath: 'x.txt' }], folderListingComplete: false }));
  assert.equal(partial.ok, true);
  assert.equal(partial.summary.folderListingComplete, false);
  assert.equal(partial.summary.emptyFoldersIncluded, 0);
  dispose(partial);
  let calls = 0;
  const failed = await prepareUploadAddition(request(tree, {
    files: [{ file: new FileLike('a.txt'), relativePath: 'a.txt' }, { file: new FileLike('b.txt'), relativePath: 'b.txt' }],
    classify: async () => { calls += 1; if (calls === 2) throw new Error('classification unavailable'); return classify(); }
  }));
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'classification-failed');
  assert.equal(JSON.stringify(tree), before);
});

test('uploads exceeding the editor depth limit reject', async () => {
  let node = folder('leaf', 'Leaf');
  for (let i = 0; i < 64; i += 1) node = folder('d' + i, 'D' + i, [node]);
  const tree = folder('root', 'Root', [node]);
  const result = await prepareUploadAddition({ tree, datasetToken: 1, revision: 0, expectedDatasetToken: 1, expectedRevision: 0, destinationId: 'leaf', classify, files: [{ file: new FileLike('x.txt'), relativePath: 'Deploy/x.txt' }] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'depth-limit');
});
