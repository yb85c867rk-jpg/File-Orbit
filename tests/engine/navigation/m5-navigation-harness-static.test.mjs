import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../../harness/m5-navigation/main.mjs', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../harness/m5-navigation/index.html', import.meta.url), 'utf8');
const status = JSON.parse(readFileSync(new URL('../../harness/m5-navigation/status.json', import.meta.url), 'utf8'));

test('navigation harness integrates camera, labels, selection, and focus controls', () => {
  assert.match(main, /createMouseNavigationController/);
  assert.match(main, /applyCameraToScene/);
  assert.match(main, /createLabelOverlay/);
  assert.match(main, /installSelectionFrame/);
  assert.match(main, /redrawSelectionFrame/);
  assert.match(main, /#zoom-in'\)\.addEventListener\('click'/);
  assert.match(main, /#reset-camera'\)\.addEventListener\('click'/);
  assert.match(main, /#focus-selected'\)\.addEventListener\('click'/);
  assert.match(main, /surface\.resize\(/);
  assert.match(html, /id="reset-camera"/);
  assert.match(html, /id="focus-selected"/);
});

test('navigation harness separates numeric evidence and remains NOT_RUN', () => {
  assert.match(main, /window\.__M5_NAVIGATION_STATUS__/);
  assert.match(main, /requestedCamera/);
  assert.match(main, /displayedCamera/);
  assert.match(main, /cameraOperation/);
  assert.match(main, /numerical-probe/);
  assert.match(main, /numerical-coordinate-probe/);
  assert.match(main, /lastUserEvent/);
  assert.match(main, /lastProgrammaticEvent/);
  assert.equal(status.browserVerification, 'NOT_RUN');
  assert.deepEqual(status.fixtures, ['f20', 'f200']);
  assert.equal(status.camera.minZoom, 0.25);
  assert.equal(status.camera.maxZoom, 8);
  assert.equal(status.camera.dragThresholdCss, 4);
});

