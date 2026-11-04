import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../../harness/m5-focus/main.mjs', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../harness/m5-focus/index.html', import.meta.url), 'utf8');
const status = JSON.parse(readFileSync(new URL('../../harness/m5-focus/status.json', import.meta.url), 'utf8'));

test('focus harness has explicit immediate-focus controls and frame sequencing', () => {
  assert.match(main, /createFocusView/);
  assert.match(main, /installSelectionFrame/);
  assert.match(main, /#focus-selected'\)\.addEventListener\('click', focusSelected\)/);
  assert.match(main, /#reset-focus'\)\.addEventListener\('click', resetFocus\)/);
  assert.match(main, /surface\.resize\(/);
  assert.match(main, /controller\.invalidate\(\)/);
  assert.match(html, /id="focus-selected"/);
  assert.match(html, /id="reset-focus"/);
  assert.match(html, /id="recreate"/);
});

test('focus harness reports requested/displayed focus and separates evidence', () => {
  assert.match(main, /window\.__M5_FOCUS_STATUS__/);
  assert.match(main, /requestedFocusId/);
  assert.match(main, /displayedFocusId/);
  assert.match(main, /focusCoordinates/);
  assert.match(main, /focusCoordinateEvidence/);
  assert.match(main, /lastUserEvent/);
  assert.match(main, /lastProgrammaticEvent/);
  assert.match(main, /numerical-probe/);
  assert.equal(status.browserVerification, 'NOT_RUN');
  assert.deepEqual(status.fixtures, ['f20', 'f200']);
  assert.match(status.transformation, /c=-focus/);
  assert.equal(status.centerTolerance, 1e-12);
});

