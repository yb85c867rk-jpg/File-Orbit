import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const html = readFileSync(fileURLToPath(new URL('../../harness/m5-exploration/index.html', import.meta.url)), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

test('hidden editor fields override the explicit display:grid rule', () => {
  assert.match(css, /\.editor-field\s*\{[^}]*display:\s*grid/);
  assert.match(css, /\.editor-field\[hidden\][^{]*\{[^}]*display:\s*none/);
});
test('other editor containers with explicit display rules also honor hidden', () => {
  assert.match(css, /\.editor-summary\s*\{[^}]*display:\s*grid/);
  assert.match(css, /\.editor-summary\[hidden\][^{]*\{[^}]*display:\s*none/);
  assert.match(css, /\.editor-actions\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.editor-actions\[hidden\][^{]*\{[^}]*display:\s*none/);
  assert.match(css, /#editor-form\[hidden\][^{]*\{[^}]*display:\s*none/);
  assert.match(css, /#editor-prompt\[hidden\][^{]*\{[^}]*display:\s*none/);
  assert.match(css, /\.editor-context-menu\[hidden\][^{]*\{[^}]*display:\s*none/);
});
