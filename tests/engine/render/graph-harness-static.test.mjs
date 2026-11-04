import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../../harness/m4-graph/main.mjs', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../harness/m4-graph/index.html', import.meta.url), 'utf8');
const status = JSON.parse(readFileSync(new URL('../../harness/m4-graph/status.json', import.meta.url), 'utf8'));

test('graph harness uses deterministic fixtures, live resize, and static rendering', () => {
  assert.match(main, /f20/);
  assert.match(main, /f200/);
  assert.match(main, /computeRadialLayout/);
  assert.match(main, /prepareGraphScene/);
  assert.match(main, /drawGraphScene/);
  assert.match(main, /surface\.resize\(/);
  assert.match(main, /#recreate'\)\.addEventListener\('click', recreate\)/);
  assert.match(main, /#destroy'\)\.addEventListener\('click', destroy\)/);
  assert.match(html, /id="fixture"/);
  assert.match(html, /id="phase"/);
  assert.match(html, /id="dpr-source"/);
});

test('graph harness status distinguishes expected/observed and browser NOT_RUN', () => {
  assert.match(main, /window\.__M4_GRAPH_STATUS__/);
  assert.match(main, /requested:/);
  assert.match(main, /prepared:/);
  assert.match(main, /drawn:/);
  assert.match(main, /canvasIdentityPreserved/);
  assert.equal(status.browserVerification, 'NOT_RUN');
  assert.deepEqual(status.fixtures, ['f20', 'f200']);
  assert.deepEqual(status.expected.f20, { nodes: 20, edges: 19 });
  assert.deepEqual(status.expected.f200, { nodes: 200, edges: 199 });
});
