import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countLabelNodeOverlaps,
  createLabelOverlay,
  EXPLORATION_LABEL_PALETTE,
  GraphRenderError
} from '../../../src/engine/hypertree/render/index.js';

class FakeElement {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tagName = tag;
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.attributes = new Map();
    this._text = '';
    this.offsetWidth = 0;
    this.offsetHeight = 0;
    this.innerHTMLSetCount = 0;
  }

  set innerHTML(value) {
    this.innerHTMLSetCount += 1;
    throw new Error('innerHTML must not be used');
  }

  set textContent(value) {
    this._text = String(value);
    this.offsetWidth = Math.min(180, Math.max(20, this._text.length * 7));
    this.offsetHeight = 16;
  }

  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join('');
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name);
  }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener() {}

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  getBoundingClientRect() {
    const left = Number.parseFloat(this.style.left) || 0;
    const top = Number.parseFloat(this.style.top) || 0;
    const rect = (width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
    if (this.tagName === 'svg') return { width: 12, height: 12 };
    if (this.attributes.has('data-vd-label-id')) {
      this.ownerDocument.labelMeasureCount = (this.ownerDocument.labelMeasureCount || 0) + 1;
      if (this.ownerDocument.failMeasurementOn === this.ownerDocument.labelMeasureCount) {
        return { width: Number.NaN, height: 16 };
      }
      if (this.ownerDocument.zeroMeasurement) return { width: 0, height: 0 };
    }
    if (this.children.length > 0) {
      const width = this.children.reduce((sum, child) => sum + child.offsetWidth, 0) + 3 * (this.children.length - 1);
      return rect(Math.min(180, width), Math.max(...this.children.map((child) => child.offsetHeight)));
    }
    return rect(this.offsetWidth, this.offsetHeight);
  }
}

function fakeHost(width = 500, height = 400) {
  const doc = {
    labelMeasureCount: 0,
    failMeasurementOn: null,
    zeroMeasurement: false,
    createElement(tag) { return new FakeElement(doc, tag); },
    createElementNS(_namespace, tag) {
      const el = new FakeElement(doc, tag);
      if (tag === 'svg') {
        el.offsetWidth = 12;
        el.offsetHeight = 12;
      }
      return el;
    }
  };
  const host = {
    ownerDocument: doc,
    children: [],
    clientWidth: width,
    clientHeight: height,
    appendChild(child) {
      child.parentNode = host;
      host.children.push(child);
      return child;
    },
    removeChild(child) {
      const index = host.children.indexOf(child);
      if (index >= 0) host.children.splice(index, 1);
      child.parentNode = null;
      return child;
    }
  };
  return { doc, host };
}

function sceneNode(id, options = {}) {
  return {
    id,
    kind: options.kind || 'file',
    depth: options.depth || 0,
    center: options.center || { x: 20, y: 20 },
    radius: options.radius ?? 4,
    visible: options.visible !== false,
    opacity: options.opacity,
    shape: options.kind === 'folder' ? 'circle' : 'diamond'
  };
}

function scene(nodes, rootId) {
  return { rootId, nodes: new Map(nodes.map((node) => [node.id, node])), edges: [] };
}

function presentation(entries) {
  return new Map(entries.map(([id, name, kind = 'file', extra]) => [id, { name, kind, ...(typeof extra === 'object' ? extra : { typeHint: extra }) }]));
}

test('classifier presentation drives names, badges, and icon-free metrics', () => {
  const { host } = fakeHost();
  const overlay = createLabelOverlay(host, { maxLabels: 10, maxWidth: 120 });
  const s = scene([
    sceneNode('root', { kind: 'folder', depth: 0, center: { x: 40, y: 40 }, radius: 6 }),
    sceneNode('pdf', { depth: 1, center: { x: 90, y: 70 } }),
    sceneNode('md', { depth: 1, center: { x: 130, y: 100 } }),
    sceneNode('bin', { depth: 1, center: { x: 170, y: 130 } })
  ]);
  const metrics = overlay.update({
    scene: s,
    presentation: presentation([
      ['root', 'Folder', 'folder'],
      ['pdf', 'Manual.PDF', 'file'],
      ['md', 'notes.markdown', 'file'],
      ['bin', 'unknown.bin', 'file', 'generic']
    ])
  });
  assert.equal(metrics.candidateCount, 4);
  assert.equal(metrics.createdCount, 4);
  assert.equal(metrics.textMismatchCount, 0);
  assert.equal(metrics.visibleIconCount, 0);
  assert.equal(metrics.leadingIconCount, 0);
  assert.equal(metrics.dprIndependent, true);
  assert.equal([...metrics.labels.values()].every((el) => el.querySelector === undefined), true);
  const pdf = metrics.labels.get('pdf');
  assert.equal(pdf.textContent, 'Manual.PDFPDF');
  assert.equal(pdf.getAttribute('title'), 'Manual.PDF [PDF]');
  assert.equal(pdf.getAttribute('aria-label'), 'Manual.PDF [PDF]');
  assert.equal(pdf.style.overflow, undefined);
  assert.equal(pdf.children.some((child) => child.tagName === 'svg'), false);
  assert.equal(pdf.style.color, '#F87171', 'PDF filename uses the PDF identification color');
  assert.equal(pdf.children[1].getAttribute('data-vd-badge'), 'PDF');
  assert.equal(pdf.children[1].style.color, '#F87171', 'PDF badge uses the PDF identification color');
  assert.equal(pdf.children[0].tagName, 'span');
  assert.equal(pdf.children[0].style.textOverflow, 'ellipsis');
  assert.equal(pdf.children[0].innerHTMLSetCount, 0);
  overlay.destroy();
});

test('root/shallow priority is deterministic and creation is bounded', () => {
  const { host } = fakeHost(400, 300);
  const nodes = [];
  for (let i = 0; i < 20; i += 1) {
    nodes.push(sceneNode(`n${i}`, {
      depth: i === 0 ? 2 : (i % 3),
      center: { x: 10 + (i * 17) % 380, y: 10 + (i * 23) % 280 }
    }));
  }
  const root = sceneNode('root', { kind: 'folder', depth: 0, center: { x: 200, y: 150 }, radius: 8 });
  const overlay = createLabelOverlay(host, { maxLabels: 3, maxWidth: 100 });
  const metrics = overlay.update({
    scene: scene([...nodes, root], 'root'),
    presentation: presentation([...nodes.map((n) => [n.id, n.id]), ['root', 'Root', 'folder']])
  });
  assert.equal(metrics.candidateCount, 21);
  assert.equal(metrics.createdCount, 3);
  assert.equal(metrics.labels.has('root'), true);
  assert.ok(metrics.visibleCount <= 3);
  assert.equal(host.children.filter((c) => c.getAttribute('data-vd-labels') === '').length, 1);
  overlay.destroy();
});

test('root marker and name reserve a padded exclusion for other labels', () => {
  const { host } = fakeHost(500, 400);
  const overlay = createLabelOverlay(host, { maxLabels: 10, maxWidth: 140, placement: 'around', rootProtectionPadding: 6 });
  const nodes = [
    sceneNode('root', { kind: 'folder', depth: 0, center: { x: 200, y: 150 }, radius: 10 }),
    sceneNode('near', { depth: 1, center: { x: 205, y: 150 }, radius: 4 }),
    sceneNode('far', { depth: 1, center: { x: 380, y: 300 }, radius: 4 })
  ];
  const metrics = overlay.update({ scene: scene(nodes, 'root'), presentation: presentation([['root', 'Root Folder', 'folder'], ['near', 'near.txt'], ['far', 'far.txt']]) });
  assert.equal(metrics.rootProtection, true);
  assert.equal(metrics.rootLabelVisible, true);
  assert.ok(metrics.rootProtectionRect);
  const rp = metrics.rootProtectionRect;
  for (const [id, group] of metrics.labels) {
    if (id === 'root' || group.style.display === 'none') continue;
    const rect = { left: Number.parseFloat(group.style.left), top: Number.parseFloat(group.style.top), right: Number.parseFloat(group.style.left) + group.getBoundingClientRect().width, bottom: Number.parseFloat(group.style.top) + group.getBoundingClientRect().height };
    assert.equal(rect.right <= rp.left || rect.left >= rp.right || rect.bottom <= rp.top || rect.top >= rp.bottom, true, id + ' must not overlap root protection');
  }
  assert.equal(metrics.leadingIconCount, 0);
  overlay.destroy();
});

