import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../../harness/m4-labels/main.mjs', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../harness/m4-labels/index.html', import.meta.url), 'utf8');
const status = JSON.parse(readFileSync(new URL('../../harness/m4-labels/status.json', import.meta.url), 'utf8'));

test('labels harness integrates graph rendering and explicit label updates', () => {
  assert.match(main, /createLabelOverlay/);
  assert.match(main, /overlay\.update\(/);
  assert.match(main, /drawGraphScene/);
  assert.match(main, /surface\.resize\(/);
  assert.match(main, /#recreate'\)\.addEventListener\('click', recreateAll\)/);
  assert.match(main, /#destroy'\)\.addEventListener\('click', destroyAll\)/);
  assert.match(html, /id="fixture"/);
  assert.match(html, /id="phase"/);
  assert.match(html, /id="dpr-source"/);
});

test('labels harness reports scoped counts/metrics and NOT_RUN browser status', () => {
  assert.match(main, /window\.__M4_LABELS_STATUS__/);
  assert.match(main, /candidateCount:/);
  assert.match(main, /visibleIconCount:/);
  assert.match(main, /textMismatchCount:/);
  assert.match(main, /overlapSuppressedCount:/);
  assert.match(main, /measurement:/);
  assert.equal(status.browserVerification, 'NOT_RUN');
  assert.deepEqual(status.fixtures, ['f20', 'f200']);
  assert.equal(status.maxLabels, 40);
  assert.match(status.measurement, /getBoundingClientRect/);
});
