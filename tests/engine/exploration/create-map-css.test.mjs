import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../harness/m5-exploration/index.html', import.meta.url), 'utf8');

test('Create Map CSS is valid and hidden stages cannot be overridden by display rules', () => {
  assert.doesNotMatch(html, /'\s*\.create-map-backdrop/);
  assert.match(html, /\.create-map-form\[hidden\][^{]*\.create-map-actions\[hidden\][^{]*\.create-map-preview\[hidden\][^{]*\{ display: none; \}/);
  assert.match(html, /\.create-map-form input\[hidden\] \{ display: none; \}/);
  assert.match(html, /\.create-map-backdrop \{[^}]*position: fixed;[^}]*inset: 0;[^}]*display: grid;[^}]*place-items: center;/);
  assert.match(html, /\.create-map-preview \{[^}]*max-height: 240px;[^}]*overflow: auto;/);
  assert.match(html, /\.create-map-dialog \{[^}]*max-height:[^}]*overflow: auto;/);
});

test('Create Map style block contains real newlines and no stray quote tokens', () => {
  const style = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
  assert.equal(style.includes('\\n'), false);
  assert.equal(style.includes("''"), false);
  assert.equal(style.includes('\\'), false);
  assert.match(style, /^  \.create-map-form \{ display: grid; gap: 7px; \}$/m);
  assert.match(style, /^  \.create-map-form\[hidden\], \.create-map-actions\[hidden\], \.create-map-preview\[hidden\], \.create-map-confirm\[hidden\] \{ display: none; \}$/m);
  assert.match(style, /^\s*\.create-map-form input\[hidden\] \{ display: none; \}$/m);
  assert.match(style, /^\s*\.create-map-form input \{ background: var\(--fo-input\);/m);
});

test('Create Map dialog exposes exactly one stage at a time in source transitions', () => {
  const js = readFileSync(new URL('../../harness/m5-exploration/create-map-dialog.js', import.meta.url), 'utf8');
  assert.match(js, /confirm\.hidden = false; form\.hidden = true; actions\.hidden = true;/);
  assert.match(js, /confirm\.hidden = true; form\.hidden = false; actions\.hidden = false;/);
  assert.match(js, /if \(!hasCurrentMap\(\)\) \{ submitCreation\(\); return; \}/);
  assert.match(js, /function syncButtonState\(\)/);
  assert.match(js, /const session = sessionSeq;/);
  assert.match(js, /if \(!open \|\| session !== sessionSeq\) return;/);
  assert.match(js, /if \(session === sessionSeq\) \{ submitting = false; syncButtonState\(\); \}/);
});