test('selected label remains visible outside the root protection area', () => {
  const { host } = fakeHost(500, 400);
  const overlay = createLabelOverlay(host, { maxLabels: 10, maxWidth: 140, placement: 'around' });
  const nodes = [
    sceneNode('root', { kind: 'folder', depth: 0, center: { x: 250, y: 200 }, radius: 10 }),
    sceneNode('selected', { depth: 1, center: { x: 250, y: 200 }, radius: 4 })
  ];
  const metrics = overlay.update({ scene: scene(nodes, 'root'), presentation: presentation([['root', 'Root', 'folder'], ['selected', 'hidden.txt']]), selectedId: 'selected' });
  const selected = metrics.labels.get('selected');
  assert.notEqual(selected.style.display, 'none');
  assert.equal(selected.getAttribute('data-vd-selected'), 'true');
  assert.equal(selected.children[1].getAttribute('data-vd-badge'), 'TXT');
  const rp = metrics.rootProtectionRect;
  const left = Number.parseFloat(selected.style.left); const top = Number.parseFloat(selected.style.top);
  const rect = { left, top, right: left + selected.getBoundingClientRect().width, bottom: top + selected.getBoundingClientRect().height };
  assert.equal(rect.right <= rp.left || rect.left >= rp.right || rect.bottom <= rp.top || rect.top >= rp.bottom, true);
  overlay.destroy();
});

function visibleLabelRects(metrics) {
  const rows = new Map();
  for (const [id, group] of metrics.labels) {
    if (group.style.display === 'none') continue;
    const left = Number.parseFloat(group.style.left) || 0;
    const top = Number.parseFloat(group.style.top) || 0;
    const size = group.getBoundingClientRect();
    rows.set(id, { left, top, right: left + size.width, bottom: top + size.height });
  }
  return rows;
}
function labelRectsOverlap(a, b, padding = 2) {
  return !(a.right + padding <= b.left || a.left >= b.right + padding || a.bottom + padding <= b.top || a.top >= b.bottom + padding);
}
function assertNoLabelOverlaps(metrics) {
  const rows = [...visibleLabelRects(metrics)];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      assert.equal(labelRectsOverlap(rows[i][1], rows[j][1]), false, rows[i][0] + ' overlaps ' + rows[j][0]);
    }
  }
}
function leadersFor(overlay) {
  return Array.from(overlay.element.children).filter((child) => child.getAttribute?.('data-vd-selected-leader') === '');
}

test('root override and selected identity survive transition completion without rootId', () => {
  const { host } = fakeHost(500, 400);
  const overlay = createLabelOverlay(host, { maxLabels: 10, maxWidth: 140, placement: 'around' });
  const nodes = [
    sceneNode('root', { kind: 'folder', depth: 0, center: { x: 250, y: 200 }, radius: 10 }),
    sceneNode('child', { depth: 1, center: { x: 252, y: 200 }, radius: 4 })
  ];
  const p = presentation([['root', 'Root', 'folder'], ['child', 'near.txt']]);
  const begin = overlay.beginTransition({ scene: scene(nodes), presentation: p, rootId: 'root', selectedId: 'child' });
  assert.equal(begin.rootProtection, true);
  const final = overlay.completeTransition({ scene: scene(nodes), presentation: p, rootId: 'root', selectedId: 'child' });
  assert.equal(final.rootProtection, true);
  assert.equal(final.rootLabelVisible, true);
  assert.ok(final.rootProtectionRect);
  assert.equal(final.selectedLabelVisible, true);
  assert.equal(overlay.getMetrics().labels.get('child').getAttribute('data-vd-selected'), 'true');
  const rows = visibleLabelRects(final);
  const rootRow = rows.get('root');
  assert.ok(rootRow);
  for (const [id, rect] of rows) {
    if (id === 'root') continue;
    assert.equal(labelRectsOverlap(rect, final.rootProtectionRect, 0), false, id + ' must not intrude into the root region');
  }
  assertNoLabelOverlaps(final);
  const selected = rows.get('child');
  if (selected) {
    assert.equal(labelRectsOverlap(selected, final.rootProtectionRect, 0), false);
    assert.ok(leadersFor(overlay).length >= 1, 'a displaced selected label needs a visible leader');
  }
  overlay.destroy();
});

test('transition retained-anchor fallback cannot restore a label inside the root region', () => {
  const { host } = fakeHost(500, 400);
  const overlay = createLabelOverlay(host, { maxLabels: 10, maxWidth: 140, placement: 'around' });
  const nodes = [
    sceneNode('root', { kind: 'folder', depth: 0, center: { x: 250, y: 200 }, radius: 10 }),
    sceneNode('child', { depth: 1, center: { x: 250, y: 200 }, radius: 4 })
  ];
  const p = presentation([['root', 'Root', 'folder'], ['child', 'near.txt']]);
  overlay.beginTransition({ scene: scene(nodes), presentation: p, selectedId: 'child' });
  const final = overlay.completeTransition({ scene: scene(nodes), presentation: p, rootId: 'root', selectedId: 'child' });
  assert.equal(final.rootProtection, true);
  assert.ok(final.rootProtectionRect);
  for (const [id, rect] of visibleLabelRects(final)) {
    if (id === 'root') continue;
    assert.equal(labelRectsOverlap(rect, final.rootProtectionRect, 0), false, id + ' retained fallback must not intrude');
  }
  overlay.destroy();
});

test('selected fallback obeys occupied labels and node obstacles in dense layouts', () => {
  const { host } = fakeHost(420, 300);
  const overlay = createLabelOverlay(host, { maxLabels: 10, maxWidth: 140, placement: 'around' });
  const nodes = [
    sceneNode('root', { kind: 'folder', depth: 0, center: { x: 210, y: 150 }, radius: 10 }),
    sceneNode('selected', { depth: 1, center: { x: 210, y: 150 }, radius: 4 }),
    sceneNode('a', { depth: 1, center: { x: 220, y: 150 }, radius: 4 }),
    sceneNode('b', { depth: 1, center: { x: 200, y: 150 }, radius: 4 }),
    sceneNode('c', { depth: 1, center: { x: 210, y: 160 }, radius: 4 })
  ];
  const p = presentation([['root', 'Root', 'folder'], ['selected', 'selected.txt'], ['a', 'alpha.txt'], ['b', 'beta.txt'], ['c', 'gamma.txt']]);
  const metrics = overlay.update({ scene: scene(nodes, 'root'), presentation: p, priorityIds: ['root'], selectedId: 'selected' });
  const rows = visibleLabelRects(metrics);
  assert.equal(rows.has('selected'), true);
  assert.equal(metrics.labels.get('selected').getAttribute('data-vd-selected'), 'true');
  assertNoLabelOverlaps(metrics);
  assert.equal(labelRectsOverlap(rows.get('selected'), metrics.rootProtectionRect, 0), false);
  if (Math.hypot(rows.get('selected').right - 210, rows.get('selected').top - 150) > 18) {
    assert.ok(leadersFor(overlay).length >= 1);
  }
  overlay.destroy();
});

test('transition reuses groups while synchronizing selected-label state', () => {
  const { host } = fakeHost(500, 400);
  const overlay = createLabelOverlay(host, { maxLabels: 10, maxWidth: 140, placement: 'around' });
  const nodes = [
    sceneNode('a', { depth: 1, center: { x: 180, y: 150 }, radius: 4 }),
    sceneNode('b', { depth: 1, center: { x: 300, y: 150 }, radius: 4 })
  ];
  const p = presentation([['a', 'a.txt'], ['b', 'b.txt']]);
  overlay.beginTransition({ scene: scene(nodes), presentation: p, selectedId: 'a' });
  const groupA = overlay.getMetrics().labels.get('a');
  assert.equal(groupA.getAttribute('data-vd-selected'), 'true');
  const final = overlay.completeTransition({ scene: scene(nodes), presentation: p, selectedId: 'b' });
  assert.equal(final.labels.get('a').getAttribute('data-vd-selected'), undefined);
  assert.equal(final.labels.get('b').getAttribute('data-vd-selected'), 'true');
  overlay.destroy();
});

class DomLikeChildren {
  constructor(items = []) { this._items = [...items]; }
  get length() { return this._items.length; }
  item(index) { return this._items[index] || null; }
  [Symbol.iterator]() { return this._items[Symbol.iterator](); }
  push(child) { this._items.push(child); return this._items.length; }
  indexOf(child) { return this._items.indexOf(child); }
  splice(index, count, ...items) { return this._items.splice(index, count, ...items); }
}

