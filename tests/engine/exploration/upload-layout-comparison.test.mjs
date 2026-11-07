import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';

function makeLargeUploadTree() {
  const children = [];
  for (let folderIndex = 0; folderIndex < 84; folderIndex += 1) {
    children.push({ id: 'cm-1-' + (folderIndex + 1), name: 'folder-' + String(folderIndex + 1).padStart(2, '0'), kind: 'folder', data: { description: null }, children: [] });
  }
  for (let fileIndex = 0; fileIndex < 407; fileIndex += 1) {
    children.push({ id: 'cm-1-' + (1000 + fileIndex), name: 'file-' + fileIndex + '.txt', kind: 'file', data: { description: null }, children: [] });
  }
  return { id: 'cm-1-0', name: 'Large Upload', kind: 'folder', data: { description: null }, children };
}

test('synthetic 84-folder/407-file upload reproduces R240 clearance failure and R480 success', () => {
  const tree = makeLargeUploadTree();
  const graph = loadTree(tree).graph;
  assert.equal(graph.nodes.size, 492);
  assert.equal(graph.nodes.get('cm-1-0').adjacencies.size, 491);

  let failure = null;
  try {
    stageExperimentalV2Layout(graph, { rootId: 'cm-1-0', phases: ['current'], nodeOptions: { overridable: true } });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure, 'default R240 layout must reproduce the reported clearance failure');
  assert.equal(failure.code, 'experimental-v2-infeasible');
  assert.equal(failure.diagnostics.satisfied, false);
  assert.equal(failure.diagnostics.referenceProjectionRadiusCss, 240);
  assert.equal(failure.diagnostics.workspaceScale, 16);
  assert.equal(failure.diagnostics.maxWorkspaceScale, 16);
  assert.equal(failure.diagnostics.attemptCount, 61);
  const unsatisfied = failure.diagnostics.unsatisfied.find((entry) => entry.parentId === 'cm-1-0');
  assert.ok(unsatisfied);
  assert.ok(Math.abs(unsatisfied.required - 9.048013422611318) < 1e-12);
  assert.ok(Math.abs(unsatisfied.available - Math.PI * 2) < 1e-12);
  assert.ok(unsatisfied.required > unsatisfied.available);

  const accepted = stageExperimentalV2Layout(graph, {
    rootId: 'cm-1-0', phases: ['current'], nodeOptions: { overridable: true },
    experimentV2: { referenceProjectionRadiusCss: 480 }
  });
  assert.equal(accepted.feasibility.satisfied, true);
  assert.equal(accepted.feasibility.referenceProjectionRadiusCss, 480);
  assert.equal(accepted.feasibility.workspaceScale, 11.75);
  assert.equal(accepted.maxDepth, 1);
  assert.equal(accepted.nodeCount, 492);
  assert.equal(accepted.experiment.config.glyphRadiusCss, 6);
  assert.equal(accepted.experiment.config.clearanceCss, 4);
  assert.equal(accepted.experiment.config.referenceProjectionRadiusCss, 480);
  assert.ok(accepted.feasibility.unsatisfied.length === 0);
});
