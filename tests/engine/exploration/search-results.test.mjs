import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchResultsView } from '../../harness/m5-exploration/search-results.js';

class El {
  constructor(tag = 'div', doc = null) { this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.parent = null; this.attributes = new Map(); this.dataset = {}; this.style = {}; this.listeners = new Map(); this.className = ''; this._textContent = ''; this.hidden = false; this.href = ''; this.target = ''; this.rel = ''; this.type = ''; }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join(' ') : this._textContent; }
  set textContent(v) { this._textContent = String(v); this.children = []; }
  set innerHTML(v) { throw new Error('innerHTML is forbidden'); }
  appendChild(child) { child.parent = this; child.ownerDocument = this.ownerDocument; this.children.push(child); return child; }
  append(...nodes) { for (const n of nodes) this.appendChild(n); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  addEventListener(t, fn) { if (!this.listeners.has(t)) this.listeners.set(t, []); this.listeners.get(t).push(fn); }
  async click() { for (const fn of [...(this.listeners.get('click') || [])]) await fn({ stopPropagation() {}, preventDefault() {} }); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) { const out = []; const walk = (node) => { if (selector.startsWith('.') && node.className.split(/\s+/).includes(selector.slice(1))) out.push(node); if (selector.startsWith('[') && selector.endsWith(']')) { const m = selector.slice(1, -1).match(/^(.+?)="(.*)"$/); if (m && node.getAttribute(m[1]) === m[2]) out.push(node); } for (const c of node.children) walk(c); }; for (const c of this.children) walk(c); return out; }
}
class Doc { constructor() { this.els = []; } createElement(tag) { const e = new El(tag, this); this.els.push(e); return e; } createElementNS(_n, tag) { return this.createElement(tag); } }
test('renders safe cards with icons, excerpts, type, path and web action', async () => {
  const doc = new Doc(); const host = doc.createElement('div');
  let activated = null; let cleared = 0;
  const view = createSearchResultsView({ document: doc, host, onActivate: (r) => { activated = r.id; }, onClear: () => { cleared += 1; } });
  view.render({ ok: true, query: 'x', total: 2, limited: false, results: [
    { id: 'p', name: 'Report.pdf', kind: 'file', dataType: 'file', description: null, parentPath: 'Root', classification: { format: 'pdf' }, datasetToken: 1, revision: 2 },
    { id: 'w', name: '<img src=x>', kind: 'file', dataType: 'web-link', description: 'A web description', link: 'https://example.com', parentPath: 'Root / Links', classification: null, datasetToken: 1, revision: 2 }
  ] });
  const cards = host.querySelectorAll('.search-card');
  assert.equal(cards.length, 2);
  assert.ok(host.textContent.includes('Report.pdf'));
  assert.ok(host.textContent.includes('No description'));
  assert.ok(host.textContent.includes('<img src=x>'));
  assert.ok(host.textContent.includes('PDF'));
  assert.ok(host.textContent.includes('Web link'));
  assert.ok(host.textContent.includes('Root / Links'));
  assert.equal(cards[0].children[0].style.color, '#F87171');
  await cards[0].click(); assert.equal(activated, 'p');
  const anchor = host.querySelector('.search-open-link');
  assert.equal(anchor.href, 'https://example.com/'); assert.equal(anchor.target, '_blank'); assert.equal(anchor.rel, 'noopener noreferrer');
  await anchor.click(); assert.equal(activated, 'p');
  await view.root.querySelector('.search-results-head').children[1].click(); assert.equal(cleared, 1);
});
test('reports no-match, limited, error and active/back states', () => {
  const doc = new Doc(); const host = doc.createElement('div');
  const view = createSearchResultsView({ document: doc, host, onActivate() {}, onClear() {} });
  view.render({ ok: true, query: 'none', total: 0, limited: false, results: [] });
  assert.match(host.textContent, /No matches/);
  view.render({ ok: true, query: 'x', total: 60, limited: true, results: Array.from({ length: 50 }, (_, i) => ({ id: 'n' + i, name: 'N' + i, kind: 'folder', description: '', parentPath: '', datasetToken: 1, revision: 1 })) });
  assert.match(host.textContent, /Showing 50 of 60/);
  view.showError('blocked');
  assert.match(host.textContent, /blocked/);
  view.setActive('n1');
  assert.equal(host.querySelector('.search-back').hidden, false);
  assert.equal(host.querySelectorAll('.search-card')[1].getAttribute('aria-current'), 'true');
});test('rendered cards show meaningful stored types and honor classification over renamed extensions', () => {
  const doc = new Doc(); const host = doc.createElement('div');
  const view = createSearchResultsView({ document: doc, host, onActivate() {}, onClear() {} });
  const results = [
    ['f', { id: 'f', name: 'Folder', kind: 'folder', description: '' }],
    ['w', { id: 'w', name: 'Link', kind: 'file', dataType: 'web-link', description: '' }],
    ['p', { id: 'p', name: 'Report.txt', kind: 'file', dataType: 'file', description: '', classification: { format: 'pdf', badge: 'PDF', needsReview: false } }],
    ['m', { id: 'm', name: 'Notes.pdf', kind: 'file', dataType: 'file', description: '', classification: { format: 'markdown', badge: 'MD', needsReview: false } }],
    ['t', { id: 't', name: 'Log', kind: 'file', dataType: 'file', description: '', classification: { format: 'text', badge: 'TXT', needsReview: false } }],
    ['i', { id: 'i', name: 'Photo', kind: 'file', dataType: 'file', description: '', classification: { format: 'generic', badge: 'PNG', mime: 'image/png', needsReview: false } }],
    ['g', { id: 'g', name: 'Bundle.zip', kind: 'file', dataType: 'file', description: '', classification: { format: 'generic', badge: 'ZIP', needsReview: false } }],
    ['u', { id: 'u', name: 'Mystery', kind: 'file', dataType: 'file', description: '', classification: { format: 'unknown', badge: '?', needsReview: true } }],
    ['l', { id: 'l', name: 'Legacy.pdf', kind: 'file', description: '' }]
  ].map(([, item]) => ({ ...item, parentPath: '', datasetToken: 1, revision: 1 }));
  view.render({ ok: true, query: 'x', total: results.length, limited: false, results });
  const types = host.querySelectorAll('.search-card').map((card) => card.querySelectorAll('.search-card-meta')[0].textContent);
  assert.deepEqual(types, ['Folder', 'Web link', 'PDF', 'Markdown', 'Text', 'Image', 'File', 'Unknown', 'PDF']);
  assert.ok(host.textContent.includes('Report.txt'));
});



