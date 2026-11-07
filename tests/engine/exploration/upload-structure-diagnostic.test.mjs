import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUploadStructureDiagnostic } from '../../harness/m5-exploration/upload-structure-diagnostic.js';

const node = (id, name, kind, children = [], data = {}) => ({ id, name, kind, data, children });

test('structure diagnostic exports synthetic hierarchy and no private upload data', () => {
  const candidate = node('actual-root', 'Secret Root Name', 'folder', [
    node('actual-folder-a', 'Private Client', 'folder', [
      node('actual-file-a', 'contract.pdf', 'file', [], { description: 'confidential', attachmentId: 'att-secret', dataType: 'file' })
    ]),
    node('actual-file-b', 'notes.txt', 'file', [], { description: 'private notes' })
  ], { description: 'root secret' });
  const diagnostics = {
    code: 'experimental-v2-infeasible',
    message: 'no workspace scale for actual-root',
    layout: {
      comparisonMode: true,
      requestedProjectionRadiusCss: 480,
      effectiveReferenceProjectionRadiusCss: 480,
      glyphRadiusCss: 6,
      clearanceCss: 4,
      workspaceScale: 16,
      attemptCount: 61,
      candidateCount: 61
    },
    failingParent: { id: 'actual-root', depth: 0, directChildCount: 2 },
    required: 9.5,
    available: 6.283185307179586
  };
  const result = buildUploadStructureDiagnostic({
    preparation: { candidateTree: candidate }, diagnostics, source: { appModule: 'main.mjs' }
  });
  assert.equal(result.candidate.nodeCount, 4);
  assert.equal(result.candidate.folderCount, 2);
  assert.equal(result.candidate.fileCount, 2);
  assert.equal(result.candidate.maxDepth, 2);
  assert.equal(result.candidate.rootChildCount, 2);
  assert.equal(result.failingParent.syntheticId, 'n0');
  assert.equal(result.failingParent.actualIdIncluded, false);
  assert.equal(result.failingParent.depth, 0);
  assert.equal(result.failingParent.directChildCount, 2);
  assert.equal(result.layout.effectiveReferenceProjectionRadiusCss, 480);
  assert.equal(result.diagnostic.required, 9.5);
  assert.equal(result.diagnostic.available, 6.283185307179586);
  assert.deepEqual(result.nodes.map((entry) => [entry.id, entry.parentId, entry.kind, entry.depth]), [
    ['n0', null, 'folder', 0],
    ['n1', 'n0', 'folder', 1],
    ['n2', 'n1', 'file', 2],
    ['n3', 'n0', 'file', 1]
  ]);
  const serialized = JSON.stringify(result);
  for (const secret of ['actual-root', 'actual-folder-a', 'actual-file-a', 'actual-file-b', 'Secret Root Name', 'Private Client', 'contract.pdf', 'notes.txt', 'confidential', 'private notes', 'att-secret', 'root secret']) {
    assert.equal(serialized.includes(secret), false, `diagnostic leaked ${secret}`);
  }
});
