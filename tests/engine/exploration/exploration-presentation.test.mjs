import test from 'node:test';
import assert from 'node:assert/strict';
import { folderRadiusForDepth, buildExplorationPresentation, EXPLORATION_COLORS } from '../../../src/engine/hypertree/exploration/presentation.js';
import { applyFixedGlyphPolicy } from '../../../src/engine/hypertree/layout/index.js';
import { f20 } from '../layout/fixtures.mjs';
import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import { createExplorationModel } from '../../../src/engine/hypertree/exploration/navigation-model.js';
import { prepareExplorationFrame } from '../../../src/engine/hypertree/exploration/frame.js';
import { EXPERIMENTAL_CAMERA_LIMITS } from '../../../src/engine/hypertree/navigation/index.js';

test('folder radii follow exact original-depth policy with minimum', () => {
  assert.equal(folderRadiusForDepth(0), 12);
  assert.equal(folderRadiusForDepth(1), 9.6);
  assert.equal(folderRadiusForDepth(2), 7.68);
  assert.equal(folderRadiusForDepth(20), 4);
  assert.equal(EXPLORATION_COLORS.root, '#F8FAFC');
  assert.equal(EXPLORATION_COLORS.folderDepth1, '#D1D5DB');
  assert.equal(EXPLORATION_COLORS.folderDeep, '#B8BEC7');
  assert.equal(EXPLORATION_COLORS.data, '#22C55E');
  assert.equal(EXPLORATION_COLORS.pdf, '#F87171');
  assert.equal(EXPLORATION_COLORS.edge, '#454B54');
});
test('styles distinguish root/folders and PDF by stored classification, not display name', () => {
  const graph = { nodes: new Map([
    ['r', { id: 'r', kind: 'folder', data: {} }],
    ['f1', { id: 'f1', kind: 'folder', data: {} }],
    ['empty', { id: 'empty', kind: 'folder', data: {} }],
    ['pdf', { id: 'pdf', kind: 'file', data: { dataType: 'file', classification: { format: 'pdf' } } }],
    ['renamed', { id: 'renamed', kind: 'file', data: { dataType: 'file', classification: { format: 'text' } } }],
    ['web', { id: 'web', kind: 'file', data: { dataType: 'web-link' } }]
  ]) };
  const baseLayout = { rootId: 'r', depths: new Map([['r', 0], ['f1', 1], ['empty', 2], ['pdf', 1], ['renamed', 1], ['web', 1]]) };
  const p = buildExplorationPresentation({ baseLayout, graph });
  assert.equal(p.radii.get('r'), 12);
  assert.equal(p.radii.get('f1'), 9.6);
  assert.equal(p.radii.get('empty'), 7.68);
  assert.equal(p.styles.get('r').fill, '#F8FAFC');
  assert.equal(p.styles.get('f1').fill, '#D1D5DB');
  assert.equal(p.styles.get('empty').fill, '#B8BEC7');
  assert.equal(p.styles.get('pdf').fill, '#22C55E'); assert.equal(p.styles.get('pdf').shape, 'circle');
  assert.equal(p.styles.get('renamed').fill, '#22C55E');
  assert.equal(p.styles.get('web').fill, '#22C55E');
});
test('fixed policy applies per-node radii and styles without camera scaling', () => {
  const scene = { nodes: new Map([['r', { id: 'r', radius: 1 }], ['f', { id: 'f', radius: 1 }]]), edges: [], rootId: 'r' };
  const radii = new Map([['r', 12], ['f', 9.6]]);
  const styles = new Map([['r', { fill: '#F8FAFC', stroke: '#F8FAFC' }], ['f', { fill: '#D1D5DB', stroke: '#D1D5DB' }]]);
  const out = applyFixedGlyphPolicy(scene, { radii, styles });
  assert.equal(out.nodes.get('r').radius, 12);
  assert.equal(out.nodes.get('f').radius, 9.6);
  assert.equal(out.nodes.get('r').fill, '#F8FAFC');
  assert.equal(out.presentationPolicy.variableRadiusCss, true);
});
test('F20 frame, hit, and fit consume actual per-depth radii and remain contained', () => {
  const viewport = { width: 1100, height: 473 };
  const tree = f20(); const { graph } = loadTree(tree);
  const staged = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, { viewport, padding: 24, phase: 'current', projectionBaseRadiusCss: 198.66 }).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: tree.id, phase: 'current' });
  const prepared = prepareExplorationFrame({ graph, baseLayout, view: model.view(), viewport, baseRadiusCss: 198.66, fit: true, camera: null, framing: 'manual', cameraLimits: EXPERIMENTAL_CAMERA_LIMITS });
  const root = prepared.scene.nodes.get(tree.id);
  assert.equal(root.radius, 12);
  const depth1 = [...prepared.scene.nodes.values()].find((node) => node.kind === 'folder' && node.id !== tree.id && baseLayout.depths.get(node.id) === 1);
  assert.equal(depth1.radius, 9.6);
  assert.equal(prepared.containment.contained, true);
  for (const hitNode of prepared.hit.nodes) {
    const sceneNode = prepared.scene.nodes.get(hitNode.id);
    assert.equal(hitNode.radius, sceneNode.radius);
  }
});



