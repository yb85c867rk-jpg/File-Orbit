import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../../harness/m5-adaptive-layout/main.mjs', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../harness/m5-adaptive-layout/index.html', import.meta.url), 'utf8');
const status = JSON.parse(readFileSync(new URL('../../harness/m5-adaptive-layout/status.json', import.meta.url), 'utf8'));

test('adaptive harness exposes baseline/v1/v2 modes and comparison controls', () => {
  assert.match(main, /applyFixedGlyphPolicy/);
  assert.match(main, /prepareFitFrame/);
  assert.match(main, /buildLayoutPlan/);
  assert.match(main, /layout-builder\.mjs/);
  assert.match(main, /prepareCameraFrame/);
  assert.match(main, /prepareResetFocusFrame/);
  assert.match(main, /executeResetFocus/);
  assert.match(main, /onBeforePublish/);
  assert.match(main, /fitCurrentView\('reset-focus'/);
  assert.match(main, /correction-mode/);
  assert.match(main, /correctionMode/);
  assert.match(main, /labelPolicy/);
  assert.match(main, /correctionAppliedMode/);
  assert.match(main, /labelPolicy/);
  assert.match(main, /refine-v2/);
  assert.match(main, /refinementRequested/);
  assert.match(main, /refinementApplied/);
  assert.match(main, /resolveResizeFraming/);
  assert.match(main, /EXPERIMENTAL_CAMERA_LIMITS/);
  assert.match(main, /framingMode/);
  assert.match(main, /fitProjection/);
  assert.match(main, /currentFrame/);
  assert.match(main, /fitDrawProjectionMatch/);
  assert.match(main, /prepareFitFrame/);
  assert.match(main, /buildLayoutPlan/);
  assert.match(main, /layout-builder\.mjs/);
  assert.match(main, /fitCurrentView\(operation, baseView\)/);
  assert.match(main, /function fitGraph/);
  assert.match(main, /resizePolicy.mode === 'fit'/);
  assert.match(main, /compareLayouts/);
  assert.match(main, /comparePreparedScenes/);
  assert.match(main, /#apply-layout'\)\.addEventListener\('click'/);
  assert.match(html, /id="mode"/);
  assert.match(html, />Experimental v2</);
  assert.match(html, /id="presentation"/);
  assert.match(html, /id="fixture"/);
  assert.match(html, /id="metrics"/);
  assert.match(html, /id="fit-graph"/);
  assert.match(html, /id="refine-v2"/);
  assert.match(html, /id="correction-mode"/);
  assert.match(html, /Local experimental</);
  assert.match(html, /id="label-policy"/);
  assert.match(html, /id="label-policy"/);
  assert.match(html, /Refine v2/);
  assert.equal(status.experimental, true);
  assert.equal(status.browserVerification, 'NOT_RUN');
});

test('adaptive harness status includes modes, metrics, focus, camera, and lifecycle', () => {
  assert.match(main, /window\.__M5_ADAPTIVE_LAYOUT_STATUS__/);
  assert.match(main, /requestedMode/);
  assert.match(main, /displayedMode/);
  assert.match(main, /presentationPolicy/);
  assert.match(main, /workspaceScale/);
  assert.match(main, /feasibilityStale/);
  assert.match(main, /projectionContract/);
  assert.match(main, /projectionBaseRadius/);
  assert.match(main, /compactComparison/);
  assert.match(main, /__M5_ADAPTIVE_LAYOUT_FULL__/);
  assert.match(main, /comparison/);
  assert.match(main, /requestedFocusId/);
  assert.match(main, /requestedCamera/);
  assert.match(main, /radialSpread/);
  assert.match(main, /numericalProbe/);
  assert.match(main, /error:/);
});
















