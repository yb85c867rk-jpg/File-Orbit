import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../../harness/m5-selection/main.mjs', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../harness/m5-selection/index.html', import.meta.url), 'utf8');
const status = JSON.parse(readFileSync(new URL('../../harness/m5-selection/status.json', import.meta.url), 'utf8'));

test('selection harness owns canvas/controller and explicit invalidation controls', () => {
  assert.match(main, /createSelectionController/);
  assert.match(main, /createLabelOverlay/);
  assert.match(main, /drawGraphScene/);
  assert.match(main, /controller\.invalidate\(\)/);
  assert.match(main, /installSelectionFrame\(/);
  assert.match(main, /surface\.resize\(/);
  assert.match(html, /id="clear"/);
  assert.match(html, /id="recreate"/);
  assert.match(html, /id="destroy"/);
});

test('selection harness separates numerical probes from user clicks and remains NOT_RUN', () => {
  assert.match(main, /window\.__M5_SELECTION_STATUS__/);
  assert.match(main, /numerical-probe/);
  assert.match(main, /lastEvent/);
  assert.match(main, /kind: clickDerived \? 'user-click' : 'programmatic'/);
  assert.match(main, /selectedName/);
  assert.match(main, /scene generation|generation/);
  assert.equal(status.browserVerification, 'NOT_RUN');
  assert.deepEqual(status.fixtures, ['f20', 'f200']);
  assert.equal(status.hitPadding, 0);
  assert.match(status.numericalProbe, /user-click/);
});




