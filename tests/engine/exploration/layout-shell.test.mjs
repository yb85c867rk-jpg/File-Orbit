import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../harness/m5-exploration/index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../../harness/m5-exploration/main.mjs', import.meta.url), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

test('application root uses viewport grid rows without fixed 64px subtraction', () => {
  assert.match(css, /#app-root \{[^}]*display:\s*grid/);
  assert.match(css, /#app-root \{[^}]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\)/);
  assert.match(css, /body \{[^}]*height:\s*100dvh/);
  assert.match(css, /body \{[^}]*overflow:\s*hidden/);
  assert.doesNotMatch(css, /#layout \{[^}]*calc\(100vh\s*-\s*64px\)/);
  assert.match(css, /#layout \{[^}]*min-height:\s*0/);
  assert.match(css, /#layout \{[^}]*overflow:\s*hidden/);
});
test('graph and details panel constrain overflow independently', () => {
  assert.match(css, /#graph-wrap \{[^}]*min-height:\s*0/);
  assert.match(css, /#graph-wrap \{[^}]*overflow:\s*hidden/);
  assert.match(css, /aside \{[^}]*min-height:\s*0/);
  assert.match(css, /aside \{[^}]*overflow:\s*auto/);
  assert.match(css, /aside \{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /#error \{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.editor-field\[hidden\], \.editor-summary\[hidden\], \.editor-actions\[hidden\] \{ display: none; \}/);
});
test('graph dimensions come from the visible graph-wrap layout container and resize is coalesced', () => {
  assert.match(main, /const viewport = \(\) => \(\{ width: Math\.max\(0, graphViewport\?\.clientWidth \|\| 0\), height: Math\.max\(0, graphViewport\?\.clientHeight \|\| 0\) \}\);/);
  assert.match(main, /new ResizeObserver\(\(\) => scheduleViewportResize\(\)\)/);
  assert.match(main, /resizeObserver\.observe\(graphViewport\)/);
  assert.match(main, /if \(resizeFrame !== null\) return;/);
  assert.match(main, /cancelAnimationFrame\(resizeFrame\)/);
  assert.match(main, /resizeObserver\.disconnect\(\)/);
  assert.match(main, /size\.width === lastViewportSize\.width && size\.height === lastViewportSize\.height/);
  assert.doesNotMatch(main, /window\.scrollTo/);
});

