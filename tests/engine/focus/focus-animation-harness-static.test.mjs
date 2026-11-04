import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../../harness/m5-animation/main.mjs', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../harness/m5-animation/index.html', import.meta.url), 'utf8');
const status = JSON.parse(readFileSync(new URL('../../harness/m5-animation/status.json', import.meta.url), 'utf8'));

test('animation harness has explicit controls, duration, and reduced-motion lookup', () => {
  assert.match(main, /createFocusAnimator/);
  assert.match(main, /#focus-selected'\)\.addEventListener\('click', focusSelected\)/);
  assert.match(main, /#reset-focus'\)\.addEventListener\('click', resetFocus\)/);
  assert.match(main, /prefers-reduced-motion/);
  assert.match(main, /installSelectionFrame/);
  assert.match(main, /cancelRunning\(/);
  assert.match(html, /id="duration"/);
  assert.match(html, /id="focus-selected"/);
  assert.match(html, /id="reset-focus"/);
});

test('animation harness exposes lifecycle/parameters/evidence and NOT_RUN', () => {
  assert.match(main, /window\.__M5_ANIMATION_STATUS__/);
  assert.match(main, /startParameter/);
  assert.match(main, /targetParameter/);
  assert.match(main, /currentParameter/);
  assert.match(main, /pendingFrame/);
  assert.match(main, /animationSkippedReason/);
  assert.match(main, /focusCoordinates/);
  assert.match(main, /lastUserEvent/);
  assert.match(main, /lastProgrammaticEvent/);
  assert.match(main, /numerical-probe/);
  assert.equal(status.browserVerification, 'NOT_RUN');
  assert.deepEqual(status.fixtures, ['f20', 'f200']);
  assert.equal(status.defaultDurationMs, 300);
  assert.equal(status.maxDurationMs, 10000);
});
