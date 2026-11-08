import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeleteStructureDiagnostic } from '../../harness/m5-exploration/upload-structure-diagnostic.js';

test('delete diagnostic exports synthetic before/candidate topology without private data', () => {
  const tree = {
    id: 'actual-root', name: 'Secret Root', kind: 'folder', data: { description: 'secret' },
    children: [{
      id: 'actual-folder', name: 'Private Folder', kind: 'folder', data: { description: 'secret folder' },
      children: [{ id: 'actual-file', name: 'private.pdf', kind: 'file', data: { description: 'secret file', attachmentId: 'att-secret' }, children: [] }]
    }]
  };
  const diagnostic = buildDeleteStructureDiagnostic({
    tree, targetId: 'actual-folder', targetName: 'Private Folder', counts: { folders: 1, files: 1 },
    diagnostics: { code: 'experimental-v2-infeasible', layout: { referenceProjectionRadiusCss: 480 }, failingParent: { id: 'actual-folder', depth: 1, directChildCount: 1 }, required: 0.5, available: 0.2 },
    source: { buildId: 'test' }
  });
  assert.equal(diagnostic.schema, 'fileorbit-delete-structure-diagnostic-v1');
  assert.equal(diagnostic.operation.beforeNodeCount, 3);
  assert.equal(diagnostic.operation.candidateNodeCount, 1);
  assert.equal(diagnostic.operation.deletedFolders, 1);
  assert.equal(diagnostic.operation.deletedFiles, 1);
  assert.equal(diagnostic.operation.targetSyntheticId, 'n1');
  assert.equal(diagnostic.before.length, 3);
  assert.equal(diagnostic.candidate.length, 1);
  assert.equal(diagnostic.diagnostic.failingParent.syntheticId, 'n1');
  const serialized = JSON.stringify(diagnostic);
  for (const secret of ['actual-root', 'actual-folder', 'actual-file', 'Secret Root', 'Private Folder', 'private.pdf', 'att-secret', 'secret']) {
    assert.equal(serialized.includes(secret), false, `delete diagnostic leaked ${secret}`);
  }
});
