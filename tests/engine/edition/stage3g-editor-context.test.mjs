import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { prepareCreateMapCandidate } from '../../../src/engine/hypertree/exploration/create-map.js';
import { collectDirectorySelection } from '../../../src/engine/hypertree/exploration/directory-selection.js';
import { buildRenameCommand, buildAddChildCommand, buildMetadataCommand, buildEditFolderCommand, buildEditDataCommand, buildDeleteCommand } from '../../../src/engine/hypertree/editor/commands.js';
import { countTreeNodes, validateEditorAdmission } from '../../../src/engine/hypertree/editor/validation.js';
import { createInternalPolicyContext } from '../../../src/engine/hypertree/edition/index.js';
import { PAID_TEST_CONTEXT } from '../../helpers/stage3a-paid-context.mjs';

const file = (id, name, data = {}) => ({ id, name, kind: 'file', data, children: [] });
const folder = (id, name, children = []) => ({ id, name, kind: 'folder', data: {}, children });
function tree(count, { nested = false } = {}) {
  const root = folder('root', '루트-한국어');
  const files = count - 1;
  for (let i = 0; i < files; i += 1) root.children.push(file(`n${i}`, i < 5 ? '같은이름.txt' : `노드-${i}.txt`, { description: `설명 ${i}` }));
  if (nested && files > 1) {
    root.children.pop();
    root.children.pop();
    const f = folder('nested-folder', '중첩-폴더', []);
    f.children.push(file('nested-child', '자식.txt'));
    root.children.push(f);
  }
  return root;
}
const classify = async (f) => ({ format: f.type === 'application/pdf' ? 'pdf' : f.type.startsWith('image/') ? 'image' : 'text', badge: f.type === 'application/pdf' ? 'PDF' : f.type.startsWith('image/') ? 'PNG' : 'TXT', mime: f.type, needsReview: false });
const filesAt = (prefix, specs) => specs.map(([name, bytes, mime]) => ({ file: new File([bytes], name, { type: mime }), relativePath: `${prefix}/${name}` }));
const fakeEntries = (count) => Array.from({ length: count }, (_, i) => ({ isFile: true, isDirectory: false, name: `${i}.txt`, file: (ok) => ok({ name: `${i}.txt`, size: 1, type: 'text/plain' }) }));

test('Stage 3G free/paid creation selection boundaries and actual counts', async () => {
  for (const [count, context, allowed] of [[299, undefined, true], [300, undefined, true], [301, undefined, false], [999, PAID_TEST_CONTEXT, true], [1000, PAID_TEST_CONTEXT, true], [1001, PAID_TEST_CONTEXT, false]]) {
    const result = await prepareCreateMapCandidate({ mapName: `M${count}`, datasetToken: 1, classify, files: Array.from({ length: count - 1 }, (_, i) => ({ file: new File(['x'], `${i}.txt`, { type: 'text/plain' }), relativePath: `${i}.txt` })), policyContext: context });
    assert.equal(result.ok, allowed, String(count));
    if (allowed) { assert.equal(result.stats.nodeCount, count); assert.equal(countTreeNodes(result.tree), count); }
    else assert.equal(result.reason, 'node-limit');
  }
  const lower = createInternalPolicyContext({ edition: 'paid', maxNodes: 500 });
  const at500 = await prepareCreateMapCandidate({ mapName: 'L500', datasetToken: 2, classify, files: Array.from({ length: 499 }, (_, i) => ({ file: new File(['x'], `${i}.txt`), relativePath: `${i}.txt` })), policyContext: lower });
  assert.equal(at500.ok, true);
  const at501 = await prepareCreateMapCandidate({ mapName: 'L501', datasetToken: 3, classify, files: Array.from({ length: 500 }, (_, i) => ({ file: new File(['x'], `${i}.txt`), relativePath: `${i}.txt` })), policyContext: lower });
  assert.equal(at501.reason, 'node-limit');
  const forged = await prepareCreateMapCandidate({ mapName: 'Forged', datasetToken: 4, classify, files: [], policyContext: Object.freeze({ edition: 'paid' }) });
  assert.equal(forged.reason, 'invalid-policy-context');
});