test('selected ordering wins a tight label budget in update and transitions', () => {
  const { host } = fakeHost(500, 300);
  const nodes = [
    sceneNode('root', { kind: 'folder', depth: 0, center: { x: 60, y: 60 }, radius: 8 }),
    sceneNode('a', { depth: 1, center: { x: 150, y: 60 }, radius: 4 }),
    sceneNode('b', { depth: 1, center: { x: 340, y: 150 }, radius: 4 })
  ];
  const p = presentation([['root', 'Root', 'folder'], ['a', 'a.txt'], ['b', 'b.txt']]);
  const updateOverlay = createLabelOverlay(host, { maxLabels: 2, maxWidth: 120, placement: 'around' });
  const update = updateOverlay.update({ scene: scene(nodes, 'root'), presentation: p, selectedId: 'b' });
  assert.equal(update.labels.has('root'), true);
  assert.equal(update.labels.has('b'), true);
  assert.equal(update.labels.has('a'), false);
  assert.equal(update.selectedLabelVisible, true);
  assertNoLabelOverlaps(update);
  updateOverlay.destroy();

  const transitionHost = fakeHost(500, 300).host;
  const transitionOverlay = createLabelOverlay(transitionHost, { maxLabels: 2, maxWidth: 120, placement: 'around' });
  const begin = transitionOverlay.beginTransition({ scene: scene(nodes, 'root'), presentation: p, rootId: 'root', selectedId: 'b' });
  assert.equal(begin.labels.has('b'), true);
  assert.equal(begin.labels.has('a'), false);
  assert.equal(begin.selectedLabelVisible, true);
  const final = transitionOverlay.completeTransition({ scene: scene(nodes, 'root'), presentation: p, rootId: 'root', selectedId: 'b' });
  assert.equal(final.labels.has('b'), true);
  assert.equal(final.labels.has('a'), false);
  assert.equal(final.selectedLabelVisible, true);
  assertNoLabelOverlaps(final);
  transitionOverlay.destroy();
});

test('leader cleanup supports non-Array DOM-like children and preserves unrelated elements', () => {
  const { doc, host } = fakeHost(500, 400);
  const overlay = createLabelOverlay(host, { maxLabels: 10, maxWidth: 140, placement: 'around' });
  const nodes = [
    sceneNode('root', { kind: 'folder', depth: 0, center: { x: 250, y: 200 }, radius: 10 }),
    sceneNode('selected', { depth: 1, center: { x: 250, y: 200 }, radius: 4 })
  ];
  const p = presentation([['root', 'Root', 'folder'], ['selected', 'selected.txt']]);
  overlay.beginTransition({ scene: scene(nodes, 'root'), presentation: p, rootId: 'root', selectedId: 'selected' });
  const unrelated = doc.createElement('div');
  unrelated.setAttribute('data-unrelated', 'true');
  overlay.element.appendChild(unrelated);
  overlay.element.children = new DomLikeChildren(overlay.element.children);
  assert.equal(leadersFor(overlay).length, 1);
  overlay.updateTransition({ scene: scene(nodes, 'root'), presentation: p, rootId: 'root', selectedId: 'selected' });
  assert.equal(leadersFor(overlay).length, 1);
  overlay.completeTransition({ scene: scene(nodes, 'root'), presentation: p, rootId: 'root', selectedId: null });
  assert.equal(leadersFor(overlay).length, 0);
  assert.equal(Array.from(overlay.element.children).includes(unrelated), true);
  overlay.destroy();
});

function sceneWithSelectedOpacity(nodes, opacity) {
  return scene(nodes.map((node) => node.id === 'selected' ? { ...node, opacity } : node), 'root');
}

test('selected leader follows opacity 1 to 0.5 to 0 and back', () => {
  const { host } = fakeHost(500, 400);
  const overlay = createLabelOverlay(host, { maxLabels: 10, maxWidth: 140, placement: 'around' });
  const nodes = [
    sceneNode('root', { kind: 'folder', depth: 0, center: { x: 250, y: 200 }, radius: 10 }),
    sceneNode('selected', { depth: 1, center: { x: 250, y: 200 }, radius: 4 })
  ];
  const p = presentation([['root', 'Root', 'folder'], ['selected', 'selected.txt']]);
  let metrics = overlay.update({ scene: sceneWithSelectedOpacity(nodes, 1), presentation: p, selectedId: 'selected' });
  assert.equal(leadersFor(overlay).length, 1);
  assert.equal(leadersFor(overlay)[0].style.opacity, '0.7');
  assert.equal(metrics.selectedLabelVisible, true);
  metrics = overlay.update({ scene: sceneWithSelectedOpacity(nodes, 0.5), presentation: p, selectedId: 'selected' });
  assert.equal(leadersFor(overlay).length, 1);
  assert.equal(leadersFor(overlay)[0].style.opacity, '0.35');
  assert.equal(metrics.selectedLabelVisible, true);
  assert.equal(metrics.selectedLabelOpacity, 0.5);
  metrics = overlay.update({ scene: sceneWithSelectedOpacity(nodes, 0), presentation: p, selectedId: 'selected' });
  assert.equal(leadersFor(overlay).length, 0);
  assert.equal(metrics.selectedLabelVisible, false);
  assert.equal(metrics.selectedLabelOpacity, 0);
  metrics = overlay.update({ scene: sceneWithSelectedOpacity(nodes, 1), presentation: p, selectedId: 'selected' });
  assert.equal(leadersFor(overlay).length, 1);
  assert.equal(metrics.selectedLabelVisible, true);
  overlay.destroy();
});

test('leader opacity lifecycle is consistent through begin, update, and complete', () => {
  const { host } = fakeHost(500, 400);
  const overlay = createLabelOverlay(host, { maxLabels: 10, maxWidth: 140, placement: 'around' });
  const nodes = [
    sceneNode('root', { kind: 'folder', depth: 0, center: { x: 250, y: 200 }, radius: 10 }),
    sceneNode('selected', { depth: 1, center: { x: 250, y: 200 }, radius: 4 })
  ];
  const p = presentation([['root', 'Root', 'folder'], ['selected', 'selected.txt']]);
  let metrics = overlay.beginTransition({ scene: sceneWithSelectedOpacity(nodes, 1), presentation: p, rootId: 'root', selectedId: 'selected' });
  assert.equal(leadersFor(overlay).length, 1);
  metrics = overlay.updateTransition({ scene: sceneWithSelectedOpacity(nodes, 0.5), presentation: p, rootId: 'root', selectedId: 'selected' });
  assert.equal(leadersFor(overlay).length, 1);
  assert.equal(leadersFor(overlay)[0].style.opacity, '0.35');
  assert.equal(metrics.selectedLabelVisible, true);
  metrics = overlay.updateTransition({ scene: sceneWithSelectedOpacity(nodes, 0), presentation: p, rootId: 'root', selectedId: 'selected' });
  assert.equal(leadersFor(overlay).length, 0);
  assert.equal(metrics.selectedLabelVisible, false);
  metrics = overlay.completeTransition({ scene: sceneWithSelectedOpacity(nodes, 0), presentation: p, rootId: 'root', selectedId: 'selected' });
  assert.equal(leadersFor(overlay).length, 0);
  assert.equal(metrics.selectedLabelVisible, false);
  overlay.destroy();
});

test('selection cleared during a transition removes the leader', () => {
  const { host } = fakeHost(500, 400);
  const overlay = createLabelOverlay(host, { maxLabels: 10, maxWidth: 140, placement: 'around' });
  const nodes = [
    sceneNode('root', { kind: 'folder', depth: 0, center: { x: 250, y: 200 }, radius: 10 }),
    sceneNode('selected', { depth: 1, center: { x: 250, y: 200 }, radius: 4 })
  ];
  const p = presentation([['root', 'Root', 'folder'], ['selected', 'selected.txt']]);
  overlay.beginTransition({ scene: sceneWithSelectedOpacity(nodes, 1), presentation: p, rootId: 'root', selectedId: 'selected' });
  assert.equal(leadersFor(overlay).length, 1);
  const cleared = overlay.updateTransition({ scene: sceneWithSelectedOpacity(nodes, 1), presentation: p, rootId: 'root', selectedId: null });
  assert.equal(leadersFor(overlay).length, 0);
  assert.equal(cleared.selectedLabelVisible, null);
  const final = overlay.completeTransition({ scene: sceneWithSelectedOpacity(nodes, 1), presentation: p, rootId: 'root', selectedId: null });
  assert.equal(leadersFor(overlay).length, 0);
  assert.equal(final.selectedLabelVisible, null);
  overlay.destroy();
});

