import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXTENSIONS,
  FILE_HINTS,
  ICON_KEYS,
  classifyLabel,
  extensionOf,
  GraphRenderError
} from '../../../src/engine/hypertree/render/index.js';

test('classifies folders and supported case-insensitive file extensions', () => {
  assert.equal(classifyLabel({ kind: 'folder', name: 'Projects' }), 'folder');
  assert.equal(classifyLabel({ kind: 'file', name: 'manual.PDF' }), 'pdf');
  assert.equal(classifyLabel({ kind: 'file', name: 'notes.md' }), 'markdown');
  assert.equal(classifyLabel({ kind: 'file', name: 'notes.MARKDOWN' }), 'markdown');
  assert.equal(classifyLabel({ kind: 'file', name: 'readme.txt' }), 'text');
  assert.equal(classifyLabel({ kind: 'file', name: 'data.json' }), 'text');
  assert.equal(classifyLabel({ kind: 'file', name: 'photo.JpG' }), 'image');
  assert.equal(classifyLabel({ kind: 'file', name: 'bundle.tar.gz' }), 'archive');
  assert.equal(classifyLabel({ kind: 'file', name: 'unknown.bin' }), 'generic');
  assert.equal(classifyLabel({ kind: 'file', name: 'README' }), 'generic');
});

test('dotfiles, trailing dots, multiple dots, and Unicode names', () => {
  assert.equal(extensionOf('.env'), '');
  assert.equal(extensionOf('.pdf'), '');
  assert.equal(extensionOf('file.'), '');
  assert.equal(extensionOf('one.two.three.MD'), 'md');
  assert.equal(classifyLabel({ kind: 'file', name: 'ファイル.ＰＤＦ' }), 'generic');
  assert.equal(classifyLabel({ kind: 'file', name: 'ファイル.pdf' }), 'pdf');
  assert.equal(classifyLabel({ kind: 'file', name: 'résumé.md' }), 'markdown');
  assert.equal(classifyLabel({ kind: 'file', name: 'archive.tar.GZ' }), 'archive');
});

test('explicit supported hints take precedence and unsupported hints reject', () => {
  assert.equal(classifyLabel({ kind: 'file', name: 'photo.bin', typeHint: 'image' }), 'image');
  assert.equal(classifyLabel({ kind: 'file', name: 'notes.md', typeHint: 'pdf' }), 'pdf');
  assert.equal(classifyLabel({ kind: 'file', name: 'unknown', typeHint: 'GENERIC' }), 'generic');
  for (const hint of FILE_HINTS) {
    assert.equal(classifyLabel({ kind: 'file', name: 'file.unknown', typeHint: hint }), hint);
  }
  assert.throws(
    () => classifyLabel({ kind: 'file', name: 'x.md', typeHint: 'spreadsheet' }),
    (e) => e instanceof GraphRenderError && e.code === 'invalid-presentation'
  );
  assert.throws(() => classifyLabel({ kind: 'file', name: '' }), (e) => e.code === 'invalid-presentation');
  assert.throws(() => classifyLabel({ kind: 'other', name: 'x' }), (e) => e.code === 'invalid-presentation');
});

test('extension and icon registries are bounded presentation-only sets', () => {
  assert.deepEqual(new Set(ICON_KEYS), new Set(['folder', 'pdf', 'text', 'markdown', 'image', 'archive', 'link', 'generic']));
  for (const key of Object.keys(EXTENSIONS)) {
    assert.ok(ICON_KEYS.includes(key));
    assert.ok(EXTENSIONS[key].length > 0);
  }
});
test('attachment presentation uses stored classification and web-link badge', async () => {
  const { classifyLabelPresentation } = await import('../../../src/engine/hypertree/render/label-classification.js');
  const presentation = classifyLabelPresentation({ kind: 'file', name: 'display.txt', dataType: 'file', classification: { format: 'markdown', badge: 'MD', needsReview: false } });
  assert.equal(presentation.icon, 'markdown');
  assert.equal(presentation.badge, 'MD');
  assert.equal(presentation.needsReview, false);
  assert.equal(classifyLabelPresentation({ kind: 'file', name: 'x', dataType: 'web-link' }).icon, 'link');
  assert.equal(classifyLabelPresentation({ kind: 'file', name: 'x', dataType: 'web-link' }).badge, 'WEB');
  assert.equal(classifyLabelPresentation({ kind: 'file', name: 'x.txt' }).badge, null);
});test('format presentation mapping includes badges/colors and image MIME support', async () => {
  const { classifyLabelPresentation, EXPLORATION_LABEL_PALETTE } = await import('../../../src/engine/hypertree/render/label-classification.js');
  const sheet = (input) => classifyLabelPresentation(input, { palette: EXPLORATION_LABEL_PALETTE });
  const pdf = sheet({ kind: 'file', name: 'x', dataType: 'file', classification: { format: 'pdf', badge: 'PDF' } });
  const md = sheet({ kind: 'file', name: 'x', dataType: 'file', classification: { format: 'markdown', badge: 'MD' } });
  assert.deepEqual({ icon: md.icon, badge: md.badge, color: md.color }, { icon: 'markdown', badge: 'MD', color: '#22C55E' });
  const txt = sheet({ kind: 'file', name: 'x', dataType: 'file', classification: { format: 'text', badge: 'TXT' } });
  assert.deepEqual({ icon: txt.icon, badge: txt.badge, color: txt.color }, { icon: 'text', badge: 'TXT', color: '#22C55E' });
  for (const mime of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
    const image = sheet({ kind: 'file', name: 'display', dataType: 'file', classification: { format: 'generic', badge: 'PNG', mime } });
    assert.equal(image.icon, 'image');
    assert.equal(image.badge, 'IMG');
    assert.equal(image.color, '#22C55E');
  }
  const web = sheet({ kind: 'file', name: 'x', dataType: 'web-link' });
  assert.equal(web.icon, 'link'); assert.equal(web.badge, 'WEB'); assert.equal(web.color, '#22C55E');
  const unknown = sheet({ kind: 'file', name: 'x', dataType: 'file', classification: { format: 'unknown', needsReview: true } });
  assert.equal(unknown.icon, 'generic'); assert.equal(unknown.needsReview, true);
});
test('stored attachment format ignores edited display-name extension', async () => {
  const { classifyLabelPresentation } = await import('../../../src/engine/hypertree/render/label-classification.js');
  const p = classifyLabelPresentation({ kind: 'file', name: 'Report.pdf', dataType: 'file', classification: { format: 'markdown', badge: 'MD' } });
  assert.equal(p.icon, 'markdown');
  assert.equal(p.badge, 'MD');
});test('default label caller retains pre-r15 format colors without exploration palette', async () => {
  const { classifyLabelPresentation } = await import('../../../src/engine/hypertree/render/label-classification.js');
  assert.equal(classifyLabelPresentation({ kind: 'file', name: 'x', dataType: 'file', classification: { format: 'markdown', badge: 'MD' } }).color, '#a5b4fc');
  assert.equal(classifyLabelPresentation({ kind: 'file', name: 'x', dataType: 'file', classification: { format: 'text', badge: 'TXT' } }).color, '#94a3b8');
  assert.equal(classifyLabelPresentation({ kind: 'file', name: 'x', dataType: 'web-link' }).color, '#93c5fd');
  assert.equal(classifyLabelPresentation({ kind: 'file', name: 'x', dataType: 'file', classification: { format: 'pdf', badge: 'PDF' } }).color, '#F87171');
});