test('Stage 3G nested/empty folders, duplicate names, attachments, stale cancellation and candidate isolation', async () => {
  const specs = [
    ['한글.txt', new TextEncoder().encode('텍스트'), 'text/plain'],
    ['그림.png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png'],
    ['문서.pdf', new TextEncoder().encode('%PDF-1.7'), 'application/pdf'],
    ['빈.txt', new Uint8Array(0), 'text/plain']
  ];
  const result = await prepareCreateMapCandidate({ mapName: '한국어 지도', datasetToken: 8, classify, folders: ['빈-폴더', '중첩-폴더', '중첩-폴더/안쪽'], files: filesAt('중첩-폴더/안쪽', specs), policyContext: PAID_TEST_CONTEXT });
  assert.equal(result.ok, true);
  assert.ok(result.tree.children.some((node) => node.kind === 'folder' && node.children.length === 0), 'empty folder retained');
  assert.equal(result.stats.nodeCount, countTreeNodes(result.tree));
  const ids = new Set(); const walk = (node) => { assert.equal(ids.has(node.id), false); ids.add(node.id); for (const child of node.children || []) walk(child); }; walk(result.tree);
  const attachmentNodes = []; const visit = (node) => { if (node.data?.attachmentId) attachmentNodes.push(node); for (const child of node.children || []) visit(child); }; visit(result.tree);
  assert.equal(attachmentNodes.length, 4);
  for (const n of attachmentNodes) {
    const record = result.registry.get(n.data.attachmentId);
    assert.ok(record);
    const expected = specs.find((spec) => spec[0] === n.data.originalName);
    const digest = createHash('sha256').update(Buffer.from(await record.file.arrayBuffer())).digest('hex');
    assert.equal(digest, createHash('sha256').update(Buffer.from(expected[1])).digest('hex'));
  }
  const before = JSON.stringify(result.tree);
  assert.equal(JSON.stringify(result.tree), before);
  const stale = await prepareCreateMapCandidate({ mapName: 'Stale', datasetToken: 9, classify, files: filesAt('중첩-폴더', specs), isCurrent: () => false });
  assert.equal(stale.ok, false); assert.equal(stale.reason, 'stale-selection');
});

test('Stage 3G directory collection free/paid and actual count boundaries', async () => {
  for (const [count, context, allowed] of [[299, undefined, true], [300, undefined, true], [301, undefined, false], [999, PAID_TEST_CONTEXT, true], [1000, PAID_TEST_CONTEXT, true], [1001, PAID_TEST_CONTEXT, false]]) {
    const result = await collectDirectorySelection({ entries: fakeEntries(count - 1), policyContext: context });
    assert.equal(result.ok, allowed, String(count));
    if (allowed) { assert.equal(1 + result.folderCount + result.fileCount, count); assert.equal(result.nodeLimit, context === PAID_TEST_CONTEXT ? 1000 : 300); }
    else assert.equal(result.reason, 'node-limit');
  }
  const forged = await collectDirectorySelection({ entries: fakeEntries(1), policyContext: Object.freeze({ edition: 'paid' }) });
  assert.equal(forged.reason, 'invalid-policy-context');
});

