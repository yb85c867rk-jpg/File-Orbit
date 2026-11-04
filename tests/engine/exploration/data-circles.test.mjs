import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExplorationPresentation } from '../../../src/engine/hypertree/exploration/presentation.js';
import { applyFixedGlyphPolicy } from '../../../src/engine/hypertree/layout/index.js';
import { createHitSnapshot, hitTestNode } from '../../../src/engine/hypertree/interaction/index.js';
import { drawGraphScene } from '../../../src/engine/hypertree/render/index.js';
import { classifyLabelPresentation, EXPLORATION_LABEL_PALETTE } from '../../../src/engine/hypertree/render/label-classification.js';

function graphAndLayout() {
  const graph = { nodes: new Map([
    ['r', { id: 'r', kind: 'folder', data: {} }],
    ['a', { id: 'a', kind: 'folder', data: {} }],
    ['pdf', { id: 'pdf', kind: 'file', data: { dataType: 'file', classification: { format: 'pdf' } } }],
    ['md', { id: 'md', kind: 'file', data: { dataType: 'file', classification: { format: 'markdown' } } }],
    ['img', { id: 'img', kind: 'file', data: { dataType: 'file', classification: { format: 'generic', mime: 'image/png' } } }],
    ['web', { id: 'web', kind: 'file', data: { dataType: 'web-link' } }],
    ['legacy', { id: 'legacy', kind: 'file', data: {} }]
  ]) };
  const baseLayout = { rootId: 'r', depths: new Map([['r', 0], ['a', 1], ['pdf', 1], ['md', 1], ['img', 1], ['web', 1], ['legacy', 1]]) };
  return { graph, baseLayout };
}
test('all exploration data nodes use green radius-4 circles; folders keep depth radii/colors', () => {
  const { graph, baseLayout } = graphAndLayout();
  const p = buildExplorationPresentation({ baseLayout, graph });
  for (const id of ['pdf', 'md', 'img', 'web', 'legacy']) {
    assert.equal(p.radii.get(id), 4);
    assert.equal(p.styles.get(id).shape, 'circle');
    assert.equal(p.styles.get(id).fill, '#22C55E');
  }
  assert.equal(p.radii.get('r'), 12);
  assert.equal(p.styles.get('r').fill, '#F8FAFC');
  assert.equal(p.radii.get('a'), 9.6);
  assert.equal(p.styles.get('a').fill, '#D1D5DB');
});
test('final scene and hit snapshot agree on data circle shape, center, radius', () => {
  const { graph, baseLayout } = graphAndLayout();
  const p = buildExplorationPresentation({ baseLayout, graph });
  const scene = { rootId: 'r', nodes: new Map([
    ['r', { id: 'r', kind: 'folder', shape: 'circle', visible: true, center: { x: 0, y: 0 }, radius: 1 }],
    ['pdf', { id: 'pdf', kind: 'file', shape: 'diamond', visible: true, center: { x: 20, y: 0 }, radius: 1 }]
  ]), edges: [] };
  const finalScene = applyFixedGlyphPolicy(scene, { radii: p.radii, styles: p.styles });
  const pdf = finalScene.nodes.get('pdf');
  assert.equal(pdf.shape, 'circle');
  assert.equal(pdf.radius, 4);
  assert.equal(pdf.fill, '#22C55E');
  const hit = createHitSnapshot(finalScene);
  const hitPdf = hit.nodes.find((node) => node.id === 'pdf');
  assert.deepEqual({ shape: hitPdf.shape, radius: hitPdf.radius, center: hitPdf.center }, { shape: 'circle', radius: 4, center: pdf.center });
  assert.equal(hitTestNode(hit, pdf.center), 'pdf');
});
test('exploration label palette colors data green but keeps folder icons default and PDF badge red', () => {
  const folder = classifyLabelPresentation({ kind: 'folder', name: 'Folder' }, { palette: EXPLORATION_LABEL_PALETTE });
  assert.equal(folder.icon, 'folder');
  assert.notEqual(folder.color, '#22C55E');
  const pdf = classifyLabelPresentation({ kind: 'file', name: 'x', dataType: 'file', classification: { format: 'pdf' } }, { palette: EXPLORATION_LABEL_PALETTE });
  assert.equal(pdf.color, '#F87171'); assert.equal(pdf.badgeColor, '#F87171');
  const md = classifyLabelPresentation({ kind: 'file', name: 'x', dataType: 'file', classification: { format: 'markdown', badge: 'MD' } }, { palette: EXPLORATION_LABEL_PALETTE });
  assert.equal(md.color, '#22C55E'); assert.equal(md.badgeColor, '#22C55E');
});