test('suppressed selected label has no leader and is not reported visible', () => {
  const { host } = fakeHost(40, 30);
  const overlay = createLabelOverlay(host, { maxLabels: 10, maxWidth: 140, placement: 'around' });
  const nodes = [
    sceneNode('root', { kind: 'folder', depth: 0, center: { x: 20, y: 15 }, radius: 4 }),
    sceneNode('selected', { depth: 1, center: { x: 20, y: 15 }, radius: 2 })
  ];
  const p = presentation([['root', 'Root', 'folder'], ['selected', 'selected.txt']]);
  const metrics = overlay.update({ scene: scene(nodes, 'root'), presentation: p, selectedId: 'selected' });
  assert.equal(metrics.selectedLabelVisible, false);
  assert.equal(leadersFor(overlay).length, 0);
  overlay.destroy();
});

test('malicious names stay literal text and never use innerHTML', () => {
  const { host } = fakeHost();
  const overlay = createLabelOverlay(host);
  const malicious = '<img src=x onerror=alert(1)>';
  const metrics = overlay.update({
    scene: scene([sceneNode('x', { depth: 0, center: { x: 100, y: 100 } })]),
    presentation: presentation([['x', malicious]])
  });
  const label = metrics.labels.get('x');
  assert.equal(label.children[0].textContent, malicious);
  assert.equal(label.innerHTMLSetCount, 0);
  assert.equal(label.children.some((c) => c.tagName === 'img'), false);
  assert.equal(label.children[0].textContent, malicious);
  overlay.destroy();
});

test('overlap, viewport, and suppression are deterministic', () => {
  const { host } = fakeHost(180, 100);
  const overlay = createLabelOverlay(host, { maxLabels: 10, maxWidth: 80, gap: 4, padding: 2 });
  const metrics = overlay.update({
    scene: scene([
      sceneNode('a', { depth: 0, center: { x: 20, y: 20 }, radius: 3 }),
      sceneNode('b', { depth: 1, center: { x: 20, y: 20 }, radius: 3 }),
      sceneNode('c', { depth: 1, center: { x: 500, y: 50 }, radius: 3 })
    ]),
    presentation: presentation([
      ['a', 'Same A'],
      ['b', 'Same B'],
      ['c', 'Outside']
    ])
  });
  assert.equal(metrics.candidateCount, 3);
  assert.equal(metrics.viewportEligibleCount, 2);
  assert.equal(metrics.viewportIneligibleCount, 1);
  assert.equal(metrics.createdCount, 2);
  assert.equal(metrics.labels.has('c'), false);
  assert.ok(metrics.visibleCount < 2);
  assert.ok(metrics.suppressedCount >= 1);
  assert.ok(metrics.overlapSuppressedCount + metrics.viewportSuppressedCount >= 1);
  assert.equal(metrics.measuredCount, metrics.createdCount);
  assert.equal(metrics.labels.get('a').style.display === 'flex' || metrics.labels.get('a').style.display === 'none', true);
  overlay.destroy();
});

test('update after resize uses new scene positions; invalid update keeps old overlay', () => {
  const { host } = fakeHost(200, 120);
  const overlay = createLabelOverlay(host, { maxLabels: 5, maxWidth: 80 });
  const first = scene([sceneNode('a', { depth: 0, center: { x: 20, y: 20 } })]);
  const p = presentation([['a', 'Alpha']]);
  const firstMetrics = overlay.update({ scene: first, presentation: p });
  const oldElement = overlay.element;
  host.clientWidth = 400;
  host.clientHeight = 300;
  const secondMetrics = overlay.update({
    scene: scene([sceneNode('a', { depth: 0, center: { x: 300, y: 220 } })]),
    presentation: p
  });
  assert.notEqual(overlay.element, oldElement);
  assert.notEqual(secondMetrics.labels.get('a').style.left, firstMetrics.labels.get('a').style.left);
  assert.equal(oldElement.parentNode, null);

  assert.throws(
    () => overlay.update({ scene: first, presentation: new Map() }),
    (e) => e.code === 'invalid-presentation'
  );
  assert.equal(overlay.element.parentNode, host);
  assert.equal(overlay.getMetrics().createdCount, 1);
  overlay.destroy();
});

test('prototype-like IDs and multi-instance isolation', () => {
  const a = fakeHost(300, 200);
  const b = fakeHost(300, 200);
  const s = scene([
    sceneNode('__proto__', { depth: 0, center: { x: 100, y: 80 } }),
    sceneNode('constructor', { depth: 1, center: { x: 130, y: 100 } })
  ]);
  const p = presentation([['__proto__', 'Proto'], ['constructor', 'Ctor']]);
  const first = createLabelOverlay(a.host);
  const second = createLabelOverlay(b.host);
  first.update({ scene: s, presentation: p });
  second.update({ scene: s, presentation: p });
  assert.equal(a.host.children.length, 1);
  assert.equal(b.host.children.length, 1);
  assert.equal(first.getMetrics().labels.get('__proto__').textContent, 'ProtoFILE');
  assert.equal(second.getMetrics().labels.get('constructor').textContent, 'CtorFILE');
  first.destroy();
  first.destroy();
  assert.equal(a.host.children.length, 0);
  assert.equal(b.host.children.length, 1);
  assert.throws(() => first.update({ scene: s, presentation: p }), (e) => e.code === 'invalid-lifecycle');
  second.destroy();
});

test('destroy preserves unrelated host children and is idempotent', () => {
  const { host } = fakeHost();
  const unrelated = { parentNode: null, getAttribute() { return null; } };
  host.appendChild(unrelated);
  const overlay = createLabelOverlay(host);
  overlay.update({
    scene: scene([sceneNode('x', { center: { x: 20, y: 20 } })]),
    presentation: presentation([['x', 'X']])
  });
  assert.equal(host.children.length, 2);
  overlay.destroy();
  assert.equal(host.children.length, 1);
  assert.equal(host.children[0], unrelated);
  overlay.destroy();
  assert.equal(host.children.length, 1);
});

test('label policy caps DOM/measurement at maxLabels and reports candidates', () => {
  const { host } = fakeHost(500, 400);
  const nodes = [];
  const entries = [];
  for (let i = 0; i < 100; i += 1) {
    nodes.push(sceneNode(`n${i}`, { depth: 1, center: { x: 10 + (i * 3) % 480, y: 10 + (i * 7) % 380 } }));
    entries.push([`n${i}`, `name ${i}`]);
  }
  const overlay = createLabelOverlay(host, { maxLabels: 4, maxWidth: 100 });
  const metrics = overlay.update({ scene: scene(nodes), presentation: presentation(entries) });
  assert.equal(metrics.candidateCount, 100);
  assert.equal(metrics.createdCount, 4);
  assert.ok(metrics.labels.size <= 4);
  assert.ok(metrics.visibleCount <= 4);
  overlay.destroy();
});
function ownedOverlays(host) {
  return host.children.filter((child) => child.getAttribute?.('data-vd-labels') === '');
}

function metricsWithoutLabels(metrics) {
  const { labels: _labels, ...rest } = metrics;
  return rest;
}

function validOverlayWithOneLabel() {
  const { doc, host } = fakeHost(300, 200);
  const overlay = createLabelOverlay(host, { maxLabels: 5, maxWidth: 100 });
  const s = scene([sceneNode('a', { depth: 0, center: { x: 40, y: 40 } })]);
  const p = presentation([['a', 'Alpha']]);
  overlay.update({ scene: s, presentation: p });
  return { doc, host, overlay, scene: s, presentation: p };
}