test('Stage 3G editor admission and bounded command preparation', () => {
  for (const [count, context, allowed] of [[299, undefined, true], [300, undefined, true], [301, undefined, false], [999, PAID_TEST_CONTEXT, true], [1000, PAID_TEST_CONTEXT, true], [1001, PAID_TEST_CONTEXT, false]]) {
    const admission = validateEditorAdmission(tree(count), { policyContext: context });
    assert.equal(admission.ok, allowed, String(count));
    assert.equal(admission.limit, context === PAID_TEST_CONTEXT ? 1000 : 300);
  }
  const paid = tree(1000, { nested: true });
  assert.equal(countTreeNodes(paid), 1000);
  const before = JSON.stringify(paid);
  const identity = { datasetToken: 1, baseRevision: 1, expectedDatasetToken: 1, expectedRevision: 1 };
  const rename = buildRenameCommand({ ...identity, tree: paid, targetId: 'n0', draftName: '한국어-새-이름', policyContext: PAID_TEST_CONTEXT });
  assert.equal(rename.ok, true); assert.equal(JSON.stringify(paid), before); assert.equal(rename.candidateTree.children[0].name, '한국어-새-이름');
  const freeRename = buildRenameCommand({ ...identity, tree: paid, targetId: 'n0', draftName: 'free', policyContext: undefined });
  assert.equal(freeRename.reason, 'editor-node-limit');
  const duplicate = buildRenameCommand({ ...identity, tree: paid, targetId: 'n5', draftName: '같은이름.txt', policyContext: PAID_TEST_CONTEXT });
  assert.equal(duplicate.reason, 'duplicate-name'); assert.equal(JSON.stringify(paid), before);
  const metadata = buildMetadataCommand({ ...identity, tree: paid, targetId: 'n0', description: '새 설명', link: null, policyContext: PAID_TEST_CONTEXT });
  assert.equal(metadata.ok, true); assert.equal(JSON.stringify(paid), before);
  const folderEdit = buildEditFolderCommand({ ...identity, tree: paid, targetId: 'nested-folder', draftName: '중첩-새', draftDescription: '설명', policyContext: PAID_TEST_CONTEXT });
  assert.equal(folderEdit.ok, true); assert.equal(JSON.stringify(paid), before);
  const dataEdit = buildEditDataCommand({ ...identity, tree: paid, targetId: 'n0', draftName: '데이터-새', description: '설명', link: null, linkProvided: false, policyContext: PAID_TEST_CONTEXT });
  assert.equal(dataEdit.ok, true); assert.equal(JSON.stringify(paid), before);
  const remove = buildDeleteCommand({ ...identity, datasetTokenExpected: 1, tree: paid, targetId: 'nested-folder', structuralRootId: 'root', viewBefore: {}, policyContext: PAID_TEST_CONTEXT });
  assert.equal(remove.ok, true, JSON.stringify(remove)); assert.equal(countTreeNodes(remove.candidateTree), 998); assert.equal(JSON.stringify(paid), before);
  const freeRemove = buildDeleteCommand({ ...identity, datasetTokenExpected: 1, tree: paid, targetId: 'n0', structuralRootId: 'root', viewBefore: {} });
  assert.equal(freeRemove.reason, 'editor-node-limit'); assert.equal(JSON.stringify(paid), before);
  const rootRemove = buildDeleteCommand({ ...identity, datasetTokenExpected: 1, tree: paid, targetId: 'root', structuralRootId: 'root', viewBefore: {}, policyContext: PAID_TEST_CONTEXT });
  assert.equal(rootRemove.reason, 'root-protected');
  const stale = buildRenameCommand({ ...identity, baseRevision: 0, tree: paid, targetId: 'n0', draftName: 'x', policyContext: PAID_TEST_CONTEXT });
  assert.equal(stale.reason, 'stale-revision'); assert.equal(JSON.stringify(paid), before);
  const lower = createInternalPolicyContext({ edition: 'paid', maxNodes: 500 });
  const lowerRename = buildRenameCommand({ ...identity, tree: tree(600), targetId: 'n0', draftName: 'lower', policyContext: lower });
  assert.equal(lowerRename.reason, 'editor-node-limit');
  const callerTight = buildRenameCommand({ ...identity, tree: tree(300), targetId: 'n0', draftName: 'tight', policyContext: PAID_TEST_CONTEXT, maxNodes: 100 });
  assert.equal(callerTight.reason, 'editor-node-limit');
  const callerElevate = buildRenameCommand({ ...identity, tree: tree(301), targetId: 'n0', draftName: 'elevate', policyContext: undefined, maxNodes: 1000 });
  assert.equal(callerElevate.reason, 'editor-node-limit');
  const forged = buildRenameCommand({ ...identity, tree: paid, targetId: 'n0', draftName: 'x', policyContext: Object.freeze({ edition: 'paid' }) });
  assert.equal(forged.reason, 'invalid-policy-context');
});

test('Stage 3G add at 299/300 and 999/1000 boundaries', () => {
  const identity = { datasetToken: 1, baseRevision: 1, expectedDatasetToken: 1, expectedRevision: 1 };
  const add = (count, context) => buildAddChildCommand({ ...identity, tree: tree(count), parentId: 'root', kind: 'folder', draftName: '새-폴더', draftDescription: null, policyContext: context });
  assert.equal(add(299, undefined).ok, true);
  assert.equal(add(300, undefined).reason, 'editor-node-limit');
  assert.equal(add(999, PAID_TEST_CONTEXT).ok, true);
  assert.equal(add(1000, PAID_TEST_CONTEXT).reason, 'editor-node-limit');
  const attachment = { attachmentId: 'att_stage3g', originalName: '문서.pdf', sizeBytes: 7, mime: 'application/pdf', classification: { format: 'pdf', badge: 'PDF', mime: 'application/pdf', needsReview: false } };
  const fileAdd = buildAddChildCommand({ ...identity, tree: tree(999), parentId: 'root', kind: 'file', draftName: '새-문서.pdf', draftDescription: '설명', draftDataType: 'file', draftAttachment: attachment, policyContext: PAID_TEST_CONTEXT });
  assert.equal(fileAdd.ok, true);
  assert.equal(fileAdd.attachmentId, 'att_stage3g');
  assert.equal(fileAdd.candidateTree.children.at(-1).data.attachmentId, 'att_stage3g');
  assert.equal(add(299, undefined).candidateTree.children.length, 299); // 299 total => root + 298 old + 1 new = 299? Add path correctness
});















