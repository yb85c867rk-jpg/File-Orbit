import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';

const fixture = JSON.parse(readFileSync(new URL('../../fixtures/large-map/upload-anonymized-492-structure.json', import.meta.url), 'utf8'));

export function buildAnonymizedTree(nodes = fixture.nodes) {
  const children = new Map(nodes.map((node) => [node.id, []]));
  for (const node of nodes) if (node.parentId) children.get(node.parentId).push(node.id);
  const build = (id) => {
    const node = nodes.find((entry) => entry.id === id);
    return {
      id: node.id,
      name: node.kind + '-' + node.id,
      kind: node.kind,
      data: { description: null },
      children: children.get(id).map(build)
    };
  };
  return build('n0');
}

test('anonymized 492-node Upload reproduces the n153 shortfall without descendant-aware allocation', () => {
  const tree = buildAnonymizedTree();
  const graph = loadTree(tree).graph;
  assert.equal(graph.nodes.size, 492);
  let failure = null;
  try {
    stageExperimentalV2Layout(graph, {
      rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true },
      experimentV2: { referenceProjectionRadiusCss: 480 }
    });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure);
  assert.equal(failure.code, 'experimental-v2-infeasible');
  assert.equal(failure.diagnostics.referenceProjectionRadiusCss, 480);
  assert.equal(failure.diagnostics.workspaceScale, 16);
  assert.equal(failure.diagnostics.attemptCount, 61);
  const unsatisfied = failure.diagnostics.unsatisfied.find((entry) => entry.parentId === 'n153');
  assert.ok(unsatisfied);
  assert.equal(unsatisfied.required, 0.049280487493726446);
  assert.equal(unsatisfied.available, 0.022111091882192735);
});

test('descendant-aware allocation preserves hierarchy and satisfies every parent at R480', () => {
  const tree = buildAnonymizedTree();
  const staged = stageExperimentalV2Layout(loadTree(tree).graph, {
    rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true },
    experimentV2: { referenceProjectionRadiusCss: 480, descendantAwareClearance: true }
  });
  assert.equal(staged.nodeCount, 492);
  assert.equal(staged.maxDepth, 7);
  assert.equal(staged.feasibility.satisfied, true);
  assert.equal(staged.feasibility.unsatisfied.length, 0);
  assert.equal(staged.experiment.config.referenceProjectionRadiusCss, 480);
  assert.equal(staged.experiment.config.descendantAwareClearance, true);
  assert.equal(staged.nodes.size, 492);
  for (const [parentId, childIds] of staged.children) {
    if (childIds.length === 0) continue;
    const parent = staged.nodes.get(parentId);
    let cursor = parent.angleSpan.begin;
    for (const childId of childIds) {
      const child = staged.nodes.get(childId);
      assert.ok(child.angleSpan.end > child.angleSpan.begin, childId);
      assert.ok(Math.abs(child.angleSpan.begin - cursor) < 1e-9, childId);
      cursor = child.angleSpan.end;
    }
    assert.ok(Math.abs(cursor - parent.angleSpan.end) < 1e-9, parentId);
  }
  assert.ok(staged.nodes.get('n153').angleSpan.end - staged.nodes.get('n153').angleSpan.begin >= 0.049280487493726446 - 1e-12);
});
