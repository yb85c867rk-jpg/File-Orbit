import test from 'node:test';
import assert from 'node:assert/strict';
import { createLabelOverlay } from '../../../src/engine/hypertree/render/index.js';

class FakeElement {
  constructor(doc, tag) { this.ownerDocument = doc; this.tagName = tag; this.children = []; this.parentNode = null; this.style = {}; this.attributes = new Map(); this._text = ''; this.offsetWidth = 0; this.offsetHeight = 0; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { const index = this.children.indexOf(child); if (index >= 0) this.children.splice(index, 1); child.parentNode = null; return child; }
  addEventListener() {}
  set textContent(value) { this._text = String(value); this.offsetWidth = Math.min(60, Math.max(20, this._text.length * 7)); this.offsetHeight = 16; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  getBoundingClientRect() {
    if (this.attributes.has('data-vd-label-id')) {
      this.ownerDocument.measureCount += 1;
      const width = this.children.reduce((sum, child) => sum + (child.offsetWidth || 0), 0) + 3 * Math.max(0, this.children.length - 1);
      const height = Math.max(...this.children.map((child) => child.offsetHeight || 0), 0);
      return { left: Number.parseFloat(this.style.left) || 0, top: Number.parseFloat(this.style.top) || 0, width, height };
    }
    return { width: this.offsetWidth || 0, height: this.offsetHeight || 0 };
  }
}
function host(width = 800, height = 600) {
  const doc = { measureCount: 0, createElement(tag) { return new FakeElement(doc, tag); } };
  const element = { ownerDocument: doc, clientWidth: width, clientHeight: height, children: [], appendChild(child) { child.parentNode = this; this.children.push(child); return child; }, removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; } };
  return { doc, host: element };
}
function childNodes() {
  const nodes = [];
  for (let i = 0; i < 40; i += 1) nodes.push({ id: `child-${String(i).padStart(2, '0')}`, kind: 'file', depth: 2, center: { x: 1000 + i * 5, y: 100 }, radius: 3, visible: true, opacity: 1 });
  const inside = [[5, 180], [250, 180], [550, 180], [795, 180], [5, 450], [250, 450], [550, 450], [795, 450]];
  for (let i = 0; i < 8; i += 1) nodes.push({ id: `child-${String(40 + i).padStart(2, '0')}`, kind: 'file', depth: 2, center: { x: inside[i][0], y: inside[i][1] }, radius: 3, visible: true, opacity: 1 });
  return nodes;
}
function sceneFor(nodes) { return { rootId: 'root', nodes: new Map([['root', { id: 'root', kind: 'folder', depth: 0, center: { x: 400, y: 50 }, radius: 8, visible: true, opacity: 1 }], ['technical', { id: 'technical', kind: 'folder', depth: 1, center: { x: 400, y: 100 }, radius: 6, visible: true, opacity: 1 }], ...nodes.map((node) => [node.id, node])]), edges: [] }; }
function presentationFor(nodes) { return new Map([['root', { name: 'Root', kind: 'folder' }], ['technical', { name: 'technical', kind: 'folder' }], ...nodes.map((node) => [node.id, { name: node.id + '.txt', kind: 'file', dataType: 'file' }])]); }
function priorityFor(nodes) { return ['root', 'technical', ...nodes.map((node) => node.id)]; }
function visible(metrics) { return [...metrics.labels].filter(([, group]) => group.style.display === 'flex'); }

test('viewport eligibility is applied before the 40-label budget', () => {
  const { doc, host: labelHost } = host();
  const nodes = childNodes();
  const overlay = createLabelOverlay(labelHost, { maxLabels: 40, maxWidth: 70, placement: 'around' });
  const metrics = overlay.update({ scene: sceneFor(nodes), presentation: presentationFor(nodes), priorityIds: priorityFor(nodes), rootId: 'root' });
  assert.equal(metrics.candidateCount, 50);
  assert.equal(metrics.viewportEligibleCount, 10);
  assert.equal(metrics.viewportIneligibleCount, 40);
  assert.equal(metrics.createdCount, 10);
  assert.equal(doc.measureCount, 20);
  assert.equal(metrics.labels.has('child-07'), false);
  for (let i = 40; i < 48; i += 1) assert.equal(metrics.labels.has(`child-${String(i).padStart(2, '0')}`), true);
  for (const id of ['root', 'technical', 'child-40', 'child-41', 'child-42', 'child-43', 'child-44', 'child-45', 'child-46', 'child-47']) {
    assert.equal(visible(metrics).some(([labelId]) => labelId === id), true, `${id} should be visible`);
  }
  overlay.destroy();
});

test('all four viewport edges accept visible glyphs with feasible labels and reject distant controls', () => {
  const { doc, host: labelHost } = host(500, 400);
  const nodes = [
    { id: 'left', kind: 'file', depth: 2, center: { x: -10, y: 200 }, radius: 12, visible: true, opacity: 1 },
    { id: 'right', kind: 'file', depth: 2, center: { x: 510, y: 200 }, radius: 12, visible: true, opacity: 1 },
    { id: 'top', kind: 'file', depth: 2, center: { x: 250, y: -10 }, radius: 12, visible: true, opacity: 1 },
    { id: 'bottom', kind: 'file', depth: 2, center: { x: 250, y: 410 }, radius: 12, visible: true, opacity: 1 },
    { id: 'off-left', kind: 'file', depth: 2, center: { x: -100, y: 200 }, radius: 12, visible: true, opacity: 1 },
    { id: 'off-right', kind: 'file', depth: 2, center: { x: 600, y: 200 }, radius: 12, visible: true, opacity: 1 },
    { id: 'off-top', kind: 'file', depth: 2, center: { x: 250, y: -100 }, radius: 12, visible: true, opacity: 1 },
    { id: 'off-bottom', kind: 'file', depth: 2, center: { x: 250, y: 500 }, radius: 12, visible: true, opacity: 1 }
  ];
  const root = { id: 'root', kind: 'folder', depth: 0, center: { x: 250, y: 100 }, radius: 8, visible: true, opacity: 1 };
  const tech = { id: 'technical', kind: 'folder', depth: 1, center: { x: 250, y: 140 }, radius: 6, visible: true, opacity: 1 };
  const scene = { rootId: 'root', nodes: new Map([['root', root], ['technical', tech], ...nodes.map((node) => [node.id, node])]), edges: [] };
  const p = new Map([['root', { name: 'Root', kind: 'folder' }], ['technical', { name: 'technical', kind: 'folder' }], ...nodes.map((node) => [node.id, { name: node.id + '.txt', kind: 'file', dataType: 'file' }])]);
  const priority = ['root', 'technical', ...nodes.map((node) => node.id)];
  const overlay = createLabelOverlay(labelHost, { maxLabels: 40, maxWidth: 70, placement: 'around' });
  const metrics = overlay.update({ scene, presentation: p, priorityIds: priority, rootId: 'root' });
  assert.equal(metrics.viewportEligibleCount, 6);
  assert.equal(metrics.viewportIneligibleCount, 4);
  assert.equal(metrics.createdCount, 6);
  for (const id of ['left', 'right', 'top', 'bottom']) {
    assert.equal(metrics.labels.has(id), true, id + ' should be eligible');
    assert.equal(visible(metrics).some(([labelId]) => labelId === id), true, id + ' label should display');
  }
  for (const id of ['off-left', 'off-right', 'off-top', 'off-bottom']) assert.equal(metrics.labels.has(id), false, id + ' should be excluded');
  const final = overlay.beginTransition({ scene, presentation: p, priorityIds: priority, rootId: 'root' });
  assert.equal(final.viewportEligibleCount, 6);
  const completed = overlay.completeTransition({ scene, presentation: p, priorityIds: priority, rootId: 'root' });
  for (const id of ['left', 'right', 'top', 'bottom']) assert.equal(visible(completed).some(([labelId]) => labelId === id), true, id + ' transition label should display');
  overlay.destroy();
});

test('pan/zoom eligibility changes which filenames are created and removes stale labels', () => {
  const { host: labelHost } = host();
  const nodes = childNodes();
  const overlay = createLabelOverlay(labelHost, { maxLabels: 40, maxWidth: 70, placement: 'around' });
  overlay.update({ scene: sceneFor(nodes), presentation: presentationFor(nodes), priorityIds: priorityFor(nodes), rootId: 'root' });
  const moved = nodes.map((node, index) => index < 40 ? { ...node, center: { x: 50 + (index % 4) * 200, y: 180 + Math.floor(index / 4) * 100 } } : { ...node, center: { x: 1000 + index * 5, y: 100 } });
  const metrics = overlay.update({ scene: sceneFor(moved), presentation: presentationFor(moved), priorityIds: priorityFor(moved), rootId: 'root' });
  assert.ok(metrics.labels.has('child-00'));
  assert.equal(metrics.labels.has('child-47'), false);
  assert.equal(visible(metrics).some(([id]) => id === 'child-47'), false);
  overlay.destroy();
});

test('transition completion uses the same viewport eligibility', () => {
  const { host: labelHost } = host();
  const nodes = childNodes();
  const overlay = createLabelOverlay(labelHost, { maxLabels: 40, maxWidth: 70, placement: 'around' });
  overlay.beginTransition({ scene: sceneFor(nodes), presentation: presentationFor(nodes), priorityIds: priorityFor(nodes), rootId: 'root' });
  const final = overlay.completeTransition({ scene: sceneFor(nodes), presentation: presentationFor(nodes), priorityIds: priorityFor(nodes), rootId: 'root' });
  assert.equal(final.viewportEligibleCount, 10);
  assert.equal(final.viewportIneligibleCount, 40);
  assert.equal(final.labels.has('child-40'), true);
  assert.equal(final.labels.has('child-47'), true);
  assert.equal(final.labels.has('child-00'), false);
  overlay.destroy();
});