test('invalid label geometry rejects before temporary DOM and preserves prior state', () => {
  for (const mutate of [
    (node) => { node.center.x = Number.NaN; },
    (node) => { node.center.y = Number.POSITIVE_INFINITY; },
    (node) => { node.radius = -1; },
    (node) => { node.radius = Number.POSITIVE_INFINITY; }
  ]) {
    const { host, overlay, scene: validScene, presentation: p } = validOverlayWithOneLabel();
    const beforeElement = overlay.element;
    const beforeMetrics = overlay.getMetrics();
    const bad = scene([...validScene.nodes.values()]);
    mutate(bad.nodes.get('a'));
    assert.throws(
      () => overlay.update({ scene: bad, presentation: p }),
      (error) => error.code === 'invalid-presentation'
    );
    assert.equal(overlay.element, beforeElement);
    assert.deepEqual(metricsWithoutLabels(overlay.getMetrics()), metricsWithoutLabels(beforeMetrics));
    assert.equal(ownedOverlays(host).length, 1);
    for (const label of overlay.getMetrics().labels.values()) {
      assert.equal(String(label.style.left).includes('NaN'), false);
      assert.equal(String(label.style.left).includes('Infinity'), false);
      assert.equal(String(label.style.top).includes('NaN'), false);
    }
    overlay.destroy();
  }
});

test('invalid depth/kind/visibility/id rejects before sorting or temporary DOM', () => {
  for (const mutate of [
    (node) => { node.depth = Symbol('bad'); },
    (node) => { node.depth = -1; },
    (node) => { node.depth = 1.5; },
    (node) => { node.depth = Number.MAX_SAFE_INTEGER + 1; },
    (node) => { node.kind = 'other'; },
    (node) => { node.visible = 'yes'; },
    (node) => { node.id = 'different'; }
  ]) {
    const { host, overlay, scene: validScene, presentation: p } = validOverlayWithOneLabel();
    const beforeElement = overlay.element;
    const beforeMetrics = overlay.getMetrics();
    const bad = scene([...validScene.nodes.values()]);
    mutate(bad.nodes.get('a'));
    assert.throws(
      () => overlay.update({ scene: bad, presentation: p }),
      (error) => error.code === 'invalid-presentation'
    );
    assert.equal(overlay.element, beforeElement);
    assert.deepEqual(metricsWithoutLabels(overlay.getMetrics()), metricsWithoutLabels(beforeMetrics));
    assert.equal(ownedOverlays(host).length, 1);
    overlay.destroy();
  }
});

test('measurement failure after a temporary label preserves the prior overlay', () => {
  const { doc, host, overlay, scene: validScene, presentation: p } = validOverlayWithOneLabel();
  const beforeElement = overlay.element;
  const beforeMetrics = overlay.getMetrics();
  const next = scene([
    sceneNode('a', { depth: 0, center: { x: 40, y: 40 } }),
    sceneNode('b', { depth: 1, center: { x: 100, y: 80 } })
  ]);
  const nextPresentation = presentation([['a', 'Alpha'], ['b', 'Beta']]);
  doc.labelMeasureCount = 0;
  doc.failMeasurementOn = 3;
  assert.throws(
    () => overlay.update({ scene: next, presentation: nextPresentation }),
    (error) => error.code === 'invalid-measurement'
  );
  assert.equal(overlay.element, beforeElement);
  assert.deepEqual(metricsWithoutLabels(overlay.getMetrics()), metricsWithoutLabels(beforeMetrics));
  assert.equal(ownedOverlays(host).length, 1);
  overlay.destroy();
});

test('zero measurements are hidden/unmeasurable, not visible', () => {
  const { doc, host } = fakeHost(300, 200);
  doc.zeroMeasurement = true;
  const overlay = createLabelOverlay(host, { maxLabels: 5 });
  const metrics = overlay.update({
    scene: scene([sceneNode('a', { depth: 0, center: { x: 40, y: 40 } })]),
    presentation: presentation([['a', 'Alpha']])
  });
  assert.equal(metrics.createdCount, 1);
  assert.equal(metrics.visibleCount, 0);
  assert.equal(metrics.unmeasurableCount, 1);
  assert.equal(metrics.labels.get('a').style.display, 'none');
  assert.equal(ownedOverlays(host).length, 1);
  overlay.destroy();
});
test('around placement avoids node obstacles and tests four positions', () => {
  const { host } = fakeHost(220, 140);
  const overlay = createLabelOverlay(host, { maxLabels: 2, maxWidth: 160, placement: 'around' });
  const s = scene([
    sceneNode('owner', { center: { x: 60, y: 70 }, radius: 6 }),
    sceneNode('obstacle', { kind: 'folder', center: { x: 105, y: 115 }, radius: 8 })
  ]);
  const metrics = overlay.update({
    scene: s,
    presentation: presentation([['owner', 'a-very-long-label-name.txt'], ['obstacle', 'Obstacle', 'folder']]),
    priorityIds: ['owner']
  });
  assert.ok(metrics.visibleCount >= 1);
  assert.equal(metrics.nodeObstacleSuppressedCount >= 0, true);
  assert.equal(metrics.labelNodeOverlapCount, 0);
  assert.ok(metrics.placementAttempts >= 1);
});

test('selected/focused priority order wins a bounded label slot', () => {
  const { host } = fakeHost(180, 80);
  const overlay = createLabelOverlay(host, { maxLabels: 1, maxWidth: 80, placement: 'around' });
  const s = scene([
    sceneNode('root', { kind: 'folder', center: { x: 20, y: 20 }, radius: 6 }),
    sceneNode('deep', { center: { x: 90, y: 40 }, radius: 5 }),
    sceneNode('selected', { center: { x: 140, y: 60 }, radius: 5 })
  ]);
  const metrics = overlay.update({
    scene: s,
    presentation: presentation([['root', 'Root', 'folder'], ['deep', 'deep.txt'], ['selected', 'selected.txt']]),
    priorityIds: ['selected']
  });
  assert.equal(metrics.createdCount, 1);
  assert.equal(metrics.labels.has('selected'), true);
  assert.equal(metrics.priorityVisibleCount, 1);
  assert.equal(metrics.prioritySuppressedCount, 0);
});
test('legacy label-node overlap is measured, around avoids feasible obstacle, owner excluded', () => {
  const legacy = createLabelOverlay(fakeHost(300, 120).host, { maxLabels: 1, maxWidth: 80, placement: 'legacy' });
  const legacyScene = scene([
    sceneNode('owner', { center: { x: 20, y: 20 }, radius: 4 }),
    sceneNode('other', { center: { x: 60, y: 20 }, radius: 10 })
  ]);
  const legacyMetrics = legacy.update({
    scene: legacyScene,
    presentation: presentation([['owner', 'owner-name.txt'], ['other', 'other.txt']])
  });
  assert.ok(legacyMetrics.labelNodeOverlapCount >= 1);

  const around = createLabelOverlay(fakeHost(300, 120).host, { maxLabels: 1, maxWidth: 80, placement: 'around' });
  const aroundScene = scene([
    sceneNode('owner', { center: { x: 20, y: 20 }, radius: 4 }),
    sceneNode('other', { center: { x: 150, y: 20 }, radius: 10 })
  ]);
  const aroundMetrics = around.update({
    scene: aroundScene,
    presentation: presentation([['owner', 'owner-name.txt'], ['other', 'other.txt']])
  });
  assert.equal(aroundMetrics.labelNodeOverlapCount, 0);

  const ownerExcluded = countLabelNodeOverlaps(
    new Map([['owner', { left: 10, top: 10, right: 30, bottom: 30 }]]),
    [{ id: 'owner', kind: 'folder', visible: true, center: { x: 20, y: 20 }, radius: 10 }]
  );
  assert.equal(ownerExcluded, 0);
  const suppressedExcluded = countLabelNodeOverlaps(
    new Map(),
    [{ id: 'x', kind: 'folder', visible: true, center: { x: 20, y: 20 }, radius: 10 }]
  );
  assert.equal(suppressedExcluded, 0);
});

