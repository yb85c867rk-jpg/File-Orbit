import test from 'node:test';
import assert from 'node:assert/strict';
import { performUploadInstallation } from '../../../src/engine/hypertree/editor/action.js';
import { createInternalPolicyContext } from '../../../src/engine/hypertree/edition/context.js';

function makeFlat492() {
  const children = [];
  for (let i = 0; i < 84; i += 1) children.push({ id: 'cm-1-' + (i + 1), name: 'folder-' + i, kind: 'folder', data: { description: null }, children: [] });
  for (let i = 0; i < 407; i += 1) children.push({ id: 'cm-1-' + (1000 + i), name: 'file-' + i + '.txt', kind: 'file', data: { description: null }, children: [] });
  return { id: 'cm-1-0', name: 'Large Upload', kind: 'folder', data: { description: null }, children };
}

test('actual Upload preparation failure captures effective R240 config and failing root', () => {
  const tree = makeFlat492();
  const result = performUploadInstallation({
    tree,
    candidateTree: tree,
    parentId: 'cm-1-0',
    baseRevision: 0,
    policyContext: createInternalPolicyContext({ edition: 'paid' }),
    maxNodes: 1000,
    viewport: { width: 1900, height: 870 },
    baseRadiusCss: 365,
    diagnosticSource: { comparisonMode: true, requestedProjectionRadius: 480 }
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'preparation-failed');
  assert.match(result.message, /Editor preparation failed/);
  assert.equal(result.diagnostics.candidate.nodeCount, 492);
  assert.equal(result.diagnostics.candidate.rootChildCount, 491);
  assert.equal(result.diagnostics.failingParent.id, 'cm-1-0');
  assert.equal(result.diagnostics.failingParent.depth, 0);
  assert.equal(result.diagnostics.failingParent.directChildCount, 491);
  assert.equal(result.diagnostics.layout.requestedExperiment, null);
  assert.equal(result.diagnostics.layout.effectiveReferenceProjectionRadiusCss, 240);
  assert.equal(result.diagnostics.layout.effective.referenceProjectionRadiusCss, 240);
  assert.equal(result.diagnostics.layout.workspaceScale, 16);
  assert.equal(result.diagnostics.layout.attemptCount, 61);
  assert.equal(result.diagnostics.required, 9.048013422611318);
  assert.equal(result.diagnostics.available, 6.283185307179586);
});