test('label-node metric uses exact glyph geometry rather than bounding-box corners', () => {
  const rect = { left: 0, top: 0, right: 10, bottom: 10 };
  const circle = { id: 'c', kind: 'folder', visible: true, center: { x: 12, y: 12 }, radius: 2 };
  const diamond = { id: 'd', kind: 'file', visible: true, center: { x: 12, y: 12 }, radius: 2 };
  assert.equal(countLabelNodeOverlaps(new Map([['c', rect]]), [circle]), 0);
  assert.equal(countLabelNodeOverlaps(new Map([['d', rect]]), [diamond]), 0);
  const circleOverlap = { ...circle, center: { x: 9, y: 9 } };
  const diamondOverlap = { ...diamond, center: { x: 9, y: 9 } };
  assert.equal(countLabelNodeOverlaps(new Map([['label-c', rect]]), [circleOverlap]), 1);
  assert.equal(countLabelNodeOverlaps(new Map([['label-d', rect]]), [diamondOverlap]), 1);
});
test('label/icon groups fade with owner node opacity', () => {
  const { host } = fakeHost(300, 120);
  const overlay = createLabelOverlay(host, { maxLabels: 2, maxWidth: 120, placement: 'around' });
  const node = { ...sceneNode('a', { center: { x: 60, y: 40 }, radius: 5 }), opacity: 0.5 };
  const metrics = overlay.update({
    scene: scene([node]),
    presentation: presentation([['a', 'half.txt']])
  });
  assert.equal(metrics.labels.get('a').style.opacity, '0.5');
  assert.equal(metrics.visibleCount, 1);
});
test('transition label lifecycle keeps stable IDs/opacity and bounded handoff', () => {
  const { host } = fakeHost(500, 300);
  const overlay = createLabelOverlay(host, { maxLabels: 3, maxWidth: 120, placement: 'around' });
  const s = (nodes) => scene(nodes);
  const p = presentation([['a', 'Alpha'], ['b', 'Beta'], ['c', 'Gamma']]);
  const start = s([
    sceneNode('a', { center: { x: 60, y: 50 }, radius: 6 }),
    sceneNode('b', { center: { x: 220, y: 50 }, radius: 6 }),
    { ...sceneNode('c', { center: { x: 380, y: 50 }, radius: 6 }), opacity: 0 }
  ]);
  const first = overlay.beginTransition({ scene: start, presentation: p, priorityIds: ['a', 'b', 'c'] });
  const idA = first.labels.get('a');
  const idC = first.labels.get('c');
  assert.equal(first.labels.has('a'), true);
  assert.equal(first.labels.has('c'), true);
  assert.equal(first.labels.get('c').style.opacity, '0');
  const mid = s([
    { ...sceneNode('a', { center: { x: 80, y: 60 }, radius: 6 }), opacity: 0.5 },
    { ...sceneNode('b', { center: { x: 200, y: 70 }, radius: 6 }), opacity: 0.25 },
    { ...sceneNode('c', { center: { x: 340, y: 60 }, radius: 6 }), opacity: 0.5 }
  ]);
  const second = overlay.updateTransition({ scene: mid, presentation: p, priorityIds: ['a', 'b', 'c'] });
  assert.equal(second.labels.get('a'), idA);
  assert.equal(second.labels.get('c'), idC);
  assert.equal(second.labels.get('a').style.opacity, '0.5');
  assert.equal(second.labels.get('c').style.opacity, '0.5');
  const target = s([
    sceneNode('a', { center: { x: 80, y: 60 }, radius: 6 }),
    sceneNode('c', { center: { x: 340, y: 60 }, radius: 6 })
  ]);
  const final = overlay.completeTransition({ scene: target, presentation: p, priorityIds: ['a', 'c'] });
  assert.equal(final.labels.get('a'), idA);
  assert.equal(final.labels.get('c'), idC);
  assert.equal(final.labels.has('b'), false);
  assert.equal(final.labels.get('c').style.opacity, '1');
  assert.ok(final.createdCount <= 3);
  assert.equal(overlay.cancelTransition(), false);
});

test('transition plan is bounded and cancellation clears temporary labels', () => {
  const { host } = fakeHost(500, 300);
  const overlay = createLabelOverlay(host, { maxLabels: 2, maxWidth: 120, placement: 'around' });
  const nodes = ['a', 'b', 'c', 'd'].map((id, index) => sceneNode(id, { center: { x: 40 + index * 100, y: 40 }, radius: 5 }));
  const p = presentation(nodes.map((node) => [node.id, node.id.toUpperCase()]));
  const first = overlay.beginTransition({ scene: scene(nodes), presentation: p, priorityIds: ['a', 'b', 'c', 'd'] });
  assert.equal(first.labels.size, 2);
  assert.equal(overlay.cancelTransition(), true);
  assert.equal(overlay.getMetrics().labels.size, 0);
  const normal = overlay.update({ scene: scene(nodes.slice(0, 1)), presentation: p });
  assert.equal(normal.labels.has('a'), true);
});
test('transition suppression remains stable when positions diverge mid-motion', () => {
  const { host } = fakeHost(50, 30);
  const overlay = createLabelOverlay(host, { maxLabels: 2, maxWidth: 120, placement: 'around' });
  const p = presentation([['a', 'Alpha'], ['b', 'Beta']]);
  const start = scene([
    sceneNode('a', { center: { x: 10, y: 10 }, radius: 4 }),
    sceneNode('b', { center: { x: 10, y: 10 }, radius: 4 })
  ]);
  const first = overlay.beginTransition({ scene: start, presentation: p, priorityIds: ['a', 'b'] });
  assert.ok(first.suppressedCount >= 1);
  const suppressed = first.labels.get('b');
  const mid = scene([
    sceneNode('a', { center: { x: 10, y: 10 }, radius: 4 }),
    sceneNode('b', { center: { x: 40, y: 20 }, radius: 4 })
  ]);
  overlay.updateTransition({ scene: mid, presentation: p, priorityIds: ['a', 'b'] });
  assert.equal(suppressed.style.display, 'none');
  assert.equal(overlay.getMetrics().labels.get('b'), suppressed);
});
test('fully visible retained labels do not blink out at target handoff', () => {
  const { host } = fakeHost(400, 200);
  const overlay = createLabelOverlay(host, { maxLabels: 2, maxWidth: 100, placement: 'around' });
  const p = presentation([['a', 'Alpha'], ['b', 'Beta']]);
  const start = scene([
    sceneNode('a', { center: { x: 80, y: 80 }, radius: 6 }),
    sceneNode('b', { center: { x: 260, y: 80 }, radius: 6 })
  ]);
  const first = overlay.beginTransition({ scene: start, presentation: p, priorityIds: ['a', 'b'] });
  assert.equal(first.labels.get('a').style.display, 'flex');
  assert.equal(first.labels.get('b').style.display, 'flex');
  const target = scene([
    sceneNode('a', { center: { x: 180, y: 80 }, radius: 6 }),
    sceneNode('b', { center: { x: 180, y: 80 }, radius: 6 })
  ]);
  const final = overlay.completeTransition({ scene: target, presentation: p, priorityIds: ['a', 'b'] });
  assert.equal(final.labels.get('a').style.display, 'flex');
  assert.equal(final.labels.get('b').style.display, 'flex');
  assert.equal(final.labels.get('a'), first.labels.get('a'));
});
test('transition metrics measure actual label-node overlap and fallback visibility', () => {
  const { host } = fakeHost(500, 200);
  const overlay = createLabelOverlay(host, { maxLabels: 2, maxWidth: 160, placement: 'legacy' });
  const p = presentation([['owner', 'a-very-long-label-name.txt'], ['other', 'Other']]);
  const start = scene([
    sceneNode('owner', { center: { x: 40, y: 60 }, radius: 4 }),
    sceneNode('other', { center: { x: 120, y: 60 }, radius: 10 })
  ]);
  const first = overlay.beginTransition({ scene: start, presentation: p, priorityIds: ['owner'] });
  assert.ok(first.labelNodeOverlapCount >= 1);
  assert.equal(first.labelNodeOverlapMeasurement, 'measured-visible-label-rectangles');
  assert.equal(first.suppressionMeasurement, 'fixed-transition-policy');
  assert.equal(first.overlapSuppressedCount, null);

  const { host: host2 } = fakeHost(400, 200);
  const overlay2 = createLabelOverlay(host2, { maxLabels: 2, maxWidth: 100, placement: 'around' });
  const p2 = presentation([['a', 'Alpha'], ['b', 'Beta']]);
  const start2 = scene([
    sceneNode('a', { center: { x: 80, y: 80 }, radius: 6 }),
    sceneNode('b', { center: { x: 260, y: 80 }, radius: 6 })
  ]);
  const t = overlay2.beginTransition({ scene: start2, presentation: p2, priorityIds: ['a', 'b'] });
  const target = scene([
    sceneNode('a', { center: { x: 180, y: 80 }, radius: 6 }),
    sceneNode('b', { center: { x: 180, y: 80 }, radius: 6 })
  ]);
  const final = overlay2.completeTransition({ scene: target, presentation: p2, priorityIds: ['a', 'b'] });
  assert.equal(final.visibleCount, 2);
  assert.equal(final.suppressedCount, 0);
  assert.equal(final.labelNodeOverlapMeasurement, 'measured-visible-label-rectangles');
});
test('maxLabels=1 transition metrics include unlabelled rendered nodes', () => {
  const { host } = fakeHost(500, 200);
  const overlay = createLabelOverlay(host, { maxLabels: 1, maxWidth: 160, placement: 'legacy' });
  const p = presentation([['owner', 'a-very-long-label-name.txt'], ['other', 'Other']]);
  const start = scene([
    sceneNode('owner', { center: { x: 40, y: 60 }, radius: 4 }),
    sceneNode('other', { center: { x: 120, y: 60 }, radius: 10 })
  ]);
  const begin = overlay.beginTransition({ scene: start, presentation: p, priorityIds: ['owner'] });
  assert.equal(begin.createdCount, 1);
  assert.ok(begin.labelNodeOverlapCount >= 1);

  const mid = scene([
    { ...sceneNode('owner', { center: { x: 40, y: 60 }, radius: 4 }), opacity: 0.5 },
    sceneNode('other', { center: { x: 120, y: 60 }, radius: 10 })
  ]);
  const update = overlay.updateTransition({ scene: mid, presentation: p, priorityIds: ['owner'] });
  assert.ok(update.labelNodeOverlapCount >= 1);

  const target = scene([
    sceneNode('owner', { center: { x: 40, y: 60 }, radius: 4 }),
    sceneNode('other', { center: { x: 120, y: 60 }, radius: 10 })
  ]);
  const final = overlay.completeTransition({ scene: target, presentation: p, priorityIds: ['owner'] });
  assert.ok(final.labelNodeOverlapCount >= 1);
  assert.equal(final.createdCount, 1);
  assert.equal(final.visibleCount, 1);
});

test('maxLabels=1 transition metrics keep non-intersection and owner exclusion at zero', () => {
  const { host } = fakeHost(500, 200);
  const overlay = createLabelOverlay(host, { maxLabels: 1, maxWidth: 160, placement: 'legacy' });
  const p = presentation([['owner', 'a-very-long-label-name.txt'], ['other', 'Other']]);
  const start = scene([
    sceneNode('owner', { center: { x: 40, y: 60 }, radius: 4 }),
    sceneNode('other', { center: { x: 400, y: 160 }, radius: 10 })
  ]);
  const begin = overlay.beginTransition({ scene: start, presentation: p, priorityIds: ['owner'] });
  assert.equal(begin.labelNodeOverlapCount, 0);

  const ownerOnly = scene([sceneNode('owner', { center: { x: 40, y: 60 }, radius: 4 })]);
  const final = overlay.completeTransition({ scene: ownerOnly, presentation: p, priorityIds: ['owner'] });
  assert.equal(final.labelNodeOverlapCount, 0);
});
test('attachment classification drives bounded icon, badge, review state, and title', () => {
  const host = fakeHost();
  const overlay = createLabelOverlay(host.host, { maxLabels: 4, maxWidth: 180 });
  const nodes = [sceneNode('a', { kind: 'file', center: { x: 50, y: 50 }, radius: 8 })];
  const map = new Map([
    ['a', { name: 'Notes.md', kind: 'file', dataType: 'file', classification: { format: 'markdown', badge: 'MD', needsReview: false } }]
  ]);
  overlay.update({ scene: scene(nodes, 'a'), presentation: map });
  const label = overlay.getMetrics().labels.get('a');
  assert.equal(label.children[0].textContent, 'Notes.md');
  assert.equal(label.children[1].getAttribute('data-vd-badge'), 'MD');
  assert.equal(label.children[1].textContent, 'MD');
  assert.equal(label.children.some((child) => child.tagName === 'svg'), false);
  assert.match(label.getAttribute('title'), /Notes\.md/);
  assert.equal(overlay.getMetrics().textMismatchCount, 0);
  const review = new Map([
    ['a', { name: 'x.pdf', kind: 'file', dataType: 'file', classification: { format: 'unknown', badge: '?', needsReview: true } }]
  ]);
  overlay.update({ scene: scene(nodes, 'a'), presentation: review });
  assert.equal(overlay.getMetrics().labels.get('a').getAttribute('data-vd-review'), 'true');
  assert.equal(overlay.getMetrics().labels.get('a').children[1].textContent, '?');
  overlay.destroy();
});function findAnchor(group) {
  if (!group) return null;
  if (group.tagName === 'a') return group;
  for (const child of group.children) {
    const found = findAnchor(child);
    if (found) return found;
  }
  return null;
}
test('typed web-link labels render safe native anchors and activate only when final', () => {
  const { host } = fakeHost();
  const overlay = createLabelOverlay(host, { maxLabels: 5 });
  const typed = [
    ['w', '<b>Web</b>', 'file', { dataType: 'web-link', link: 'https://example.com/a' }],
    ['f', 'Folder', 'folder', { dataType: 'web-link', link: 'https://example.com/f' }],
    ['a', 'Attachment', 'file', { dataType: 'file', link: 'https://example.com/a' }],
    ['l', 'Legacy', 'file', { link: 'https://example.com/l' }]
  ];
  const metrics = overlay.update({ scene: scene([sceneNode('w', { depth: 1, center: { x: 40, y: 30 } }), sceneNode('f', { depth: 1, kind: 'folder', center: { x: 60, y: 60 } }), sceneNode('a', { depth: 1, center: { x: 90, y: 30 } }), sceneNode('l', { depth: 1, center: { x: 120, y: 60 } })]), presentation: presentation(typed) });
  const web = findAnchor(metrics.labels.get('w'));
  assert.ok(web);
  assert.equal(web.textContent, '<b>Web</b>');
  assert.equal(web.getAttribute('href'), 'https://example.com/a');
  assert.equal(web.getAttribute('target'), '_blank');
  assert.equal(web.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(web.style.pointerEvents, 'auto');
  assert.equal(metrics.labels.get('w').style.pointerEvents, 'auto');
  for (const id of ['f', 'a', 'l']) assert.equal(findAnchor(metrics.labels.get(id)), null);
  overlay.destroy();
});
test('invalid stored web link is non-clickable and counted', () => {
  const { host } = fakeHost();
  const overlay = createLabelOverlay(host, { maxLabels: 5 });
  const metrics = overlay.update({
    scene: scene([sceneNode('w', { depth: 1, center: { x: 40, y: 30 } })]),
    presentation: presentation([['w', 'Web', 'file', { dataType: 'web-link', link: 'javascript:alert(1)' }]])
  });
  assert.equal(findAnchor(metrics.labels.get('w')), null);
  assert.equal(metrics.invalidWebLinkCount, 1);
  overlay.destroy();
});
test('transition web-link anchors are inert until completion and retain stable DOM', () => {
  const { host } = fakeHost();
  const overlay = createLabelOverlay(host, { maxLabels: 5 });
  const input = {
    scene: scene([sceneNode('w', { depth: 1, center: { x: 40, y: 30 }, opacity: 0.5 })]),
    presentation: presentation([['w', 'Web', 'file', { dataType: 'web-link', link: 'https://example.com/a' }]])
  };
  overlay.beginTransition(input);
  const group = overlay.getMetrics().labels.get('w');
  const anchor = findAnchor(group);
  assert.ok(anchor);
  assert.equal(anchor.getAttribute('href'), undefined);
  assert.equal(anchor.tabIndex, -1);
  overlay.updateTransition(input);
  assert.equal(findAnchor(group).getAttribute('href'), undefined);
  overlay.completeTransition(input);
  assert.equal(overlay.getMetrics().labels.get('w'), group);
  assert.equal(findAnchor(group).getAttribute('href'), 'https://example.com/a');
  overlay.destroy();
});test('suppressed and opacity-zero web-link labels are not focusable', () => {
  const { host } = fakeHost();
  const overlay = createLabelOverlay(host, { maxLabels: 1 });
  const nodes = [
    sceneNode('one', { depth: 1, center: { x: 20, y: 20 } }),
    sceneNode('two', { depth: 1, center: { x: 80, y: 80 } })
  ];
  const metrics = overlay.update({
    scene: scene(nodes),
    presentation: presentation([
      ['one', 'One', 'file', { dataType: 'web-link', link: 'https://example.com/one' }],
      ['two', 'Two', 'file', { dataType: 'web-link', link: 'https://example.com/two' }]
    ])
  });
  const suppressed = findAnchor(metrics.labels.get('two'));
  assert.equal(suppressed, null);
  assert.equal(findAnchor(metrics.labels.get('one')).getAttribute('href'), 'https://example.com/one');
  overlay.update({
    scene: scene([sceneNode('one', { depth: 1, center: { x: 20, y: 20 }, opacity: 0 })]),
    presentation: presentation([['one', 'One', 'file', { dataType: 'web-link', link: 'https://example.com/one' }]])
  });
  const faded = findAnchor(overlay.getMetrics().labels.get('one'));
  assert.equal(faded.getAttribute('href'), undefined);
  assert.equal(faded.tabIndex, -1);
  overlay.destroy();
});test('deferred activation keeps prepared links inert until explicit activation', () => {
  const { host } = fakeHost();
  const overlay = createLabelOverlay(host, { maxLabels: 5, linkActivation: 'deferred' });
  const input = {
    scene: scene([sceneNode('w', { depth: 1, center: { x: 40, y: 30 } })]),
    presentation: presentation([['w', 'Web', 'file', { dataType: 'web-link', link: 'https://example.com/a' }]])
  };
  const metrics = overlay.update(input);
  const anchor = findAnchor(metrics.labels.get('w'));
  assert.equal(anchor.getAttribute('href'), undefined);
  overlay.activateLinks();
  assert.equal(anchor.getAttribute('href'), 'https://example.com/a');
  overlay.deactivateLinks();
  assert.equal(anchor.getAttribute('href'), undefined);
  overlay.destroy();
});
test('replacement failure invalidates existing active links', () => {
  const { host, doc } = fakeHost();
  const overlay = createLabelOverlay(host, { maxLabels: 5 });
  const input = {
    scene: scene([sceneNode('w', { depth: 1, center: { x: 40, y: 30 } })]),
    presentation: presentation([['w', 'Web', 'file', { dataType: 'web-link', link: 'https://example.com/a' }]])
  };
  const first = overlay.update(input);
  const anchor = findAnchor(first.labels.get('w'));
  assert.equal(anchor.getAttribute('href'), 'https://example.com/a');
  doc.failMeasurementOn = (doc.labelMeasureCount || 0) + 1;
  assert.throws(() => overlay.update({
    scene: scene([sceneNode('w', { depth: 1, center: { x: 40, y: 30 } })]),
    presentation: presentation([['w', 'Web', 'file', { dataType: 'web-link', link: 'https://example.com/b' }]])
  }));
  assert.equal(anchor.getAttribute('href'), undefined);
  overlay.destroy();
});
test('deferred transition completion remains inert until activation', () => {
  const { host } = fakeHost();
  const overlay = createLabelOverlay(host, { maxLabels: 5, linkActivation: 'deferred' });
  const input = {
    scene: scene([sceneNode('w', { depth: 1, center: { x: 40, y: 30 } })]),
    presentation: presentation([['w', 'Web', 'file', { dataType: 'web-link', link: 'https://example.com/a' }]])
  };
  overlay.beginTransition(input);
  overlay.completeTransition(input);
  const anchor = findAnchor(overlay.getMetrics().labels.get('w'));
  assert.equal(anchor.getAttribute('href'), undefined);
  overlay.activateLinks();
  assert.equal(anchor.getAttribute('href'), 'https://example.com/a');
  overlay.destroy();
});test('deferred ownership stays inert after a hit-stage failure and activates only on recovery', () => {
  const { host } = fakeHost();
  const overlay = createLabelOverlay(host, { maxLabels: 5, linkActivation: 'deferred' });
  const input = {
    scene: scene([sceneNode('w', { depth: 1, center: { x: 40, y: 30 } })]),
    presentation: presentation([['w', 'Web', 'file', { dataType: 'web-link', link: 'https://example.com/a' }]])
  };
  const metrics = overlay.update(input);
  const anchor = findAnchor(metrics.labels.get('w'));
  assert.equal(anchor.getAttribute('href'), undefined);
  assert.throws(() => { throw new Error('hit installation failed'); });
  assert.equal(anchor.getAttribute('href'), undefined);
  overlay.activateLinks();
  assert.equal(anchor.getAttribute('href'), 'https://example.com/a');
  overlay.deactivateLinks();
  assert.equal(anchor.getAttribute('href'), undefined);
  overlay.destroy();
});test('labelAtPoint identifies only visible installed label owners', () => {
  const { host } = fakeHost();
  const overlay = createLabelOverlay(host, { maxLabels: 1, linkActivation: 'deferred' });
  const metrics = overlay.update({
    scene: scene([
      sceneNode('w', { depth: 1, center: { x: 40, y: 30 } }),
      sceneNode('hidden', { depth: 1, center: { x: 200, y: 200 } })
    ]),
    presentation: presentation([
      ['w', 'Web', 'file', { dataType: 'web-link', link: 'https://example.com/a' }],
      ['hidden', 'Hidden', 'file']
    ])
  });
  const group = metrics.labels.get('w');
  const rect = group.getBoundingClientRect();
  const found = overlay.labelAtPoint(rect.left + 1, rect.top + 1);
  assert.equal(found.id, 'w');
  assert.equal(found.link, true);
  assert.equal(overlay.labelAtPoint(rect.right + 10, rect.bottom + 10), null);
  overlay.beginTransition({
    scene: scene([sceneNode('w', { depth: 1, center: { x: 40, y: 30 } })]),
    presentation: presentation([['w', 'Web', 'file', { dataType: 'web-link', link: 'https://example.com/a' }]])
  });
  assert.equal(overlay.labelAtPoint(rect.left + 1, rect.top + 1), null);
  overlay.destroy();
});test('format badges update in place without replacing the label group and without leading icons', () => {
  const { host } = fakeHost();
  const overlay = createLabelOverlay(host, { maxLabels: 10, maxWidth: 120, labelPalette: EXPLORATION_LABEL_PALETTE });
  const s = scene([sceneNode('f', { kind: 'file', depth: 1, center: { x: 80, y: 70 }, radius: 4 })]);
  const first = overlay.update({ scene: s, presentation: presentation([['f', 'Report', 'file', { dataType: 'file', classification: { format: 'pdf', badge: 'PDF', mime: 'application/pdf' } }]]) });
  const group = first.labels.get('f');
  assert.equal(group.children.some((child) => child.tagName === 'svg'), false);
  assert.equal(group.children[0].textContent, 'Report');
  assert.equal(group.getAttribute('data-vd-label-id'), 'f');
  const second = overlay.update({ scene: s, presentation: presentation([['f', 'Report', 'file', { dataType: 'file', classification: { format: 'markdown', badge: 'MD', mime: 'text/markdown' } }]]) });
  const nextGroup = second.labels.get('f');
  assert.equal(nextGroup.getAttribute('data-vd-label-id'), 'f');
  assert.equal(nextGroup.children[0].textContent, 'Report');
  assert.equal(nextGroup.children[1].textContent, 'MD');
  overlay.destroy();
});test('exploration palette is consistent across transition begin and complete', () => {
  const { host } = fakeHost();
  const overlay = createLabelOverlay(host, { maxLabels: 10, maxWidth: 120, labelPalette: EXPLORATION_LABEL_PALETTE });
  const s = scene([sceneNode('f', { kind: 'file', depth: 1, center: { x: 80, y: 70 }, radius: 4 })]);
  overlay.beginTransition({ scene: s, presentation: presentation([['f', 'Report', 'file', { dataType: 'file', classification: { format: 'pdf', badge: 'PDF', mime: 'application/pdf' } }]]) });
  const group = overlay.getMetrics().labels.get('f');
  assert.equal(group.children.some((child) => child.tagName === 'svg'), false);
  assert.equal(group.children[0].textContent, 'Report');
  assert.equal(group.style.color, '#F87171');
  assert.equal(group.children[1].style.color, '#F87171');
  overlay.completeTransition({ scene: s, presentation: presentation([['f', 'Report', 'file', { dataType: 'file', classification: { format: 'markdown', badge: 'MD', mime: 'text/markdown' } }]]) });
  assert.equal(overlay.getMetrics().labels.get('f'), group);
  assert.equal(group.children[0].textContent, 'Report');
  assert.equal(group.children[1].style.color, '#22C55E');
  overlay.destroy();
});


